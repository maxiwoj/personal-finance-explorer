import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { classifySyncError, entriesToSync, FORMULA_IDS_MESSAGE, retryDelayMs, syncOutbox, type OutboxEntry, type SyncDeps } from '../lib/outbox-sync.ts'

class HttpError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

function entry(id: string, createdAt: number, overrides: Partial<OutboxEntry> = {}): OutboxEntry {
  return {
    id,
    userId: 'u1',
    spreadsheetId: 'sheet1',
    input: { timestamp: new Date(createdAt), what: id, category: 'food', amount: 10, currency: 'PLN' },
    createdAt,
    status: 'pending',
    attempts: 0,
    lastError: null,
    ...overrides,
  }
}

// An in-memory queue and sheet. append can be made to fail, or to add the row and then fail,
// like a response lost after the sheet applied the append.
function setup(entries: OutboxEntry[], options: {
  rows?: string[]
  storedIds?: boolean
  append?: (token: string, entry: OutboxEntry, rows: string[]) => Promise<void>
  refresh?: () => Promise<boolean>
} = {}) {
  const queue = new Map(entries.map((e) => [e.id, e]))
  const rows = options.rows ?? []
  let token: string | null = 'token'
  const calls = { append: 0, idExists: 0, refresh: 0 }
  let storedIdsSeen: boolean | null = null

  const deps: SyncDeps = {
    list: async () => [...queue.values()],
    put: async (e) => { queue.set(e.id, e) },
    remove: async (id) => { queue.delete(id) },
    getToken: () => token,
    refresh: async () => {
      calls.refresh++
      const ok = options.refresh ? await options.refresh() : true
      token = ok ? 'fresh' : null
      return ok
    },
    knownStoredIds: null,
    hasStoredIds: async () => options.storedIds ?? true,
    onStoredIds: (storedIds) => { storedIdsSeen = storedIds },
    idExists: async (_token, id) => {
      calls.idExists++
      return rows.includes(id)
    },
    append: async (t, e) => {
      calls.append++
      if (options.append) return options.append(t, e, rows)
      rows.push(e.id)
    },
  }
  return { deps, queue, rows, calls, storedIdsSeen: () => storedIdsSeen, setToken: (t: string | null) => { token = t } }
}

describe('classifySyncError', () => {
  it('retries when the request did not complete or the server is struggling', () => {
    assert.equal(classifySyncError(new TypeError('Failed to fetch')), 'retry')
    assert.equal(classifySyncError(new DOMException('The operation timed out.', 'TimeoutError')), 'retry')
    assert.equal(classifySyncError(new SyntaxError('Unexpected token <')), 'retry')
    for (const status of [500, 502, 503, 504, 408, 429]) {
      assert.equal(classifySyncError(new HttpError('x', status)), 'retry', `status ${status}`)
    }
  })

  it('refreshes the token on a 401', () => {
    assert.equal(classifySyncError(new HttpError('x', 401)), 'refresh')
  })

  it('stops on lost access to the spreadsheet', () => {
    assert.equal(classifySyncError(new HttpError('x', 403)), 'access')
    assert.equal(classifySyncError(new HttpError('x', 404)), 'access')
  })

  it('fails only the entry on other refusals', () => {
    assert.equal(classifySyncError(new HttpError('bad range', 400)), 'failed')
    assert.equal(classifySyncError(new Error('something else')), 'failed')
  })
})

describe('entriesToSync', () => {
  it('sends the oldest first and skips failed entries', () => {
    const queue = [entry('c', 3), entry('a', 1), entry('f', 0, { status: 'failed' }), entry('b', 2, { status: 'syncing' })]
    assert.deepEqual(entriesToSync(queue).map((e) => e.id), ['a', 'b', 'c'])
  })

  it('orders entries saved in the same millisecond by ID', () => {
    assert.deepEqual(entriesToSync([entry('y', 1), entry('x', 1)]).map((e) => e.id), ['x', 'y'])
  })
})

describe('retryDelayMs', () => {
  it('doubles from 5 seconds up to 5 minutes', () => {
    assert.deepEqual([1, 2, 3, 4].map(retryDelayMs), [5000, 10000, 20000, 40000])
    assert.equal(retryDelayMs(20), 300000)
  })
})

