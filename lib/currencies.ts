import type { CurrencyDefinition, CurrencyList, Transaction } from './types'

// The currencyDates tab holds one pair of columns per currency:
//   row 1: B1 is the default currency; other pairs have the code in their second column and,
//          for a custom (multiplier) currency, the multiplier in their first column
//   row 2: the 1-based numbers of both columns, which the expenses formulas look up
//   row 3: a standard currency's GOOGLEFINANCE formula (it spills the Date/Close table);
//          a custom currency's "Date" and "Value" headers
//   row 4: a custom currency's formula, which repeats the multiplier for every date
export const CURRENCY_LAYOUT_ROWS = 4

// The template's first date, used when no existing formula reveals the sheet's own
const FALLBACK_START_DATE = { year: 2025, month: 11, day: 1 }

export type StartDate = typeof FALLBACK_START_DATE

// What adding a currency needs besides the list: where the next pair goes and the first date
export type CurrencyLayout = CurrencyList & { nextColumn: number; startDate: StartDate }

export const STANDARD_CODE = /^[A-Z]{3}$/
export const CUSTOM_CODE = /^[A-Z][A-Z0-9_]{0,39}$/

// 0 → A, 25 → Z, 26 → AA
export function columnLetter(index: number): string {
  let letters = ''
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters
  }
  return letters
}

function dateLiteral({ year, month, day }: StartDate, separator: string) {
  return `DATE(${[year, month, day].join(separator)})`
}

// Formula X: the rate of one default-currency unit in the pair's currency, from GOOGLEFINANCE;
// the default currency itself gets a constant 1. firstColumn is the pair's first column (0-based).
export function standardCurrencyFormula(firstColumn: number, start: StartDate): string {
  const code = `${columnLetter(firstColumn + 1)}1`
  const date = dateLiteral(start, ', ')
  return `=IF(ISBLANK(${code}), "", IF(EXACT($B1, ${code}), VSTACK({"Date", "Close"}, HSTACK(SEQUENCE(TODAY() - ${date} + 1, 1, ${date}), MAKEARRAY(TODAY() - ${date} + 1, 1, LAMBDA(r, c, 1)))), GOOGLEFINANCE("CURRENCY:" & $B1 & ${code}, "price", ${date}, TODAY(), 1)))`
}

// Formula Y: the multiplier in the pair's first cell, repeated for every date
export function customCurrencyFormula(firstColumn: number, start: StartDate): string {
  const multiplier = `${columnLetter(firstColumn)}1`
  const date = dateLiteral(start, ',')
  return `={ARRAYFORMULA(${date} + SEQUENCE(TODAY() - ${date} + 1, 1, 0)), ARRAYFORMULA(IF(ROW(INDIRECT("A1:A" & TODAY()-${date}+1)), ${multiplier}))}`
}

// Rows 1-4 of a new pair, as written with USER_ENTERED; null leaves a cell untouched
export function newCurrencyCells(
  firstColumn: number,
  input: { code: string; multiplier?: number },
  start: StartDate
): (string | number | null)[][] {
  const columnNumbers = [firstColumn + 1, firstColumn + 2]

  if (input.multiplier === undefined) {
    return [
      [null, input.code],
      columnNumbers,
      [standardCurrencyFormula(firstColumn, start), null],
    ]
  }

  return [
    [input.multiplier, input.code],
    columnNumbers,
    ['Date', 'Value'],
    [customCurrencyFormula(firstColumn, start), null],
  ]
}

function cellText(value: unknown) {
  return typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : ''
}

// The first DATE(y, m, d) in the existing currency formulas, so new ones cover the same dates
export function findStartDate(rows: unknown[][]): StartDate {
  for (const row of rows.slice(2, CURRENCY_LAYOUT_ROWS)) {
    for (const cell of row ?? []) {
      const match = cellText(cell).match(/^=.*?DATE\(\s*(\d{4})\s*,\s*(\d{1,2})\s*,\s*(\d{1,2})\s*\)/i)
      if (match) {
        return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) }
      }
    }
  }
  return FALLBACK_START_DATE
}

// rows: currencyDates!1:4 read with valueRenderOption=FORMULA. null when B1 holds no currency.
export function parseCurrencyLayout(rows: unknown[][]): CurrencyLayout | null {
  const [codes = [], , headers = []] = rows
  const defaultCurrency = cellText(codes[1])
  if (!defaultCurrency) return null

  const width = Math.max(0, ...rows.map(row => row?.length ?? 0))
  const currencies: CurrencyDefinition[] = []

  for (let column = 0; column < width; column += 2) {
    const code = cellText(codes[column + 1])
    if (!code) continue

    // A custom pair has a static "Date" header in row 3 where a standard one has its formula
    const isCustom = column > 0 && !cellText(headers[column]).startsWith('=')
    const multiplier = codes[column]

    currencies.push({
      code,
      column,
      kind: isCustom ? 'custom' : 'standard',
      multiplier: isCustom && typeof multiplier === 'number' ? multiplier : null,
      isDefault: column === 0,
    })
  }

  return { defaultCurrency, currencies, nextColumn: width + (width % 2), startDate: findStartDate(rows) }
}

// A message for invalid input, or null when the currency can be added
export function validateNewCurrency(list: CurrencyList, input: { code: string; multiplier?: number }): string | null {
  if (input.multiplier === undefined) {
    if (!STANDARD_CODE.test(input.code)) return 'Use a three-letter currency code, e.g. EUR.'
  } else {
    if (!CUSTOM_CODE.test(input.code)) return 'Use capital letters, digits and underscores, starting with a letter, e.g. JOINED_ACCOUNT.'
    if (!Number.isFinite(input.multiplier) || input.multiplier <= 0) return 'The multiplier must be a positive number.'
  }

  if (list.currencies.some(c => c.code.toUpperCase() === input.code.toUpperCase())) {
    return `${input.code} is already in the list.`
  }

  return null
}

// Making another standard currency the default swaps two codes: B1 gets the new default and the
// chosen pair gets the old one, so the old default keeps a pair whose formula X now fetches its
// rate against the new default. Overwriting B1 alone would drop the old default from the tab.
export function defaultCurrencySwap(list: CurrencyList, code: string): { range: string; value: string }[] | string {
  const target = list.currencies.find(c => c.code === code)

  if (!target) return `${code} is not in the list.`
  if (target.isDefault) return `${code} is already the default currency.`
  if (target.kind !== 'standard') return `${code} is a multiplier, not a currency, so it cannot be the default.`

  return [
    { range: 'B1', value: target.code },
    { range: `${columnLetter(target.column + 1)}1`, value: list.defaultCurrency },
  ]
}

// Rows with an empty Currency cell are in whatever the default currency is
export function resolveDefaultCurrency(transactions: Transaction[], defaultCurrency: string): Transaction[] {
  return transactions.map(t => t.currency ? t : { ...t, currency: defaultCurrency, implicitCurrency: true })
}
