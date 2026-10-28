import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { OutboxEntry } from '../lib/outbox-sync.ts'
import { estimateAmountPLN, isStalled, leftQueue, mergeOutbox } from '../lib/outbox-view.ts'
import type { CurrencyList, Transaction } from '../lib/types.ts'

function entry(id: string, overrides: Partial<OutboxEntry> = {}, input: Partial<OutboxEntry['input']> = {}): OutboxEntry {
  return {
    id,
    userId: 'u1',
    spreadsheetId: 'sheet1',
    input: { timestamp: new Date(2026, 9, 28, 12), what: id, category: 'Food', amount: 10, currency: 'PLN', ...input },
    createdAt: 1,
    status: 'pending',
    attempts: 0,
    lastError: null,
    ...overrides,
  }
}

function row(transactionId: string, currency = 'PLN', amountOriginal = 10, amountPLN = 10, timestamp = new Date(2026, 9, 1)): Transaction {
  return { timestamp, what: transactionId, category: 'food', amountOriginal, currency, amountPLN, monthYear: '10_2026', monthName: '', transactionId }
}

const currencies: CurrencyList = {
  defaultCurrency: 'PLN',
  currencies: [
    { code: 'PLN', column: 0, kind: 'standard', multiplier: null, isDefault: true },
    { code: 'EUR', column: 2, kind: 'standard', multiplier: null, isDefault: false },
    { code: 'JOINT', column: 4, kind: 'custom', multiplier: 0.5, isDefault: false },
  ],
}

describe('mergeOutbox', () => {
  it('adds queued entries marked unsynced, with the failure reason', () => {
    const merged = mergeOutbox([row('a')], [entry('q1'), entry('q2', { status: 'failed', lastError: 'No access' })], [], 'PLN', currencies)
    assert.deepEqual(merged.map((t) => t.transactionId), ['a', 'q1', 'q2'])
    assert.deepEqual(merged[1].unsynced, { status: 'pending', error: null })
    assert.deepEqual(merged[2].unsynced, { status: 'failed', error: 'No access' })
    assert.equal(merged[1].category, 'food')
    assert.equal(merged[1].monthYear, '10_2026')
  })

  it('shows a synced entry unmarked until its row is loaded, and never twice', () => {
    const waiting = mergeOutbox([row('a')], [], [entry('s1')], 'PLN', currencies)
    assert.deepEqual(waiting.map((t) => t.transactionId), ['a', 's1'])
    assert.equal(waiting[1].unsynced, undefined)

    const loaded = mergeOutbox([row('a'), row('s1')], [], [entry('s1')], 'PLN', currencies)
    assert.deepEqual(loaded.map((t) => t.transactionId), ['a', 's1'])

    // Its row came in before the queue was re-read
    const both = mergeOutbox([row('q1')], [entry('q1')], [entry('q1')], 'PLN', currencies)
    assert.deepEqual(both.map((t) => t.transactionId), ['q1'])
    assert.equal(both[0].unsynced, undefined)
  })

  it('returns the same array when nothing is queued', () => {
    const transactions = [row('a')]
    assert.equal(mergeOutbox(transactions, [], [], 'PLN', currencies), transactions)
  })
})

describe('estimateAmountPLN', () => {
  it('keeps the default currency, applies a custom multiplier, else the latest row rate', () => {
    assert.equal(estimateAmountPLN(entry('x'), [], 'PLN', currencies), 10)
    assert.equal(estimateAmountPLN(entry('x', {}, { currency: 'JOINT', amount: 9 }), [], 'PLN', currencies), 4.5)
    const rows = [row('old', 'EUR', 10, 40, new Date(2026, 0, 1)), row('new', 'EUR', 10, 43, new Date(2026, 8, 1))]
    assert.equal(estimateAmountPLN(entry('x', {}, { currency: 'EUR', amount: 2 }), rows, 'PLN', currencies), 8.6)
  })

  it('is 0 for a currency with no rate known', () => {
    assert.equal(estimateAmountPLN(entry('x', {}, { currency: 'USD' }), [row('a')], 'PLN', currencies), 0)
  })
})

describe('leftQueue', () => {
  it('lists entries the sync removed, not deleted failed ones', () => {
    const previous = [entry('a', { status: 'syncing' }), entry('b', { status: 'failed' }), entry('c')]
    assert.deepEqual(leftQueue(previous, [entry('c')]).map((e) => e.id), ['a'])
  })
})

describe('isStalled', () => {
  it('is quiet for a new entry syncing online', () => {
    assert.equal(isStalled(entry('a', { status: 'syncing', attempts: 1 }), true), false)
    assert.equal(isStalled(entry('a'), false), true)
    assert.equal(isStalled(entry('a', { lastError: 'timeout' }), true), true)
    assert.equal(isStalled(entry('a', { status: 'failed' }), true), true)
  })
})
