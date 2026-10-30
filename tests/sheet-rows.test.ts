import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseCategoriesAndRecent, parseCategoryRows, parseTransactionRows } from '../lib/sheet-rows.ts'

const HEADER = ['Timestamp', 'What', 'Category', 'Amount', 'Currency', 'AmountPLN', 'MonthYear', 'TransactionID', 'Notes', 'ReturnOf']
const ROW = ['15/03/2025 10:30:00', 'Coffee', 'Food', '12,50', 'EUR', '53,40', '3_2025', 'id-1', 'with milk', '']

describe('parseTransactionRows', () => {
  it('skips the header row and parses each transaction', () => {
    const [transaction, ...rest] = parseTransactionRows([HEADER, ROW])

    assert.equal(rest.length, 0)
    assert.deepEqual(transaction.timestamp, new Date(2025, 2, 15, 10, 30, 0))
    assert.equal(transaction.what, 'Coffee')
    assert.equal(transaction.category, 'food')
    assert.equal(transaction.amountOriginal, 12.5)
    assert.equal(transaction.currency, 'EUR')
    assert.equal(transaction.amountPLN, 53.4)
    assert.equal(transaction.transactionId, 'id-1')
    assert.equal(transaction.notes, 'with milk')
  })

  it('keeps the first row when there is no header', () => {
    assert.equal(parseTransactionRows([ROW]).length, 1)
  })

  it('drops incomplete rows', () => {
    assert.deepEqual(parseTransactionRows([HEADER, ['15/03/2025', 'Coffee'], ['', 'x', 'y', '1', '', '', '']]), [])
  })
})

describe('parseCategoryRows', () => {
  it('skips the header, normalizes names, validates colors and reads hidden', () => {
    assert.deepEqual(parseCategoryRows([
      ['Category', 'Color', 'Hidden'],
      [' Food ', '#AABBCC'],
      ['transport', 'red', 'TRUE'],
      ['fun', '', 'FALSE'],
      ['food', '#000000'],
      [''],
    ]), [
      { name: 'food', color: '#AABBCC', hidden: false },
      { name: 'transport', color: null, hidden: true },
      { name: 'fun', color: null, hidden: false },
    ])
  })
})

describe('parseCategoriesAndRecent', () => {
  it('reads categories and recent transactions from the batchGet ranges, in order', () => {
    const result = parseCategoriesAndRecent([
      { values: [['Category'], ['food', '#112233']] },
      { values: [HEADER, ROW] },
    ])

    assert.deepEqual(result.categories, [{ name: 'food', color: '#112233', hidden: false }])
    assert.equal(result.recentTransactions.length, 1)
    assert.equal(result.recentTransactions[0].what, 'Coffee')
  })

  it('treats ranges without values as empty tabs', () => {
    assert.deepEqual(parseCategoriesAndRecent([{}, {}]), { categories: [], recentTransactions: [] })
    assert.deepEqual(parseCategoriesAndRecent(undefined), { categories: [], recentTransactions: [] })
  })
})
