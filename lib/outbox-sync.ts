// The queue of new transactions waiting to be appended to the sheet, and the logic that sends
// them. Kept free of runtime imports so `node --test` can load it; the IndexedDB store is in
// lib/outbox.ts and the triggers in hooks/use-outbox-sync.ts.
import type { TransactionInput } from './types'

export type OutboxStatus = 'pending' | 'syncing' | 'failed'

export type OutboxEntry = {
  // Made at save time and written to the TransactionID column, so a retry can tell whether an
  // earlier attempt already added the row
  id: string
  userId: string
  spreadsheetId: string
  // timestamp is the time of saving, not of syncing
  input: TransactionInput
  createdAt: number
  status: OutboxStatus
  // Appends sent so far; above 0 the row may already be in the sheet
  attempts: number
  lastError: string | null
}

// retry: the request didn't complete or the server is struggling, try again later.
// refresh: the access token expired, refresh it and try again.
// access: the app lost access to the spreadsheet, nothing in it can sync.
// failed: this entry was refused, the others may still sync.
export type SyncErrorKind = 'retry' | 'refresh' | 'access' | 'failed'

function statusOf(error: unknown): number | null {
  const status = (error as { status?: unknown } | null)?.status
  return typeof status === 'number' ? status : null
}

export function classifySyncError(error: unknown): SyncErrorKind {
  const status = statusOf(error)
  if (status !== null) {
    if (status === 401) return 'refresh'
    if (status === 403 || status === 404) return 'access'
    if (status >= 500 || status === 408 || status === 429) return 'retry'
    return 'failed'
  }

  // fetch rejects with a TypeError offline, a timeout aborts it, and a captive portal's HTML
  // fails to parse as JSON
  const name = (error as { name?: unknown } | null)?.name
  if (error instanceof TypeError || error instanceof SyntaxError || name === 'TimeoutError' || name === 'AbortError') {
    return 'retry'
  }
  return 'failed'
}

// Oldest first, so rows land in the sheet in the order they were saved. Failed entries wait for
// the user (retry or delete).
export function entriesToSync(entries: OutboxEntry[]): OutboxEntry[] {
  return entries
    .filter((entry) => entry.status !== 'failed')
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
}

const RETRY_BASE_MS = 5_000
const RETRY_MAX_MS = 5 * 60_000

// After the nth failed sync in a row: 5s, 10s, 20s... up to 5 minutes
export function retryDelayMs(failures: number): number {
  return Math.min(RETRY_BASE_MS * 2 ** Math.max(0, failures - 1), RETRY_MAX_MS)
}

export const FORMULA_IDS_MESSAGE = 'The spreadsheet computes TransactionID with a formula, so saved transactions cannot be synced. Update it as described in docs/migrations/stable-transaction-ids.md.'

export interface SyncDeps {
  // The active user's and spreadsheet's entries
  list: () => Promise<OutboxEntry[]>
  put: (entry: OutboxEntry) => Promise<void>
  remove: (id: string) => Promise<void>
  getToken: () => string | null
  // Whether the token was refreshed; on false the user is offline or was signed out
  refresh: () => Promise<boolean>
  // The last known answer, so a sheet known to store IDs isn't asked again when nothing is queued
  knownStoredIds: boolean | null
  hasStoredIds: (token: string) => Promise<boolean>
  onStoredIds: (storedIds: boolean) => void
  // Whether the TransactionID column already holds the ID
  idExists: (token: string, id: string) => Promise<boolean>
  append: (token: string, entry: OutboxEntry) => Promise<void>
}

// done: nothing left to send. retry: try again later. failed: the spreadsheet can't be reached
// (entries marked failed). no-token: offline or signed out, the queue waits for a token.
export type SyncOutcome = 'done' | 'retry' | 'failed' | 'no-token'

export type SyncResult = { outcome: SyncOutcome; synced: number }

class StopSync {
  outcome: SyncOutcome
  error?: unknown
  constructor(outcome: SyncOutcome, error?: unknown) {
    this.outcome = outcome
    this.error = error
  }
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export async function syncOutbox(deps: SyncDeps): Promise<SyncResult> {
  let synced = 0

  // A 401 refreshes the token and tries once more. A refresh that fails offline leaves the queue
  // for later; a rejected one signs the user out, and the entries wait for the next sign-in.
  const withToken = async <T,>(request: (token: string) => Promise<T>): Promise<T> => {
    const token = deps.getToken()
    if (!token) throw new StopSync('no-token')
    try {
      return await request(token)
    } catch (error) {
      if (classifySyncError(error) !== 'refresh') throw error
      if (!await deps.refresh()) throw new StopSync('no-token')
      const nextToken = deps.getToken()
      if (!nextToken) throw new StopSync('no-token')
      try {
        return await request(nextToken)
      } catch (retryError) {
        // A fresh token refused again isn't worth refreshing in a loop
        throw classifySyncError(retryError) === 'refresh' ? new StopSync('retry', retryError) : retryError
      }
    }
  }

  const failAll = async (reason: string) => {
    for (const entry of entriesToSync(await deps.list())) {
      await deps.put({ ...entry, status: 'failed', lastError: reason })
    }
  }

  try {
    const queued = entriesToSync(await deps.list())
    if (queued.length === 0 && deps.knownStoredIds === true) return { outcome: 'done', synced }

    // Checked again each run: a row with an ID written over the formula's column would break it
    const storedIds = await withToken(deps.hasStoredIds)
    deps.onStoredIds(storedIds)
    if (queued.length === 0) return { outcome: 'done', synced }
    if (!storedIds) {
      await failAll(FORMULA_IDS_MESSAGE)
      return { outcome: 'failed', synced }
    }

    // Re-read each time: entries saved meanwhile (in this or another tab) join the run
    for (let next = queued[0]; next; next = entriesToSync(await deps.list())[0]) {
      const entry = next
      // Set once an append may have gone out, so the next attempt checks for the row first
      let sent = false
      try {
        // An earlier attempt may have added the row and lost the response
        if (entry.attempts > 0 && await withToken((token) => deps.idExists(token, entry.id))) {
          await deps.remove(entry.id)
          synced++
          continue
        }

        await deps.put({ ...entry, status: 'syncing', attempts: entry.attempts + 1, lastError: null })
        sent = true
        await withToken((token) => deps.append(token, entry))
        await deps.remove(entry.id)
        synced++
      } catch (error) {
        const stop = error instanceof StopSync ? error : null
        const kind = stop ? stop.outcome : classifySyncError(error)
        const reason = stop && !stop.error ? entry.lastError : messageOf(stop?.error ?? error)
        const attempts = entry.attempts + (sent ? 1 : 0)

        if (kind === 'access') {
          await failAll(reason ?? 'The spreadsheet cannot be reached.')
          return { outcome: 'failed', synced }
        }
        if (kind === 'failed') {
          // Only this entry is refused; the next ones may still go through
          await deps.put({ ...entry, status: 'failed', attempts, lastError: reason })
          continue
        }
        await deps.put({ ...entry, status: 'pending', attempts, lastError: reason })
        return { outcome: kind === 'no-token' ? 'no-token' : 'retry', synced }
      }
    }
    return { outcome: 'done', synced }
  } catch (error) {
    if (error instanceof StopSync) return { outcome: error.outcome, synced }
    const kind = classifySyncError(error)
    if (kind === 'access') {
      await failAll(messageOf(error))
      return { outcome: 'failed', synced }
    }
    if (kind !== 'retry') console.error('Sync failed:', error)
    return { outcome: 'retry', synced }
  }
}
