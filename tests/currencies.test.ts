import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  canExtendRates,
  columnLetter,
  customCurrencyFormula,
  defaultCurrencySwap,
  extendStartDate,
  findEarliestDay,
  findStartDate,
  newCurrencyCells,
  parseCurrencyLayout,
  parseRatesStart,
  resolveDefaultCurrency,
  LAST_LOOKUP_COLUMN,
  standardCurrencyFormula,
  validateNewCurrency,
} from '../lib/currencies.ts'
import type { Transaction } from '../lib/types.ts'

const START = { year: 2025, month: 11, day: 1 }

// The formulas from issue #45, as they appear in A3 and G4 of the template
const FORMULA_X_A3 = '=IF(ISBLANK(B1), "", IF(EXACT($B1, B1), VSTACK({"Date", "Close"}, HSTACK(SEQUENCE(TODAY() - DATE(2025, 11, 1) + 1, 1, DATE(2025, 11, 1)), MAKEARRAY(TODAY() - DATE(2025, 11, 1) + 1, 1, LAMBDA(r, c, 1)))), GOOGLEFINANCE("CURRENCY:" & $B1 & B1, "price", DATE(2025, 11, 1), TODAY(), 1)))'
const FORMULA_Y_G4 = '={ARRAYFORMULA(DATE(2025,11,1) + SEQUENCE(TODAY() - DATE(2025,11,1) + 1, 1, 0)), ARRAYFORMULA(IF(ROW(INDIRECT("A1:A" & TODAY()-DATE(2025,11,1)+1)), G1))}'

// currencyDates!1:4 as read with valueRenderOption=FORMULA: PLN (default), EUR, USD, JOINED_ACCOUNT
const SHEET_ROWS: unknown[][] = [
  ['DEFAULT', 'PLN', '', 'EUR', '', 'USD', 0.5, 'JOINED_ACCOUNT'],
  [1, 2, 3, 4, 5, 6, 7, 8],
  [FORMULA_X_A3, '', standardCurrencyFormula(2, START), '', standardCurrencyFormula(4, START), '', 'Date', 'Value'],
  ['', '', '', '', '', '', FORMULA_Y_G4],
]

describe('columnLetter', () => {
  it('converts 0-based indexes to A1 column letters', () => {
    assert.deepEqual([0, 1, 25, 26, 27, 51, 52, 701, 702].map(columnLetter), ['A', 'B', 'Z', 'AA', 'AB', 'AZ', 'BA', 'ZZ', 'AAA'])
  })
})

describe('standardCurrencyFormula', () => {
  it('reproduces the template formula in A3', () => {
    assert.equal(standardCurrencyFormula(0, START), FORMULA_X_A3)
  })

  it('points relative references at the new pair and keeps $B1', () => {
    const formula = standardCurrencyFormula(8, START)
    assert.equal(formula, FORMULA_X_A3.replace(/(?<!\$)B1/g, 'J1'))
    assert.match(formula, /EXACT\(\$B1, J1\)/)
    assert.match(formula, /"CURRENCY:" & \$B1 & J1/)
  })

  it('handles pairs past column Z', () => {
    assert.match(standardCurrencyFormula(26, START), /ISBLANK\(AB1\)/)
  })

  it('uses the given start date', () => {
    const formula = standardCurrencyFormula(2, { year: 2024, month: 1, day: 15 })
    assert.ok(!formula.includes('DATE(2025'))
    assert.equal(formula.match(/DATE\(2024, 1, 15\)/g)?.length, 4)
  })
})

describe('customCurrencyFormula', () => {
  it('reproduces the template formula in G4', () => {
    assert.equal(customCurrencyFormula(6, START), FORMULA_Y_G4)
  })

  it('reads the multiplier from the first cell of the new pair and leaves INDIRECT alone', () => {
    const formula = customCurrencyFormula(10, START)
    assert.match(formula, /, K1\)\)\}$/)
    assert.match(formula, /INDIRECT\("A1:A" &/)
  })
})

