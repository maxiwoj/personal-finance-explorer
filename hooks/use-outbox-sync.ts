'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/auth-context'
import { useSpreadsheet } from '@/contexts/spreadsheet-context'
import { getKnownStoredIds, listOutboxEntries, onOutboxSyncRequest, putOutboxEntry, removeOutboxEntry, setKnownStoredIds, subscribeOutbox, type OutboxEntry } from '@/lib/outbox'
import { retryDelayMs, syncOutbox } from '@/lib/outbox-sync'
import { appendQueuedTransaction, describeSpreadsheetAccessError, hasStoredIds, SheetsApiError, transactionIdExists } from '@/lib/sheets'

const LOCK_NAME = 'pfe-outbox-sync'
// A request that hangs on a bad connection would hold the sync lock; an append cut off by the
// timeout may still have landed, which the next attempt checks before sending again
const REQUEST_TIMEOUT_MS = 20_000

// One sync at a time across tabs. Without the Web Locks API (iOS before 15.4) only this tab is
// guarded; the ID check before each retry still keeps rows from being added twice.
function withSyncLock<T>(run: () => Promise<T>): Promise<T> {
  if (navigator.locks) {
    return navigator.locks.request(LOCK_NAME, run)
  }
  return run()
}

// A failed entry shows its lastError: Google's own message for a lost spreadsheet ("The caller does
// not have permission") is replaced with what to do about it. A refused append keeps its edit-access
// message (lib/sheets.ts).
function withAccessMessage<T>(request: Promise<T>, { isWrite = false } = {}): Promise<T> {
  return request.catch((error: unknown) => {
    const message = describeSpreadsheetAccessError(error)
    if (!message || !(error instanceof SheetsApiError) || (isWrite && error.status === 403)) throw error
    throw new SheetsApiError(message, error.status)
  })
}

interface OutboxSyncOptions {
  enabled: boolean
  userId: string | null
  spreadsheetId: string | null
  accessToken: string | null
  refreshSession: () => Promise<boolean>
}

// Sends queued transactions on start (once there is a token), when the network comes back, when
// the app becomes visible and on requestOutboxSync(); retries with backoff after a failure
export function useOutboxSync({ enabled, userId, spreadsheetId, accessToken, refreshSession }: OutboxSyncOptions) {
  const queryClient = useQueryClient()
  const tokenRef = useRef(accessToken)
  tokenRef.current = accessToken

  useEffect(() => {
    if (!enabled || !userId || !spreadsheetId || !accessToken) return
    let active = true
    let running = false
    let again = false
    let failures = 0
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    // The token refreshed during a sync, before the new one reaches tokenRef
    let refreshedToken: string | null = null

    const run = async (): Promise<void> => {
      // The online event starts it once the network is back
      if (!navigator.onLine) return
      if (running) {
        again = true
        return
      }
      running = true
      if (retryTimer) clearTimeout(retryTimer)
      retryTimer = null

      try {
        const result = await withSyncLock(async () => !active ? null : syncOutbox({
          list: () => listOutboxEntries(userId, spreadsheetId),
          put: putOutboxEntry,
          remove: removeOutboxEntry,
          getToken: () => refreshedToken ?? tokenRef.current,
          refresh: async () => {
            const refreshed = await refreshSession()
            refreshedToken = refreshed ? localStorage.getItem('pfe_access_token') : null
            return refreshed
          },
          knownStoredIds: getKnownStoredIds(spreadsheetId),
          hasStoredIds: (token) => withAccessMessage(hasStoredIds(token, spreadsheetId, AbortSignal.timeout(REQUEST_TIMEOUT_MS))),
          onStoredIds: (storedIds) => setKnownStoredIds(spreadsheetId, storedIds),
          idExists: (token, id) => withAccessMessage(transactionIdExists(token, spreadsheetId, id, AbortSignal.timeout(REQUEST_TIMEOUT_MS))),
          append: (token, entry) => withAccessMessage(appendQueuedTransaction(token, spreadsheetId, entry.input, entry.id, AbortSignal.timeout(REQUEST_TIMEOUT_MS)), { isWrite: true }),
        }))
        refreshedToken = null
        if (!result) return

        // The new rows show once the transactions refetch; a new row can change the earliest date
        if (result.synced > 0) {
          void queryClient.invalidateQueries({ queryKey: ['recent-transactions', 'google'] })
          void queryClient.invalidateQueries({ queryKey: ['full-transactions', 'google'] })
          void queryClient.invalidateQueries({ queryKey: ['rates-start', 'google'] })
        }

        if (result.outcome === 'retry') {
          failures++
          if (active) retryTimer = setTimeout(() => void run(), retryDelayMs(failures))
        } else {
          failures = 0
        }
      } catch (error) {
        console.error('Failed to sync saved transactions:', error)
      } finally {
        running = false
      }

      if (again && active) {
        again = false
        await run()
      }
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void run()
    }
    const onOnline = () => {
      failures = 0
      void run()
    }

    void run()
    window.addEventListener('online', onOnline)
    document.addEventListener('visibilitychange', onVisibilityChange)
    const stopRequests = onOutboxSyncRequest(() => void run())

    return () => {
      active = false
      if (retryTimer) clearTimeout(retryTimer)
      window.removeEventListener('online', onOnline)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      stopRequests()
    }
  }, [accessToken, enabled, queryClient, refreshSession, spreadsheetId, userId])
}

// The signed-in user's queued transactions for the active spreadsheet, oldest first, kept up to
// date across tabs; empty until read, and outside Google mode
export function useOutboxEntries(): OutboxEntry[] {
  const { mode, userId: authUserId } = useAuth()
  const { spreadsheet } = useSpreadsheet()
  const userId = mode === 'google' ? authUserId : null
  const spreadsheetId = spreadsheet?.id ?? null
  const [entries, setEntries] = useState<OutboxEntry[]>([])

  useEffect(() => {
    if (!userId || !spreadsheetId) {
      setEntries([])
      return
    }
    let active = true
    const read = () => {
      listOutboxEntries(userId, spreadsheetId)
        .then((next) => { if (active) setEntries(next) })
        .catch((error) => console.error('Failed to read saved transactions:', error))
    }
    read()
    const unsubscribe = subscribeOutbox(read)
    return () => {
      active = false
      unsubscribe()
    }
  }, [spreadsheetId, userId])

  return entries
}

function subscribeOnline(listener: () => void) {
  window.addEventListener('online', listener)
  window.addEventListener('offline', listener)
  return () => {
    window.removeEventListener('online', listener)
    window.removeEventListener('offline', listener)
  }
}

// navigator.onLine, re-read on the online and offline events
export function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true)
}
