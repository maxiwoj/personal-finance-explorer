import { openDB, type IDBPDatabase } from 'idb'
import type { OutboxEntry } from './outbox-sync'
import type { TransactionInput } from './types'

export type { OutboxEntry, OutboxStatus } from './outbox-sync'

// Its own database, not the cache's: clearCache() on sign-out must not delete unsynced
// transactions, and the cache's DB version stays untouched
const DB_NAME = 'finance-explorer-outbox'
const DB_VERSION = 1
const STORE = 'entries'
const SCOPE_INDEX = 'scope'
const CHANNEL_NAME = 'pfe-outbox'
const STORED_IDS_PREFIX = 'pfe_stored_ids:'

interface OutboxDB {
  entries: {
    key: string
    value: OutboxEntry
    indexes: { scope: [string, string] }
  }
}

let dbPromise: Promise<IDBPDatabase<OutboxDB>> | null = null

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<OutboxDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' })
        store.createIndex(SCOPE_INDEX, ['userId', 'spreadsheetId'])
      },
    })
  }
  return dbPromise
}

const listeners = new Set<() => void>()
let channel: BroadcastChannel | null | undefined

function getChannel() {
  if (channel === undefined) {
    channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CHANNEL_NAME)
    channel?.addEventListener('message', () => listeners.forEach((listener) => listener()))
  }
  return channel
}

// Tells this tab's and the other tabs' subscribers to re-read the queue
function notifyChanged() {
  listeners.forEach((listener) => listener())
  getChannel()?.postMessage('changed')
}

// Called after any change to the queue, in this tab or another; returns the unsubscribe
export function subscribeOutbox(listener: () => void): () => void {
  getChannel()
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

// The user's entries for the spreadsheet, oldest first
export async function listOutboxEntries(userId: string, spreadsheetId: string): Promise<OutboxEntry[]> {
  const db = await getDB()
  const entries = await db.getAllFromIndex(STORE, SCOPE_INDEX, [userId, spreadsheetId])
  return entries.sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
}

export async function putOutboxEntry(entry: OutboxEntry): Promise<void> {
  const db = await getDB()
  await db.put(STORE, entry)
  notifyChanged()
}

export async function removeOutboxEntry(id: string): Promise<void> {
  const db = await getDB()
  await db.delete(STORE, id)
  notifyChanged()
}

let persistRequested = false

// Asks once per session to keep the queue when the browser clears storage under pressure
function requestPersistentStorage() {
  if (persistRequested) return
  persistRequested = true
  void navigator.storage?.persist?.().catch(() => undefined)
}

export async function enqueueTransaction(userId: string, spreadsheetId: string, input: TransactionInput): Promise<OutboxEntry> {
  const entry: OutboxEntry = {
    id: crypto.randomUUID(),
    userId,
    spreadsheetId,
    input,
    createdAt: Date.now(),
    status: 'pending',
    attempts: 0,
    lastError: null,
  }
  await putOutboxEntry(entry)
  requestPersistentStorage()
  return entry
}

// Whether the spreadsheet's TransactionID column holds stored values (not a formula), as last
// read from it; null when never read on this device
export function getKnownStoredIds(spreadsheetId: string): boolean | null {
  const value = localStorage.getItem(`${STORED_IDS_PREFIX}${spreadsheetId}`)
  return value === null ? null : value === 'true'
}

export function setKnownStoredIds(spreadsheetId: string, storedIds: boolean) {
  localStorage.setItem(`${STORED_IDS_PREFIX}${spreadsheetId}`, String(storedIds))
}

const SYNC_REQUEST_EVENT = 'pfe-outbox-sync-request'

// Starts a sync now, e.g. right after saving or from a "Sync" button (hooks/use-outbox-sync.ts)
export function requestOutboxSync() {
  window.dispatchEvent(new Event(SYNC_REQUEST_EVENT))
}

export function onOutboxSyncRequest(listener: () => void): () => void {
  window.addEventListener(SYNC_REQUEST_EVENT, listener)
  return () => window.removeEventListener(SYNC_REQUEST_EVENT, listener)
}
