import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isConfigTrue, NOT_SAMPLE_MESSAGE, parseConfigRows, planSampleDataClear, type SampleDataRows } from '../lib/sheet-config.ts'

const TABS = { config: 'config', expenses: 'expenses', recurring: 'recurring', categories: 'categories' }
const EXPENSES_HEADER = ['Timestamp', 'What', 'Category', 'Amount', 'Currency', 'AmountPLN', 'MonthYear', 'TransactionID', 'Notes', 'ReturnOf', 'Recurring']
const expense = (id: string) => ['15/03/2025 10:30:00', 'Coffee', 'food', '12', 'PLN', '12', '3_2025', id]
const payment = (id: string) => [id, 'Rent', 'housing', '2000', 'PLN', '1', 'month', '2025-01-01', '2025-04-01', '']

function sheets(overrides: Partial<SampleDataRows> = {}): SampleDataRows {
  return {
    config: [['Key', 'Value', 'Note'], ['templateSample', 'TRUE', 'sample data']],
    expenses: [EXPENSES_HEADER, expense('sample-1'), expense('sample-2')],
    recurring: [['ID'], payment('sample-r1')],
    categories: [['Category', 'Color', 'Hidden'], ['food', '#ff0000'], ['housing']],
    ...overrides,
  }
}

describe('parseConfigRows', () => {
  it('reads key/value rows, skipping the header, blank keys and repeated keys', () => {
    assert.deepEqual(parseConfigRows([['Key', 'Value'], [' schemaVersion ', ' 3 '], ['', 'x'], ['schemaVersion', '4'], ['flag']]), { schemaVersion: '3', flag: '' })
  })

  it('keeps the first row when it is not a header', () => {
    assert.deepEqual(parseConfigRows([['templateSample', 'TRUE']]), { templateSample: 'TRUE' })
  })
})

describe('isConfigTrue', () => {
  it('accepts TRUE, yes and 1 only', () => {
    assert.deepEqual(['TRUE', 'true', ' yes ', '1', 'FALSE', '', 'no', undefined].map(isConfigTrue), [true, true, true, true, false, false, false, false])
  })
})

describe('planSampleDataClear', () => {
  it('clears input columns, recurring rows, categories and the marker of a sample sheet', () => {
    assert.deepEqual(planSampleDataClear(sheets(), TABS), {
      ok: true,
      counts: { transactions: 2, recurring: 1, categories: 2 },
      ranges: ['expenses!A2:E3', 'expenses!H2:K3', 'recurring!A2:J2', 'categories!A2:C3', 'config!A2:C2'],
    })
  })

  it('is refused without the marker, or with it set to FALSE', () => {
    assert.deepEqual(planSampleDataClear(sheets({ config: null }), TABS), { ok: false, reason: NOT_SAMPLE_MESSAGE })
    assert.deepEqual(planSampleDataClear(sheets({ config: [['templateSample', 'FALSE']] }), TABS), { ok: false, reason: NOT_SAMPLE_MESSAGE })
  })

  it('is refused when a transaction or recurring payment was added by the user', () => {
    const plan = planSampleDataClear(sheets({
      expenses: [EXPENSES_HEADER, expense('sample-1'), expense('0b6c2c4e-uuid'), expense('')],
      recurring: [['ID'], payment('sample-r1'), payment('3f1e-uuid')],
    }), TABS)
    assert.equal(plan.ok, false)
    assert.match(!plan.ok ? plan.reason : '', /2 transactions and 1 recurring payment that aren't sample data/)
  })

  it('ignores rows holding only formula output in F:G', () => {
    const plan = planSampleDataClear(sheets({ expenses: [EXPENSES_HEADER, expense('sample-1'), ['', '', '', '', '', '0', '']] }), TABS)
    assert.equal(plan.ok && plan.counts.transactions, 1)
  })

  it('skips tabs that are missing or empty', () => {
    assert.deepEqual(planSampleDataClear(sheets({ expenses: [EXPENSES_HEADER], recurring: null, categories: null }), TABS), {
      ok: true,
      counts: { transactions: 0, recurring: 0, categories: 0 },
      ranges: ['config!A2:C2'],
    })
  })
})
