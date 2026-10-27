import type { CurrencyDefinition, CurrencyList, Transaction } from './types'

// The currencyDates tab holds one pair of columns per currency:
//   row 1: B1 is the default currency; other pairs have the code in their second column and,
//          for a custom (multiplier) currency, the multiplier in their first column
//   row 2: the 1-based numbers of both columns, which the expenses formulas look up
//   row 3: a standard currency's GOOGLEFINANCE formula (it spills the Date/Close table);
//          a custom currency's "Date" and "Value" headers
//   row 4: a custom currency's formula, which repeats the multiplier for every date
export const CURRENCY_LAYOUT_ROWS = 4

// The expenses formula looks up rates in currencyDates!A:ZZ, so no pair may go past ZZ
export const LAST_LOOKUP_COLUMN = 701

// The first day of the rate tables, a DATE(...) hardcoded in every currency formula. All pairs
// must share it: the expenses formula finds a date in column A and reads the rate from the
// same row in the currency's pair.
export type StartDate = { year: number; month: number; day: number }

// The template's first date, used when no existing formula reveals the sheet's own
const FALLBACK_START_DATE: StartDate = { year: 2025, month: 11, day: 1 }

// What adding a currency needs besides the list: where the next pair goes and the first date.
// startDate is a message instead when the existing formulas disagree or cannot be read.
export type CurrencyLayout = CurrencyList & { nextColumn: number; startDate: StartDate | string }

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

export function formatDate({ year, month, day }: StartDate) {
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`
}

// The start of the existing currency formulas (row 3, or row 4 for a custom pair), so new ones
// cover the same dates. A message when they use different dates or one has no DATE(...).
export function findStartDate(rows: unknown[][]): StartDate | string {
  const dates = new Map<string, StartDate>()

  for (const rowIndex of [2, 3]) {
    const row = rows[rowIndex] ?? []
    for (let column = 0; column < row.length; column++) {
      const formula = cellText(row[column])
      if (!formula.startsWith('=')) continue

      const matches = [...formula.matchAll(/DATE\(\s*(\d{4})\s*[,;]\s*(\d{1,2})\s*[,;]\s*(\d{1,2})\s*\)/gi)]
      if (matches.length === 0) {
        return `The formula in ${columnLetter(column)}${rowIndex + 1} has no DATE(...) start date. Use the same DATE(...) in every currency formula.`
      }
      for (const [, year, month, day] of matches) {
        const date = { year: Number(year), month: Number(month), day: Number(day) }
        dates.set(formatDate(date), date)
      }
    }
  }

  if (dates.size > 1) {
    return `The currency formulas start on different dates (${[...dates.keys()].join(', ')}). Use the same DATE(...) in every currency formula.`
  }

  return dates.values().next().value ?? FALLBACK_START_DATE
}

// What extending the rates needs: the current start (a message when the formulas disagree or
// cannot be read), the day of the earliest transaction and how many formulas hold the start
export type RatesStart = { start: StartDate | string; earliest: StartDate | null; formulas: number }

export function compareDates(a: StartDate, b: StartDate) {
  return a.year - b.year || a.month - b.month || a.day - b.day
}

// Sheets serial numbers count days from 30/12/1899; the fraction is the time of day
function serialToDate(serial: number): StartDate {
  const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86_400_000)
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() }
}

// cells: expenses!A:A read with UNFORMATTED_VALUE and SERIAL_NUMBER, so dates are numbers and the
// header is text. Only number cells count: the expenses formula cannot look up a text timestamp.
export function findEarliestDay(cells: unknown[][]): StartDate | null {
  const serials = cells.map(row => row?.[0]).filter((value): value is number => typeof value === 'number' && value > 0)
  return serials.length > 0 ? serialToDate(Math.min(...serials)) : null
}

// The currency formulas with their A1 cells: row 3, and row 4 for a custom pair
function currencyFormulas(rows: unknown[][]) {
  return [2, 3].flatMap(rowIndex => (rows[rowIndex] ?? []).flatMap((cell, column) => {
    const formula = cellText(cell)
    return formula.startsWith('=') ? [{ range: `${columnLetter(column)}${rowIndex + 1}`, formula }] : []
  }))
}

export type ExtendableRatesStart = RatesStart & { start: StartDate; earliest: StartDate }

// Whether the earliest transaction is before a readable start, so the rates can be extended
export function canExtendRates(ratesStart: RatesStart | null | undefined): ratesStart is ExtendableRatesStart {
  return !!ratesStart && typeof ratesStart.start !== 'string' && !!ratesStart.earliest &&
    compareDates(ratesStart.earliest, ratesStart.start) < 0
}

export function parseRatesStart(rows: unknown[][], earliest: StartDate | null): RatesStart {
  return { start: findStartDate(rows), earliest, formulas: currencyFormulas(rows).length }
}

// Moves the start of every currency formula back to newStart by rewriting the DATE(...) literals
// in place, so customised formulas survive and each keeps its separators and spacing. Only ever
// earlier: a later start gains nothing and would drop rates that existing transactions use.
export function extendStartDate(rows: unknown[][], newStart: StartDate): { range: string; formula: string }[] | string {
  const start = findStartDate(rows)
  if (typeof start === 'string') return start

  const formulas = currencyFormulas(rows)
  if (formulas.length === 0) return 'There are no currency formulas to extend.'
  if (compareDates(newStart, start) >= 0) return `The rates already start on ${formatDate(start)}.`

  const { year, month, day } = newStart
  return formulas.map(({ range, formula }) => ({
    range,
    formula: formula.replace(
      /(DATE\(\s*)\d{4}(\s*[,;]\s*)\d{1,2}(\s*[,;]\s*)\d{1,2}(\s*\))/gi,
      (_, open, first, second, close) => `${open}${year}${first}${month}${second}${day}${close}`
    ),
  }))
}

// The first pair left empty by a removed currency, else the pair after the last used column
function findFreeColumn(rows: unknown[][], width: number) {
  for (let column = 2; column < width; column += 2) {
    if (rows.every(row => !cellText(row?.[column]) && !cellText(row?.[column + 1]))) return column
  }
  return width + (width % 2)
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

  return { defaultCurrency, currencies, nextColumn: findFreeColumn(rows, width), startDate: findStartDate(rows) }
}

// A message for invalid input, or null when the currency can be added
export function validateNewCurrency(layout: CurrencyLayout, input: { code: string; multiplier?: number }): string | null {
  if (input.multiplier === undefined) {
    if (!STANDARD_CODE.test(input.code)) return 'Use a three-letter currency code, e.g. EUR.'
  } else {
    if (!CUSTOM_CODE.test(input.code)) return 'Use capital letters, digits and underscores, starting with a letter, e.g. JOINED_ACCOUNT.'
    if (!Number.isFinite(input.multiplier) || input.multiplier <= 0) return 'The multiplier must be a positive number.'
  }

  if (layout.currencies.some(c => c.code.toUpperCase() === input.code.toUpperCase())) {
    return `${input.code} is already in the list.`
  }

  if (layout.nextColumn + 1 > LAST_LOOKUP_COLUMN) {
    return `There is no room left up to column ${columnLetter(LAST_LOOKUP_COLUMN)}, the last one the expenses formula looks up. Remove an unused currency first.`
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
