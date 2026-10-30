import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { PersistedClient } from '@tanstack/react-query-persist-client'
import { persistScopeKey, shouldPersistQuery, withoutErrors } from '../lib/query-persistence.ts'

describe('persistScopeKey', () => {
  it('differs per user and per spreadsheet', () => {
    const keys = new Set([
      persistScopeKey('user-a', 'sheet-1'),
      persistScopeKey('user-a', 'sheet-2'),
      persistScopeKey('user-b', 'sheet-1'),
    ])
    assert.equal(keys.size, 3)
  })
})

describe('shouldPersistQuery', () => {
  it('keeps the data the app shows first', () => {
    for (const name of ['categories', 'currencies', 'rates-start', 'recent-transactions', 'full-transactions', 'recurring-payments']) {
      assert.equal(shouldPersistQuery([name, 'google', 'sheet-1'], true, 'sheet-1'), true, name)
    }
  })

  it('skips queries without data', () => {
    assert.equal(shouldPersistQuery(['categories', 'google', 'sheet-1'], false, 'sheet-1'), false)
  })

  it("skips another spreadsheet's queries and demo data", () => {
    assert.equal(shouldPersistQuery(['categories', 'google', 'sheet-2'], true, 'sheet-1'), false)
    assert.equal(shouldPersistQuery(['categories', 'demo', null], true, 'sheet-1'), false)
  })

  it('skips queries that are not listed', () => {
    assert.equal(shouldPersistQuery(['something-else', 'google', 'sheet-1'], true, 'sheet-1'), false)
  })
})

describe('withoutErrors', () => {
  it('stores a query whose refetch failed as its last data', () => {
    const timestamp = new Date('2026-10-01T10:00:00Z')
    const client = {
      buster: 'v1',
      timestamp: 1,
      clientState: {
        mutations: [],
        queries: [{
          queryKey: ['recent-transactions', 'google', 'sheet-1'],
          queryHash: 'hash',
          state: {
            data: [{ timestamp }],
            dataUpdateCount: 1,
            dataUpdatedAt: 100,
            error: new Error('Not authenticated'),
            errorUpdateCount: 1,
            errorUpdatedAt: 200,
            fetchFailureCount: 2,
            fetchFailureReason: new Error('Not authenticated'),
            fetchMeta: null,
            isInvalidated: false,
            status: 'error',
            fetchStatus: 'fetching',
          },
        }],
      },
    } as unknown as PersistedClient

    const [query] = withoutErrors(client).clientState.queries
    assert.equal(query.state.status, 'success')
    assert.equal(query.state.error, null)
    assert.equal(query.state.fetchFailureReason, null)
    assert.equal(query.state.fetchStatus, 'idle')
    assert.equal(query.state.dataUpdatedAt, 100)
    assert.equal((query.state.data as { timestamp: Date }[])[0].timestamp, timestamp)
  })
})