describe('newCurrencyCells', () => {
  it('lays out a standard currency: code, column numbers, formula X', () => {
    assert.deepEqual(newCurrencyCells(8, { code: 'GBP' }, START), [
      [null, 'GBP'],
      [9, 10],
      [standardCurrencyFormula(8, START), null],
    ])
  })

  it('lays out a custom currency: multiplier and name, column numbers, headers, formula Y', () => {
    assert.deepEqual(newCurrencyCells(8, { code: 'SHARED', multiplier: 0.25 }, START), [
      [0.25, 'SHARED'],
      [9, 10],
      ['Date', 'Value'],
      [customCurrencyFormula(8, START), null],
    ])
  })
})

describe('parseCurrencyLayout', () => {
  it('reads the default currency from B1 and every pair', () => {
    const layout = parseCurrencyLayout(SHEET_ROWS)
    assert.ok(layout)
    assert.equal(layout.defaultCurrency, 'PLN')
    assert.deepEqual(layout.currencies, [
      { code: 'PLN', column: 0, kind: 'standard', multiplier: null, isDefault: true },
      { code: 'EUR', column: 2, kind: 'standard', multiplier: null, isDefault: false },
      { code: 'USD', column: 4, kind: 'standard', multiplier: null, isDefault: false },
      { code: 'JOINED_ACCOUNT', column: 6, kind: 'custom', multiplier: 0.5, isDefault: false },
    ])
    assert.equal(layout.nextColumn, 8)
    assert.deepEqual(layout.startDate, START)
  })

  it('takes whatever B1 holds as the default', () => {
    const rows = [['DEFAULT', 'EUR', '', 'PLN'], [1, 2, 3, 4], [standardCurrencyFormula(0, START), '', standardCurrencyFormula(2, START)]]
    assert.equal(parseCurrencyLayout(rows)?.defaultCurrency, 'EUR')
  })

  it('returns null without a default currency', () => {
    assert.equal(parseCurrencyLayout([]), null)
    assert.equal(parseCurrencyLayout([['DEFAULT', '']]), null)
  })

  it('skips a removed pair and puts the next currency in its columns', () => {
    const rows = SHEET_ROWS.map(row => [...row])
    rows[0][3] = ''
    rows[1][2] = rows[1][3] = ''
    rows[2][2] = ''
    const layout = parseCurrencyLayout(rows)
    assert.deepEqual(layout?.currencies.map(c => c.code), ['PLN', 'USD', 'JOINED_ACCOUNT'])
    assert.equal(layout?.nextColumn, 2)
  })

  it('does not treat a pair with leftover content as free', () => {
    const rows = SHEET_ROWS.map(row => [...row])
    rows[0][3] = ''
    const layout = parseCurrencyLayout(rows)
    assert.equal(layout?.nextColumn, 8)
  })

  it('places the next pair on an even column after the widest row', () => {
    const rows = [['DEFAULT', 'PLN', 'stray'], [1, 2], [FORMULA_X_A3]]
    assert.equal(parseCurrencyLayout(rows)?.nextColumn, 4)
  })
})

describe('findStartDate', () => {

  it('falls back to the template date without formulas', () => {
    assert.deepEqual(findStartDate([['DEFAULT', 'PLN'], [1, 2]]), START)
  })

  it('accepts every formula on the same date, whatever its spacing', () => {
    assert.deepEqual(findStartDate(SHEET_ROWS), START)
  })

  it('reports formulas that start on different dates', () => {
    const rows = SHEET_ROWS.map(row => [...row])
    rows[2][4] = standardCurrencyFormula(4, { year: 2024, month: 1, day: 1 })
    assert.match(String(findStartDate(rows)), /different dates \(01\/11\/2025, 01\/01\/2024\)/)
  })

  it('reads dates written with semicolons', () => {
    const rows = [['DEFAULT', 'PLN'], [1, 2], [FORMULA_X_A3.replaceAll('DATE(2025, 11, 1)', 'DATE(2024; 1; 15)')]]
    assert.deepEqual(findStartDate(rows), { year: 2024, month: 1, day: 15 })
  })

  it('reports a formula whose start it cannot read', () => {
    const rows = SHEET_ROWS.map(row => [...row])
    rows[2][2] = String(rows[2][2]).replaceAll('DATE(2025, 11, 1)', '$Z$1')
    assert.match(String(findStartDate(rows)), /C3 has no DATE/)
  })

  it('reads the date of the existing formulas', () => {
    const rows = [['DEFAULT', 'PLN'], [1, 2], [standardCurrencyFormula(0, { year: 2023, month: 6, day: 30 })]]
    assert.deepEqual(findStartDate(rows), { year: 2023, month: 6, day: 30 })
  })
})

