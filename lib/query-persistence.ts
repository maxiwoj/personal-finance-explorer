import type { PersistedClient } from '@tanstack/react-query-persist-client'

// Bump when the shape of cached data changes (Transaction, CategoryDefinition, CurrencyList,
// RatesStart): a cache written by an older version is then dropped instead of misread
export const PERSIST_BUSTER = 'v1'
export const PERSIST_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

// What the Add form, the dashboard and the transaction pages need to show before the network answers
const PERSISTED_QUERIES = ['categories', 'currencies', 'rates-start', 'recent-transactions', 'full-transactions']

// One cache per Google user and spreadsheet, so nobody sees another's data
export function persistScopeKey(userId: string, spreadsheetId: string) {
  return `${userId}:${spreadsheetId}`
}

// Query keys are [name, mode, sourceId]. A query whose last refetch failed (e.g. offline) is
// kept: its data is still the last known one.
export function shouldPersistQuery(queryKey: readonly unknown[], hasData: boolean, spreadsheetId: string) {
  const [name, mode, sourceId] = queryKey
  return hasData && mode === 'google' && sourceId === spreadsheetId && PERSISTED_QUERIES.includes(name as string)
}

// Stored as data, not as a failed fetch: errors are dropped, so a restored query shows its data
// and refetches in the background like any other stale query
export function withoutErrors(client: PersistedClient): PersistedClient {
  return {
    ...client,
    clientState: {
      ...client.clientState,
      queries: client.clientState.queries.map((query) => ({
        ...query,
        state: { ...query.state, status: 'success', error: null, fetchFailureCount: 0, fetchFailureReason: null, fetchStatus: 'idle' },
      })),
    },
  }
}