describe('syncOutbox', () => {
  it('appends every queued entry once, oldest first, with its own ID', async () => {
    const { deps, queue, rows } = setup([entry('c', 3), entry('a', 1), entry('b', 2)])
    const result = await syncOutbox(deps)

    assert.deepEqual(result, { outcome: 'done', synced: 3 })
    assert.deepEqual(rows, ['a', 'b', 'c'])
    assert.equal(queue.size, 0)
  })

  it('does not append again when an earlier attempt added the row and lost the response', async () => {
    let lose = true
    const { deps, queue, rows, calls } = setup([entry('a', 1)], {
      append: async (_token, e, sheet) => {
        sheet.push(e.id)
        if (lose) {
          lose = false
          throw new TypeError('Failed to fetch')
        }
      },
    })

    assert.equal((await syncOutbox(deps)).outcome, 'retry')
    assert.equal(queue.get('a')?.status, 'pending')
    assert.equal(queue.get('a')?.attempts, 1)

    assert.deepEqual(await syncOutbox(deps), { outcome: 'done', synced: 1 })
    assert.deepEqual(rows, ['a'])
    assert.equal(calls.append, 1)
    assert.equal(queue.size, 0)
  })

  it('checks for the row after an attempt interrupted mid-request (left as syncing)', async () => {
    const { deps, rows, calls } = setup([entry('a', 1, { status: 'syncing', attempts: 1 })], { rows: ['a'] })
    assert.deepEqual(await syncOutbox(deps), { outcome: 'done', synced: 1 })
    assert.deepEqual(rows, ['a'])
    assert.equal(calls.append, 0)
  })

  it('sends a first attempt without the ID check', async () => {
    const { deps, calls } = setup([entry('a', 1)])
    await syncOutbox(deps)
    assert.equal(calls.idExists, 0)
  })

  it('keeps the queue offline and stops at the first entry', async () => {
    const { deps, queue, calls } = setup([entry('a', 1), entry('b', 2)], {
      append: async () => { throw new TypeError('Failed to fetch') },
    })

    assert.deepEqual(await syncOutbox(deps), { outcome: 'retry', synced: 0 })
    assert.equal(calls.append, 1)
    assert.equal(queue.get('a')?.status, 'pending')
    assert.equal(queue.get('a')?.lastError, 'Failed to fetch')
    assert.equal(queue.get('b')?.attempts, 0)
  })

  it('retries later on a 5xx or 429', async () => {
    for (const status of [503, 429]) {
      const { deps, queue } = setup([entry('a', 1)], { append: async () => { throw new HttpError('busy', status) } })
      assert.equal((await syncOutbox(deps)).outcome, 'retry')
      assert.equal(queue.get('a')?.status, 'pending')
    }
  })

  it('waits for a token without sending anything', async () => {
    const { deps, setToken, calls, queue } = setup([entry('a', 1)])
    setToken(null)
    assert.deepEqual(await syncOutbox(deps), { outcome: 'no-token', synced: 0 })
    assert.equal(calls.append, 0)
    assert.equal(queue.get('a')?.status, 'pending')
  })

  it('refreshes the token on a 401 and sends with the new one', async () => {
    const { deps, rows, calls } = setup([entry('a', 1)], {
      append: async (token, e, sheet) => {
        if (token !== 'fresh') throw new HttpError('expired', 401)
        sheet.push(e.id)
      },
    })

    assert.deepEqual(await syncOutbox(deps), { outcome: 'done', synced: 1 })
    assert.equal(calls.refresh, 1)
    assert.deepEqual(rows, ['a'])
  })

  it('keeps the entry pending when the refresh fails, and checks for the row next time', async () => {
    const { deps, queue } = setup([entry('a', 1)], {
      append: async () => { throw new HttpError('expired', 401) },
      refresh: async () => false,
    })

    assert.equal((await syncOutbox(deps)).outcome, 'no-token')
    assert.equal(queue.get('a')?.status, 'pending')
    assert.equal(queue.get('a')?.attempts, 1)
  })

  it('does not refresh in a loop when the new token is refused too', async () => {
    const { deps, calls } = setup([entry('a', 1)], { append: async () => { throw new HttpError('expired', 401) } })
    assert.equal((await syncOutbox(deps)).outcome, 'retry')
    assert.equal(calls.refresh, 1)
  })

  it('marks every entry failed when access to the spreadsheet is lost, without retrying', async () => {
    const { deps, queue, calls } = setup([entry('a', 1), entry('b', 2)], {
      append: async () => { throw new HttpError('You need edit access to this spreadsheet to save transactions.', 403) },
    })

    assert.deepEqual(await syncOutbox(deps), { outcome: 'failed', synced: 0 })
    assert.equal(calls.append, 1)
    for (const id of ['a', 'b']) {
      assert.equal(queue.get(id)?.status, 'failed')
      assert.equal(queue.get(id)?.lastError, 'You need edit access to this spreadsheet to save transactions.')
    }

    // A later run has nothing to send
    assert.deepEqual(await syncOutbox(deps), { outcome: 'done', synced: 0 })
    assert.equal(calls.append, 1)
  })

  it('fails only the refused entry and sends the next ones', async () => {
    const { deps, queue, rows } = setup([entry('a', 1), entry('b', 2)], {
      append: async (_token, e, sheet) => {
        if (e.id === 'a') throw new HttpError('Invalid value', 400)
        sheet.push(e.id)
      },
    })

    assert.deepEqual(await syncOutbox(deps), { outcome: 'done', synced: 1 })
    assert.equal(queue.get('a')?.status, 'failed')
    assert.equal(queue.get('a')?.lastError, 'Invalid value')
    assert.deepEqual(rows, ['b'])
  })

  it('fails the queue when the sheet computes TransactionID with a formula', async () => {
    const { deps, queue, calls, storedIdsSeen } = setup([entry('a', 1)], { storedIds: false })
    assert.deepEqual(await syncOutbox(deps), { outcome: 'failed', synced: 0 })
    assert.equal(queue.get('a')?.lastError, FORMULA_IDS_MESSAGE)
    assert.equal(calls.append, 0)
    assert.equal(storedIdsSeen(), false)
  })

  it('reads whether the sheet stores IDs when it is not known, even with nothing queued', async () => {
    const { deps, storedIdsSeen } = setup([])
    assert.deepEqual(await syncOutbox(deps), { outcome: 'done', synced: 0 })
    assert.equal(storedIdsSeen(), true)
  })

  it('makes no request when nothing is queued and the sheet is known to store IDs', async () => {
    const { deps, storedIdsSeen } = setup([])
    deps.knownStoredIds = true
    deps.hasStoredIds = async () => { throw new Error('unexpected request') }
    assert.deepEqual(await syncOutbox(deps), { outcome: 'done', synced: 0 })
    assert.equal(storedIdsSeen(), null)
  })

  it('sends entries saved while the sync runs', async () => {
    const setupResult = setup([entry('a', 1)])
    const { deps, queue, rows } = setupResult
    const append = deps.append
    deps.append = async (token, e) => {
      await append(token, e)
      if (e.id === 'a') queue.set('b', entry('b', 2))
    }

    assert.deepEqual(await syncOutbox(deps), { outcome: 'done', synced: 2 })
    assert.deepEqual(rows, ['a', 'b'])
  })

  it('syncs three transactions saved offline once back online, with their IDs and timestamps', async () => {
    const saved = [entry('a', 1000), entry('b', 2000), entry('c', 3000)]
    let online = false
    const sheet: { id: string; timestamp: number }[] = []
    const { deps, queue } = setup(saved, {
      append: async (_token, e) => {
        if (!online) throw new TypeError('Failed to fetch')
        sheet.push({ id: e.id, timestamp: e.input.timestamp.getTime() })
      },
    })
    deps.idExists = async (_token, id) => sheet.some((row) => row.id === id)

    assert.equal((await syncOutbox(deps)).outcome, 'retry')
    assert.equal(queue.size, 3)

    online = true
    assert.deepEqual(await syncOutbox(deps), { outcome: 'done', synced: 3 })
    assert.deepEqual(sheet, [{ id: 'a', timestamp: 1000 }, { id: 'b', timestamp: 2000 }, { id: 'c', timestamp: 3000 }])
  })
})
