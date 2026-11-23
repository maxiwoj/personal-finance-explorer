import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isConfigTrue, NOT_SAMPLE_MESSAGE, parseConfigRows, planSampleDataClear, sampleDataRequests, type SampleDataRows } from '../lib/sheet-config.ts'

const EXPENSES_HEADER = ['Timestamp', 'What', 'Category', 'Amount', 'Currency', 'AmountPLN', 'MonthYear', 'TransactionID', 'Notes', 'ReturnOf', 'Recurring']
const expense = (id: string, returnOf = '', link = '') => ['15/03/2025 10:30:00', 'Coffee', 'food', '12', 'PLN', '12', '3_2025', id, '', returnOf, link]
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
  it('deletes every sample row, empties the categories and removes the marker of an untouched copy', () => {
    assert.deepEqual(planSampleDataClear(sheets()), {
      ok: true,
      counts: { transactions: 2, recurring: 1, categories: 2, keptTransactions: 0, keptRecurring: 0 },
      changes: { deleteExpenseRows: [2, 3], deleteRecurringRows: [2], clearCategoryRows: [2, 3], clearConfigRows: [2] },
    })
  })

  it('is refused without the marker, or with it set to FALSE', () => {
    assert.deepEqual(planSampleDataClear(sheets({ config: null })), { ok: false, reason: NOT_SAMPLE_MESSAGE })
    assert.deepEqual(planSampleDataClear(sheets({ config: [['templateSample', 'FALSE']] })), { ok: false, reason: NOT_SAMPLE_MESSAGE })
  })

  it("keeps the user's transactions, recurring payments and the categories", () => {
    const plan = planSampleDataClear(sheets({
      expenses: [EXPENSES_HEADER, expense('sample-1'), expense('0b6c-uuid'), expense('sample-2'), expense('')],
      recurring: [['ID'], payment('3f1e-uuid'), payment('sample-r1')],
    }))
    assert.deepEqual(plan, {
      ok: true,
      counts: { transactions: 2, recurring: 1, categories: 0, keptTransactions: 2, keptRecurring: 1 },
      changes: { deleteExpenseRows: [2, 4], deleteRecurringRows: [3], clearCategoryRows: [], clearConfigRows: [2] },
    })
  })

  it("is refused while the user's transactions point at sample rows", () => {
    const plan = planSampleDataClear(sheets({
      expenses: [EXPENSES_HEADER, expense('sample-1'), expense('a-uuid', 'sample-1'), expense('b-uuid', '', 'sample-r1@2025-03-01'), expense('c-uuid', '', 'own@2025-03-01')],
    }))
    assert.equal(plan.ok, false)
    assert.match(!plan.ok ? plan.reason : '', /^2 transactions of yours point at sample data.*row 3, 4\.$/)
  })

  it('ignores rows holding only formula output in F:G', () => {
    const plan = planSampleDataClear(sheets({ expenses: [EXPENSES_HEADER, expense('sample-1'), ['', '', '', '', '', '0', '']] }))
    assert.deepEqual(plan.ok && plan.changes.deleteExpenseRows, [2])
    assert.equal(plan.ok && plan.counts.keptTransactions, 0)
  })

  it('skips tabs that are missing or empty', () => {
    assert.deepEqual(planSampleDataClear(sheets({ expenses: [EXPENSES_HEADER], recurring: null, categories: null })), {
      ok: true,
      counts: { transactions: 0, recurring: 0, categories: 0, keptTransactions: 0, keptRecurring: 0 },
      changes: { deleteExpenseRows: [], deleteRecurringRows: [], clearCategoryRows: [], clearConfigRows: [2] },
    })
  })
})

describe('sampleDataRequests', () => {
  const grid = (sheetId: number, rowCount = 1000, frozenRowCount = 1) => ({ sheetId, rowCount, frozenRowCount })

  it('deletes runs of rows from the bottom up and empties A:C of cleared rows', () => {
    const requests = sampleDataRequests(
      { deleteExpenseRows: [2, 3, 5], deleteRecurringRows: [2], clearCategoryRows: [2, 3], clearConfigRows: [4] },
      { expenses: grid(10), recurring: grid(20), categories: grid(30), config: grid(40) }
    )
    assert.deepEqual(requests, [
      { deleteDimension: { range: { sheetId: 10, dimension: 'ROWS', startIndex: 4, endIndex: 5 } } },
      { deleteDimension: { range: { sheetId: 10, dimension: 'ROWS', startIndex: 1, endIndex: 3 } } },
      { deleteDimension: { range: { sheetId: 20, dimension: 'ROWS', startIndex: 1, endIndex: 2 } } },
      { updateCells: { range: { sheetId: 30, startRowIndex: 1, endRowIndex: 3, startColumnIndex: 0, endColumnIndex: 3 }, fields: 'userEnteredValue' } },
      { updateCells: { range: { sheetId: 40, startRowIndex: 3, endRowIndex: 4, startColumnIndex: 0, endColumnIndex: 3 }, fields: 'userEnteredValue' } },
    ])
  })

  it('adds an empty row first when every non-frozen row would be deleted', () => {
    const requests = sampleDataRequests(
      { deleteExpenseRows: [2, 3], deleteRecurringRows: [], clearCategoryRows: [], clearConfigRows: [] },
      { expenses: grid(10, 3, 1) }
    )
    assert.deepEqual(requests, [
      { appendDimension: { sheetId: 10, dimension: 'ROWS', length: 1 } },
      { deleteDimension: { range: { sheetId: 10, dimension: 'ROWS', startIndex: 1, endIndex: 3 } } },
    ])
  })
})