describe('findEarliestDay', () => {
  it('returns the day of the smallest serial number, ignoring the time and the header', () => {
    // 45658.75 is 01/01/2025 18:00, 45962.5 is 01/11/2025 12:00
    assert.deepEqual(findEarliestDay([['Timestamp'], [45962.5], [45658.75], [], ['']]), { year: 2025, month: 1, day: 1 })
  })

  it('returns null without dated rows', () => {
    assert.equal(findEarliestDay([['Timestamp'], ['not a date']]), null)
  })
})

describe('parseRatesStart', () => {
  it('counts every currency formula', () => {
    assert.deepEqual(parseRatesStart(SHEET_ROWS, null), { start: START, earliest: null, formulas: 4 })
  })
})

describe('canExtendRates', () => {
  it('needs an earliest transaction before a readable start', () => {
    assert.equal(canExtendRates({ start: START, earliest: { year: 2025, month: 10, day: 31 }, formulas: 4 }), true)
    assert.equal(canExtendRates({ start: START, earliest: START, formulas: 4 }), false)
    assert.equal(canExtendRates({ start: START, earliest: null, formulas: 4 }), false)
    assert.equal(canExtendRates({ start: 'unreadable', earliest: { year: 2020, month: 1, day: 1 }, formulas: 4 }), false)
    assert.equal(canExtendRates(null), false)
  })
})

describe('extendStartDate', () => {
  const EARLIER = { year: 2024, month: 3, day: 5 }

  it('rewrites every DATE(...) literal in place, keeping each formula\'s spacing', () => {
    const updates = extendStartDate(SHEET_ROWS, EARLIER)
    assert.ok(Array.isArray(updates))
    assert.deepEqual(updates.map(u => u.range), ['A3', 'C3', 'E3', 'G4'])
    assert.equal(updates[0].formula, FORMULA_X_A3.replaceAll('DATE(2025, 11, 1)', 'DATE(2024, 3, 5)'))
    assert.equal(updates[1].formula, standardCurrencyFormula(2, EARLIER))
    assert.equal(updates[3].formula, FORMULA_Y_G4.replaceAll('DATE(2025,11,1)', 'DATE(2024,3,5)'))
  })

  it('keeps semicolon separators', () => {
    const rows = [['DEFAULT', 'PLN'], [1, 2], [FORMULA_X_A3.replaceAll('DATE(2025, 11, 1)', 'DATE(2025; 11; 1)').replaceAll(',', ';')]]
    const updates = extendStartDate(rows, EARLIER)
    assert.ok(Array.isArray(updates))
    assert.equal(updates[0].formula.match(/DATE\(2024; 3; 5\)/g)?.length, 4)
    assert.ok(!updates[0].formula.includes('2025'))
  })

  it('keeps customisations around the dates', () => {
    const custom = FORMULA_Y_G4.replace('G1))}', 'G1 * 2))}')
    const rows = [SHEET_ROWS[0], SHEET_ROWS[1], SHEET_ROWS[2], ['', '', '', '', '', '', custom]]
    const updates = extendStartDate(rows, EARLIER)
    assert.ok(Array.isArray(updates))
    assert.equal(updates[3].formula, custom.replaceAll('DATE(2025,11,1)', 'DATE(2024,3,5)'))
  })

  it('only moves the start earlier', () => {
    assert.match(extendStartDate(SHEET_ROWS, START) as string, /already start on 01\/11\/2025/)
    assert.equal(typeof extendStartDate(SHEET_ROWS, { year: 2026, month: 1, day: 1 }), 'string')
  })

  it('refuses when the formulas disagree or one has no DATE(...)', () => {
    const disagree = [SHEET_ROWS[0], SHEET_ROWS[1], [FORMULA_X_A3, '', standardCurrencyFormula(2, EARLIER)]]
    assert.match(extendStartDate(disagree, { year: 2020, month: 1, day: 1 }) as string, /different dates/)

    const unreadable = [SHEET_ROWS[0], SHEET_ROWS[1], [FORMULA_X_A3, '', '=GOOGLEFINANCE("CURRENCY:PLNEUR")']]
    assert.match(extendStartDate(unreadable, { year: 2020, month: 1, day: 1 }) as string, /C3 has no DATE/)
  })

  it('refuses without formulas', () => {
    assert.match(extendStartDate([['DEFAULT', 'PLN'], [1, 2]], EARLIER) as string, /no currency formulas/)
  })
})

describe('validateNewCurrency', () => {
  const list = parseCurrencyLayout(SHEET_ROWS)!

  it('accepts a new three-letter code and a new custom name with a positive multiplier', () => {
    assert.equal(validateNewCurrency(list, { code: 'GBP' }), null)
    assert.equal(validateNewCurrency(list, { code: 'HALF_2', multiplier: 0.5 }), null)
  })

  it('rejects duplicates, whatever their case', () => {
    assert.match(validateNewCurrency(list, { code: 'EUR' }) ?? '', /already/)
    assert.match(validateNewCurrency(list, { code: 'JOINED_ACCOUNT', multiplier: 1 }) ?? '', /already/)
    const lowercase = { ...list, currencies: [...list.currencies, { ...list.currencies[1], code: 'gbp' }] }
    assert.match(validateNewCurrency(lowercase, { code: 'GBP' }) ?? '', /already/)
  })

  it('refuses a pair past the last column the expenses formula looks up', () => {
    assert.equal(validateNewCurrency({ ...list, nextColumn: LAST_LOOKUP_COLUMN - 1 }, { code: 'GBP' }), null)
    assert.match(validateNewCurrency({ ...list, nextColumn: LAST_LOOKUP_COLUMN + 1 }, { code: 'GBP' }) ?? '', /column ZZ/)
  })

  it('rejects malformed codes and multipliers', () => {
    assert.ok(validateNewCurrency(list, { code: 'EURO' }))
    assert.ok(validateNewCurrency(list, { code: 'eu' }))
    assert.ok(validateNewCurrency(list, { code: '=A1', multiplier: 1 }))
    assert.ok(validateNewCurrency(list, { code: 'SHARED', multiplier: 0 }))
    assert.ok(validateNewCurrency(list, { code: 'SHARED', multiplier: NaN }))
  })
})

describe('defaultCurrencySwap', () => {
  const list = parseCurrencyLayout(SHEET_ROWS)!

  it('puts the new default in B1 and the old one in the chosen pair', () => {
    assert.deepEqual(defaultCurrencySwap(list, 'USD'), [
      { range: 'B1', value: 'USD' },
      { range: 'F1', value: 'PLN' },
    ])
  })

  it('keeps every currency after the swap, with the new default in B1', () => {
    const swap = defaultCurrencySwap(list, 'EUR')
    assert.ok(Array.isArray(swap))
    const rows = SHEET_ROWS.map(row => [...row])
    rows[0][1] = 'EUR'
    rows[0][3] = 'PLN'
    const swapped = parseCurrencyLayout(rows)!
    assert.equal(swapped.defaultCurrency, 'EUR')
    assert.deepEqual(swapped.currencies.map(c => c.code).sort(), list.currencies.map(c => c.code).sort())
    // The old default's pair keeps a GOOGLEFINANCE formula reading D1 against $B1
    assert.match(String(rows[2][2]), /"CURRENCY:" & \$B1 & D1/)
  })

  it('refuses the current default, multipliers and unknown codes', () => {
    assert.match(String(defaultCurrencySwap(list, 'PLN')), /already the default/)
    assert.match(String(defaultCurrencySwap(list, 'JOINED_ACCOUNT')), /multiplier/)
    assert.match(String(defaultCurrencySwap(list, 'GBP')), /not in the list/)
  })
})

describe('resolveDefaultCurrency', () => {
  const base = { timestamp: new Date(2025, 10, 1), what: 'x', category: 'food', amountOriginal: 10, amountPLN: 10, monthYear: '11_2025', monthName: '', transactionId: '1' }

  it('gives rows without a currency the default one and marks them', () => {
    const [implicit, explicit] = resolveDefaultCurrency([
      { ...base, currency: '' },
      { ...base, currency: 'EUR', transactionId: '2' },
    ] satisfies Transaction[], 'PLN')
    assert.equal(implicit.currency, 'PLN')
    assert.equal(implicit.implicitCurrency, true)
    assert.equal(explicit.currency, 'EUR')
    assert.equal(explicit.implicitCurrency, undefined)
  })
})
