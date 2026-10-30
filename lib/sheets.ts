import { SHEETS_API_BASE, SHEETS } from './config'
import { columnLetter, compareDates, CURRENCY_LAYOUT_ROWS, defaultCurrencySwap, extendStartDate, findEarliestDay, findStartDate, formatDate, newCurrencyCells, newRateProblems, parseCurrencyLayout, parseRatesStart, rateStatuses, revertStartDate, validateNewCurrency, type CurrencyLayout, type DisplayedCurrencyRows, type ExtendResult, type RatesStart, type StartDate } from './currencies'
import { draftTransaction, draftTransactionId, isoDate, occurrenceAfter, parseRecurringRows, RECURRING_HEADER, rescheduledNext, sameRecurringPayment, type RecurringDraft, type RecurringPayment, type RecurringPaymentInput } from './recurring'
import { recordedAmount } from './returns'
import { parseCategoriesAndRecent, parseCategoryRows, parseRow, parseTransactionRows, rowsWithId } from './sheet-rows'
import type { CategoryDefinition, CurrencyList, Transaction, TransactionInput } from './types'

export class SheetsApiError extends Error {
  constructor(message: string, public status: number) {
    super(message)
    this.name = 'SheetsApiError'
  }
}

export { parseMoney } from './sheet-rows'

export async function fetchSheetData(
  accessToken: string,
  spreadsheetId: string,
  sheetName: string
): Promise<Transaction[]> {
  const range = `${sheetName}!A:J`
  const url = `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`
  
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })
  
  if (!response.ok) {
    let message = 'Failed to fetch sheet data'

    try {
      const error = await response.json()
      message = error.error?.message || message
    } catch {
      // ignore JSON parsing issues and keep fallback message
    }

    throw new SheetsApiError(message, response.status)
  }
  
  const data = await response.json()
  return parseTransactionRows(data.values || [])
}

export async function fetchRecentTransactions(accessToken: string, spreadsheetId: string): Promise<Transaction[]> {
  return fetchSheetData(accessToken, spreadsheetId, SHEETS.RECENT)
}

export async function fetchFullTransactions(accessToken: string, spreadsheetId: string): Promise<Transaction[]> {
  return fetchSheetData(accessToken, spreadsheetId, SHEETS.FULL)
}

// 403/404: the app has no drive.file grant for this sheet (never picked, or not shared).
// 400 "Unable to parse range": the sheet lacks the template's tabs.
export function describeSpreadsheetAccessError(error: unknown): string | null {
  if (!(error instanceof SheetsApiError)) return null

  if (error.status === 403 || error.status === 404) {
    return 'This app cannot access the spreadsheet. Select it with the picker to grant access.'
  }

  if (error.status === 400 && /unable to parse range/i.test(error.message)) {
    return `The spreadsheet does not match the template: it needs "${SHEETS.FULL}" and "${SHEETS.RECENT}" tabs.`
  }

  return null
}

// The input columns (Timestamp..Currency) are written; the template's ARRAYFORMULAs derive
// AmountPLN and MonthYear. TransactionID is a stored value the app writes, unless the sheet still
// derives it with a formula (see docs/migrations/stable-transaction-ids.md).
const INPUT_RANGE_END = 'E'

function pad(value: number) {
  return String(value).padStart(2, '0')
}

// DD/MM/YYYY HH:MM:SS, the template's format and the one parseTimestamp tries first
export function formatSheetTimestamp(date: Date): string {
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

// Values are written as USER_ENTERED so dates and numbers keep the sheet's types;
// a leading apostrophe keeps text like "=x" or "+48..." from turning into a formula
function asText(value: string) {
  return /^[=+\-@']/.test(value) ? `'${value}` : value
}

function toInputRow(input: TransactionInput): (string | number)[] {
  return [
    formatSheetTimestamp(input.timestamp),
    asText(input.what),
    asText(input.category),
    input.amount,
    asText(input.currency),
  ]
}

async function sheetsRequest(accessToken: string, url: string, init: RequestInit = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    let message = 'Google Sheets request failed'

    try {
      const error = await response.json()
      message = error.error?.message || message
    } catch {
      // keep fallback message
    }

    if (response.status === 403 && init.method) {
      message = 'You need edit access to this spreadsheet to save transactions.'
    }

    throw new SheetsApiError(message, response.status)
  }

  return response.json()
}

// Sheets made from the original template derive TransactionID from the row number with an
// ARRAYFORMULA in H1. Writing an ID there would break that formula, and its IDs shift when rows
// are deleted or sorted, so returns cannot link to them.
export async function hasStoredIds(accessToken: string, spreadsheetId: string, signal?: AbortSignal) {
  const range = `${SHEETS.FULL}!H1:H2`
  const data = await sheetsRequest(accessToken, `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?valueRenderOption=FORMULA`, { signal })
  const cells: unknown[][] = data.values || []
  return !cells.some(row => typeof row[0] === 'string' && row[0].startsWith('='))
}

// Indexes into the TransactionID column of the rows with this ID, also the sheet row numbers minus one
async function findRowsWithId(accessToken: string, spreadsheetId: string, transactionId: string, signal?: AbortSignal) {
  const range = `${SHEETS.FULL}!H:H`
  const idColumn = await sheetsRequest(accessToken, `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`, { signal })
  return rowsWithId(idColumn.values || [], transactionId)
}

// Whether a row with this TransactionID is in the sheet, e.g. from an append whose response was lost
export async function transactionIdExists(accessToken: string, spreadsheetId: string, transactionId: string, signal?: AbortSignal) {
  return (await findRowsWithId(accessToken, spreadsheetId, transactionId, signal)).length > 0
}

// Index into the TransactionID column, which is also the sheet row number minus one
async function findRowIndex(accessToken: string, spreadsheetId: string, transactionId: string) {
  const matches = await findRowsWithId(accessToken, spreadsheetId, transactionId)

  if (matches.length === 0) {
    throw new Error('This transaction was not found in the spreadsheet. Reload the data and try again.')
  }

  if (matches.length > 1) {
    throw new Error('Several rows share this transaction ID. Edit it directly in the spreadsheet.')
  }

  return matches[0]
}

export async function appendTransaction(
  accessToken: string,
  spreadsheetId: string,
  input: TransactionInput
): Promise<void> {
  const storedIds = await hasStoredIds(accessToken, spreadsheetId)

  if (input.returnOf) {
    if (!storedIds) {
      throw new Error('Returns need stored transaction IDs. Update your spreadsheet as described in docs/migrations/stable-transaction-ids.md.')
    }
    // The purchase must be exactly one row, or the return would link to nothing or to several rows
    await findRowIndex(accessToken, spreadsheetId, input.returnOf)
  }

  // null leaves the formula columns (AmountPLN, MonthYear) and empty Notes untouched
  const values = storedIds
    ? [...toInputRow(input), null, null, crypto.randomUUID(), null, input.returnOf ?? null]
    : toInputRow(input)
  const range = `${SHEETS.FULL}!A:${storedIds ? 'J' : INPUT_RANGE_END}`
  const url = `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED`

  await sheetsRequest(accessToken, url, {
    method: 'POST',
    body: JSON.stringify({ values: [values] }),
  })
}

// A queued new transaction (lib/outbox-sync.ts), with the ID made when it was saved. The caller
// has checked that the sheet stores IDs.
export async function appendQueuedTransaction(
  accessToken: string,
  spreadsheetId: string,
  input: TransactionInput,
  transactionId: string,
  signal?: AbortSignal
): Promise<void> {
  const range = `${SHEETS.FULL}!A:J`
  const url = `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED`

  await sheetsRequest(accessToken, url, {
    method: 'POST',
    body: JSON.stringify({ values: [[...toInputRow(input), null, null, transactionId, null, null]] }),
    signal,
  })
}

function matchesTransaction(row: string[], original: Transaction) {
  const parsed = parseRow(row)
  if (!parsed) return false

  return parsed.transactionId === original.transactionId &&
    parsed.timestamp.getTime() === original.timestamp.getTime() &&
    parsed.what === original.what &&
    parsed.category === original.category &&
    parsed.amountOriginal === recordedAmount(original).amountOriginal &&
    (parsed.currency ? parsed.currency === original.currency : !!original.implicitCurrency) &&
    parsed.notes === (original.notes ?? '')
}

// The row is located by TransactionID, downloading only that column instead of the whole tab.
// It is then re-read to make sure it still holds what the user edited; otherwise the edit aborts.
export async function updateTransaction(
  accessToken: string,
  spreadsheetId: string,
  original: Transaction,
  input: TransactionInput
): Promise<void> {
  const valuesUrl = `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}/values`
  const sheetRow = await findRowIndex(accessToken, spreadsheetId, original.transactionId) + 1
  const current = await sheetsRequest(accessToken, `${valuesUrl}/${encodeURIComponent(`${SHEETS.FULL}!A${sheetRow}:I${sheetRow}`)}`)

  if (!matchesTransaction(current.values?.[0] ?? [], original)) {
    throw new Error('This transaction changed in the spreadsheet. Reload the data and try again.')
  }

  // A formula such as =20-5 records a return by hand; overwriting it with a number would lose that
  const originalAmount = recordedAmount(original).amountOriginal

  if (input.amount !== originalAmount) {
    const formulas = await sheetsRequest(accessToken, `${valuesUrl}/${encodeURIComponent(`${SHEETS.FULL}!D${sheetRow}`)}?valueRenderOption=FORMULA`)
    const amountCell = formulas.values?.[0]?.[0]

    if (typeof amountCell === 'string' && amountCell.startsWith('=')) {
      throw new Error(`The amount is a formula in the spreadsheet (${amountCell}). Change it there to keep it.`)
    }
  }

  const next = [...toInputRow(input), asText(input.notes ?? '')]
  const changed = [
    input.timestamp.getTime() !== original.timestamp.getTime(),
    input.what !== original.what,
    input.category.toLowerCase() !== original.category,
    input.amount !== originalAmount,
    input.currency !== original.currency,
    input.notes !== undefined && input.notes !== (original.notes ?? ''),
  ]

  // Only changed cells are written, so untouched cells keep their exact value and formatting
  const data = next.flatMap((value, index) => changed[index]
    ? [{ range: `${SHEETS.FULL}!${'ABCDEI'[index]}${sheetRow}`, values: [[value]] }]
    : [])

  if (data.length === 0) return

  await sheetsRequest(accessToken, `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}/values:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data }),
  })
}

// Deleting is only safe with stored IDs: with row-number IDs every later row's ID shifts.
// A purchase that still has returns is refused, so no return is left pointing at nothing.
export async function deleteTransaction(
  accessToken: string,
  spreadsheetId: string,
  original: Transaction
): Promise<void> {
  if (!await hasStoredIds(accessToken, spreadsheetId)) {
    throw new Error('Deleting needs stored transaction IDs. Update your spreadsheet as described in docs/migrations/stable-transaction-ids.md.')
  }

  const spreadsheetUrl = `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}`
  const returnOfColumn = await sheetsRequest(accessToken, `${spreadsheetUrl}/values/${encodeURIComponent(`${SHEETS.FULL}!J:J`)}`)
  const returnOfIds: string[][] = returnOfColumn.values || []

  if (returnOfIds.some(row => row[0]?.trim() === original.transactionId)) {
    throw new Error('This purchase has returns. Remove them first.')
  }

  const rowIndex = await findRowIndex(accessToken, spreadsheetId, original.transactionId)
  const sheetRow = rowIndex + 1
  const current = await sheetsRequest(accessToken, `${spreadsheetUrl}/values/${encodeURIComponent(`${SHEETS.FULL}!A${sheetRow}:I${sheetRow}`)}`)

  if (!matchesTransaction(current.values?.[0] ?? [], original)) {
    throw new Error('This transaction changed in the spreadsheet. Reload the data and try again.')
  }

  // Row deletion addresses the tab by its numeric sheetId, not its name
  const metadata = await sheetsRequest(accessToken, `${spreadsheetUrl}?fields=sheets.properties(sheetId,title)`)
  const sheetId = metadata.sheets?.find((sheet: { properties: { title: string } }) => sheet.properties.title === SHEETS.FULL)?.properties.sheetId

  if (sheetId === undefined) {
    throw new Error(`The spreadsheet has no "${SHEETS.FULL}" tab.`)
  }

  await sheetsRequest(accessToken, `${spreadsheetUrl}:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({
      requests: [{ deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex: rowIndex, endIndex: rowIndex + 1 } } }],
    }),
  })
}

function isMissingTab(error: unknown) {
  return error instanceof SheetsApiError && error.status === 400 && /unable to parse range/i.test(error.message)
}

// null when the spreadsheet has no categories tab, so callers fall back to derived categories
export async function fetchCategories(accessToken: string, spreadsheetId: string): Promise<CategoryDefinition[] | null> {
  const range = `${SHEETS.CATEGORIES}!A:C`
  let data: { values?: string[][] }

  try {
    data = await sheetsRequest(accessToken, `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`)
  } catch (error) {
    if (isMissingTab(error)) return null
    throw error
  }

  return parseCategoryRows(data.values || [])
}

// categories and expenses2 in one values:batchGet, the data every page needs first. currencyDates
// can't join: it is read with valueRenderOption=FORMULA, which would return expenses2's formula
// instead of its rows. recentTransactions is null when it couldn't be read here; the caller then
// fetches it on its own, which reports the error.
export async function fetchCategoriesAndRecent(accessToken: string, spreadsheetId: string): Promise<{
  categories: CategoryDefinition[] | null
  recentTransactions: Transaction[] | null
}> {
  const params = new URLSearchParams()
  params.append('ranges', `${SHEETS.CATEGORIES}!A:C`)
  params.append('ranges', `${SHEETS.RECENT}!A:J`)

  try {
    const data = await sheetsRequest(accessToken, `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}/values:batchGet?${params}`)
    return parseCategoriesAndRecent(data.valueRanges)
  } catch (error) {
    // The whole batch fails when one tab is missing, usually the optional categories tab
    if (!isMissingTab(error)) throw error
  }

  const [categories, recentTransactions] = await Promise.all([
    fetchCategories(accessToken, spreadsheetId),
    fetchRecentTransactions(accessToken, spreadsheetId).catch(() => null),
  ])
  return { categories, recentTransactions }
}

export async function appendCategory(accessToken: string, spreadsheetId: string, name: string): Promise<void> {
  const range = `${SHEETS.CATEGORIES}!A:A`
  const url = `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED`

  await sheetsRequest(accessToken, url, {
    method: 'POST',
    body: JSON.stringify({ values: [[asText(name)]] }),
  })
}

// Creates the categories tab, seeded with the given categories and their current colors
export async function createCategoriesSheet(accessToken: string, spreadsheetId: string, categories: CategoryDefinition[]): Promise<void> {
  await sheetsRequest(accessToken, `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({ requests: [{ addSheet: { properties: { title: SHEETS.CATEGORIES } } }] }),
  })

  const range = `${SHEETS.CATEGORIES}!A1`
  await sheetsRequest(accessToken, `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`, {
    method: 'PUT',
    body: JSON.stringify({
      values: [['Category', 'Color', 'Hidden'], ...categories.map(({ name, color }) => [asText(name), color ?? ''])],
    }),
  })
}

// currencyDates!1:4 with formulas; null when the spreadsheet has no currencyDates tab
async function fetchCurrencyRows(accessToken: string, spreadsheetId: string): Promise<unknown[][] | null> {
  const range = `${SHEETS.CURRENCIES}!1:${CURRENCY_LAYOUT_ROWS}`

  try {
    const data = await sheetsRequest(accessToken, `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?valueRenderOption=FORMULA`)
    return data.values || []
  } catch (error) {
    if (isMissingTab(error)) return null
    throw error
  }
}

async function fetchCurrencyLayout(accessToken: string, spreadsheetId: string): Promise<CurrencyLayout | null> {
  const rows = await fetchCurrencyRows(accessToken, spreadsheetId)
  return rows && parseCurrencyLayout(rows)
}

// Read from the sheet, never from the cache: dates as serial numbers, so the locale does not matter
async function fetchEarliestDay(accessToken: string, spreadsheetId: string): Promise<StartDate | null> {
  const range = `${SHEETS.FULL}!A:A`
  const data = await sheetsRequest(accessToken, `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`)
  return findEarliestDay(data.values || [])
}

// null when the spreadsheet has no currencyDates tab (or B1 is empty)
export async function fetchRatesStart(accessToken: string, spreadsheetId: string): Promise<RatesStart | null> {
  const [rows, earliest] = await Promise.all([
    fetchCurrencyRows(accessToken, spreadsheetId),
    fetchEarliestDay(accessToken, spreadsheetId),
  ])
  if (!rows || !parseCurrencyLayout(rows)) return null
  return parseRatesStart(rows, earliest)
}

async function requireCurrencyRows(accessToken: string, spreadsheetId: string) {
  const rows = await fetchCurrencyRows(accessToken, spreadsheetId)
  if (!rows || !parseCurrencyLayout(rows)) {
    throw new Error(`The spreadsheet has no "${SHEETS.CURRENCIES}" tab with the default currency in B1.`)
  }
  return rows
}

// currencyDates!1:4 as shown in the sheet, where a failing formula shows its error, and with each
// pair's first date as a serial number
async function fetchDisplayedCurrencyRows(accessToken: string, spreadsheetId: string): Promise<DisplayedCurrencyRows> {
  const url = `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(`${SHEETS.CURRENCIES}!1:${CURRENCY_LAYOUT_ROWS}`)}`
  const [shown, serials] = await Promise.all([
    sheetsRequest(accessToken, url),
    sheetsRequest(accessToken, `${url}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`),
  ])
  return { shown: shown.values || [], serials: serials.values || [] }
}

async function writeCurrencyFormulas(accessToken: string, spreadsheetId: string, updates: { range: string; formula: string }[]) {
  await sheetsRequest(accessToken, `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}/values:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({
      valueInputOption: 'USER_ENTERED',
      data: updates.map(({ range, formula }) => ({ range: `${SHEETS.CURRENCIES}!${range}`, values: [[formula]] })),
    }),
  })
}

// GOOGLEFINANCE fetches its data after the write, showing "Loading..." meanwhile
const RATE_CHECK_DELAYS_MS = [1000, 2000, 3000, 4000, 5000]

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// Moves the rates' start back to the earliest transaction, rewriting every currency formula in
// one batchUpdate so no pair is left on the old start. newStart is the date the user confirmed;
// if the earliest transaction changed since, nothing is written. Then waits for GOOGLEFINANCE
// and reports the currencies it has no rates for that far back, so the user can revert.
export async function extendRates(accessToken: string, spreadsheetId: string, newStart: StartDate): Promise<ExtendResult> {
  const [rows, earliest, displayedBefore] = await Promise.all([
    requireCurrencyRows(accessToken, spreadsheetId),
    fetchEarliestDay(accessToken, spreadsheetId),
    fetchDisplayedCurrencyRows(accessToken, spreadsheetId),
  ])
  if (!earliest || compareDates(earliest, newStart) !== 0) {
    throw new Error(`The earliest transaction is no longer on ${formatDate(newStart)}. Reload and try again.`)
  }

  const updates = extendStartDate(rows, newStart)
  if (typeof updates === 'string') throw new Error(updates)
  // extendStartDate succeeded, so the formulas share a readable start
  const previousStart = findStartDate(rows) as StartDate

  await writeCurrencyFormulas(accessToken, spreadsheetId, updates)

  const before = rateStatuses(rows, displayedBefore, previousStart)
  let problems = newRateProblems(before, [])
  for (const delay of [0, ...RATE_CHECK_DELAYS_MS]) {
    await sleep(delay)
    problems = newRateProblems(before, rateStatuses(rows, await fetchDisplayedCurrencyRows(accessToken, spreadsheetId), newStart))
    if (problems.loading.length === 0) break
  }

  return { previousStart, ...problems }
}

// Puts the start back to previousStart after an extension Google Finance has no rates for. All
// pairs move together: the expenses formula needs them to share one start.
export async function revertRates(accessToken: string, spreadsheetId: string, extendedStart: StartDate, previousStart: StartDate): Promise<void> {
  const rows = await requireCurrencyRows(accessToken, spreadsheetId)
  const updates = revertStartDate(rows, extendedStart, previousStart)
  if (typeof updates === 'string') throw new Error(updates)

  await writeCurrencyFormulas(accessToken, spreadsheetId, updates)
}

// null when the spreadsheet has no currencyDates tab (or B1 is empty): callers fall back to
// the currencies found in transactions, converted to PLN
export async function fetchCurrencies(accessToken: string, spreadsheetId: string): Promise<CurrencyList | null> {
  const layout = await fetchCurrencyLayout(accessToken, spreadsheetId)
  return layout && { defaultCurrency: layout.defaultCurrency, currencies: layout.currencies }
}

async function requireCurrencyLayout(accessToken: string, spreadsheetId: string) {
  const layout = await fetchCurrencyLayout(accessToken, spreadsheetId)
  if (!layout) {
    throw new Error(`The spreadsheet has no "${SHEETS.CURRENCIES}" tab with the default currency in B1.`)
  }
  return layout
}

async function fetchSheetGrid(accessToken: string, spreadsheetId: string, title: string) {
  const metadata = await sheetsRequest(accessToken, `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}?fields=sheets.properties(sheetId,title,gridProperties.columnCount)`)
  const properties = metadata.sheets?.find((sheet: { properties: { title: string } }) => sheet.properties.title === title)?.properties

  if (!properties) {
    throw new Error(`The spreadsheet has no "${title}" tab.`)
  }

  return { sheetId: properties.sheetId as number, columnCount: (properties.gridProperties?.columnCount ?? 0) as number }
}

// Adds a standard currency (no multiplier) or a custom one in the first pair of columns left
// empty by a removed currency, else after all existing ones. The pair's whole columns must be
// empty, so nothing is overwritten.
export async function addCurrency(
  accessToken: string,
  spreadsheetId: string,
  input: { code: string; multiplier?: number }
): Promise<void> {
  const layout = await requireCurrencyLayout(accessToken, spreadsheetId)
  const invalid = validateNewCurrency(layout, input)
  if (invalid) throw new Error(invalid)
  // A new pair needs the start date the others share, or its rates would sit on the wrong rows
  if (typeof layout.startDate === 'string') throw new Error(layout.startDate)

  const spreadsheetUrl = `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}`
  const first = layout.nextColumn
  const columns = `${columnLetter(first)}:${columnLetter(first + 1)}`
  const { sheetId, columnCount } = await fetchSheetGrid(accessToken, spreadsheetId, SHEETS.CURRENCIES)

  if (columnCount < first + 2) {
    await sheetsRequest(accessToken, `${spreadsheetUrl}:batchUpdate`, {
      method: 'POST',
      body: JSON.stringify({ requests: [{ appendDimension: { sheetId, dimension: 'COLUMNS', length: first + 2 - columnCount } }] }),
    })
  } else {
    // A formula only spills into empty cells; anything left lower in these columns would break it
    const existing = await sheetsRequest(accessToken, `${spreadsheetUrl}/values/${encodeURIComponent(`${SHEETS.CURRENCIES}!${columns}`)}`)
    if ((existing.values || []).some((row: string[]) => row.some(cell => cell !== ''))) {
      throw new Error(`Columns ${columns} of the "${SHEETS.CURRENCIES}" tab are not empty. Clear them in the spreadsheet first.`)
    }
  }

  const cells = newCurrencyCells(first, input, layout.startDate)
  const range = `${SHEETS.CURRENCIES}!${columnLetter(first)}1:${columnLetter(first + 1)}${cells.length}`

  await sheetsRequest(accessToken, `${spreadsheetUrl}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`, {
    method: 'PUT',
    body: JSON.stringify({ values: cells }),
  })
}

async function requireCurrency(accessToken: string, spreadsheetId: string, code: string, column: number) {
  const layout = await requireCurrencyLayout(accessToken, spreadsheetId)
  const currency = layout.currencies.find(c => c.code === code && c.column === column)
  if (!currency) {
    throw new Error('The currencies changed in the spreadsheet. Reload and try again.')
  }
  return currency
}

// Only a custom currency's multiplier can change; it applies to every date, past ones included
export async function updateCurrencyMultiplier(
  accessToken: string,
  spreadsheetId: string,
  currency: { code: string; column: number },
  multiplier: number
): Promise<void> {
  if (!Number.isFinite(multiplier) || multiplier <= 0) {
    throw new Error('The multiplier must be a positive number.')
  }

  const current = await requireCurrency(accessToken, spreadsheetId, currency.code, currency.column)
  if (current.kind !== 'custom') {
    throw new Error(`${currency.code} is an exchange rate, not a multiplier.`)
  }

  const range = `${SHEETS.CURRENCIES}!${columnLetter(currency.column)}1`
  await sheetsRequest(accessToken, `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`, {
    method: 'PUT',
    body: JSON.stringify({ values: [[multiplier]] }),
  })
}

// Clears the currency's cells but keeps its columns: deleting them would shift every later pair
// away from the column numbers in row 2. Refused for the default currency and for a currency any
// transaction uses, whose amounts could no longer be converted.
export async function removeCurrency(
  accessToken: string,
  spreadsheetId: string,
  currency: { code: string; column: number }
): Promise<void> {
  const current = await requireCurrency(accessToken, spreadsheetId, currency.code, currency.column)
  if (current.isDefault) {
    throw new Error('The default currency cannot be removed.')
  }

  const spreadsheetUrl = `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}`
  const currencyColumn = await sheetsRequest(accessToken, `${spreadsheetUrl}/values/${encodeURIComponent(`${SHEETS.FULL}!E:E`)}`)
  const uses = ((currencyColumn.values || []) as string[][]).filter(row => row[0]?.trim() === currency.code).length

  if (uses > 0) {
    throw new Error(`${uses} transaction${uses === 1 ? ' uses' : 's use'} ${currency.code}. Change them first.`)
  }

  const range = `${SHEETS.CURRENCIES}!${columnLetter(currency.column)}1:${columnLetter(currency.column + 1)}${CURRENCY_LAYOUT_ROWS}`
  await sheetsRequest(accessToken, `${spreadsheetUrl}/values:batchClear`, {
    method: 'POST',
    body: JSON.stringify({ ranges: [range] }),
  })
}

// Every converted amount is recalculated in the new default currency; see defaultCurrencySwap
export async function changeDefaultCurrency(accessToken: string, spreadsheetId: string, code: string): Promise<void> {
  const layout = await requireCurrencyLayout(accessToken, spreadsheetId)
  const swap = defaultCurrencySwap(layout, code)
  if (typeof swap === 'string') throw new Error(swap)

  await sheetsRequest(accessToken, `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}/values:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({
      valueInputOption: 'USER_ENTERED',
      data: swap.map(({ range, value }) => ({ range: `${SHEETS.CURRENCIES}!${range}`, values: [[asText(value)]] })),
    }),
  })
}

// Hides or shows a category on the Add page by setting column C of its row; transactions are
// never touched. Showing a category that is not in the list adds it.
export async function setCategoryHidden(accessToken: string, spreadsheetId: string, name: string, hidden: boolean): Promise<void> {
  const valuesUrl = `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}/values`
  const column = await sheetsRequest(accessToken, `${valuesUrl}/${encodeURIComponent(`${SHEETS.CATEGORIES}!A:A`)}`)
  const cells: string[][] = column.values || []
  const data = cells.flatMap((row, index) => row[0]?.trim().toLowerCase() === name
    ? [{ range: `${SHEETS.CATEGORIES}!C${index + 1}`, values: [[hidden ? 'hidden' : '']] }]
    : [])

  if (data.length === 0) {
    if (!hidden) await appendCategory(accessToken, spreadsheetId, name)
    return
  }

  await sheetsRequest(accessToken, `${valuesUrl}:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data }),
  })
}

// The recurring tab is read with dates as serial numbers, so the sheet's locale does not matter;
// null when the spreadsheet has no recurring tab yet
export async function fetchRecurringPayments(accessToken: string, spreadsheetId: string): Promise<RecurringPayment[] | null> {
  const range = `${SHEETS.RECURRING}!A:J`
  let data: { values?: unknown[][] }

  try {
    data = await sheetsRequest(accessToken, `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`)
  } catch (error) {
    if (isMissingTab(error)) return null
    throw error
  }

  return parseRecurringRows(data.values || [])
}

// Dates are written as YYYY-MM-DD, which USER_ENTERED turns into dates in every locale
function toRecurringRow(payment: RecurringPayment): (string | number)[] {
  return [
    asText(payment.id),
    asText(payment.what),
    asText(payment.category),
    payment.amount,
    asText(payment.currency),
    payment.every,
    payment.unit,
    isoDate(payment.start),
    isoDate(payment.next),
    payment.end ? isoDate(payment.end) : '',
  ]
}

// next defaults to the start; a payment set up from a transaction already paid passes a later one
export async function addRecurringPayment(accessToken: string, spreadsheetId: string, input: RecurringPaymentInput, next = input.start): Promise<void> {
  const spreadsheetUrl = `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}`

  if (await fetchRecurringPayments(accessToken, spreadsheetId) === null) {
    await sheetsRequest(accessToken, `${spreadsheetUrl}:batchUpdate`, {
      method: 'POST',
      body: JSON.stringify({ requests: [{ addSheet: { properties: { title: SHEETS.RECURRING } } }] }),
    })
    await sheetsRequest(accessToken, `${spreadsheetUrl}/values/${encodeURIComponent(`${SHEETS.RECURRING}!A1`)}?valueInputOption=RAW`, {
      method: 'PUT',
      body: JSON.stringify({ values: [RECURRING_HEADER] }),
    })
  }

  const payment = { ...input, id: crypto.randomUUID(), next }
  await sheetsRequest(accessToken, `${spreadsheetUrl}/values/${encodeURIComponent(`${SHEETS.RECURRING}!A:J`)}:append?valueInputOption=USER_ENTERED`, {
    method: 'POST',
    body: JSON.stringify({ values: [toRecurringRow(payment)] }),
  })
}

// The payment's sheet row, re-read to make sure it still holds what the user saw; otherwise the
// write aborts, as for transactions
async function findRecurringRow(accessToken: string, spreadsheetId: string, original: RecurringPayment) {
  const valuesUrl = `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}/values`
  const ids = await sheetsRequest(accessToken, `${valuesUrl}/${encodeURIComponent(`${SHEETS.RECURRING}!A:A`)}`)
  const matches = rowsWithId(ids.values || [], original.id)

  if (matches.length === 0) {
    throw new Error('This recurring payment was not found in the spreadsheet. Reload and try again.')
  }
  if (matches.length > 1) {
    throw new Error('Several rows share this recurring payment ID. Edit it directly in the spreadsheet.')
  }

  const sheetRow = matches[0] + 1
  const current = await sheetsRequest(accessToken, `${valuesUrl}/${encodeURIComponent(`${SHEETS.RECURRING}!A${sheetRow}:J${sheetRow}`)}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`)
  const [parsed] = parseRecurringRows(current.values || [])

  if (!parsed || !sameRecurringPayment(parsed, original)) {
    throw new Error('This recurring payment changed in the spreadsheet. Reload and try again.')
  }

  return sheetRow
}

async function writeRecurringRow(accessToken: string, spreadsheetId: string, sheetRow: number, payment: RecurringPayment) {
  const range = `${SHEETS.RECURRING}!A${sheetRow}:J${sheetRow}`
  await sheetsRequest(accessToken, `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`, {
    method: 'PUT',
    body: JSON.stringify({ values: [toRecurringRow(payment)] }),
  })
}

// Payments already approved or removed stay handled under the new schedule (rescheduledNext)
export async function updateRecurringPayment(accessToken: string, spreadsheetId: string, original: RecurringPayment, input: RecurringPaymentInput): Promise<void> {
  const sheetRow = await findRecurringRow(accessToken, spreadsheetId, original)
  await writeRecurringRow(accessToken, spreadsheetId, sheetRow, { ...input, id: original.id, next: rescheduledNext(original.next, input) })
}

// Transactions it already added stay
export async function deleteRecurringPayment(accessToken: string, spreadsheetId: string, original: RecurringPayment): Promise<void> {
  const sheetRow = await findRecurringRow(accessToken, spreadsheetId, original)
  const { sheetId } = await fetchSheetGrid(accessToken, spreadsheetId, SHEETS.RECURRING)

  await sheetsRequest(accessToken, `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({
      requests: [{ deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex: sheetRow - 1, endIndex: sheetRow } } }],
    }),
  })
}

// Adds the draft as a transaction, then moves the payment to its next date. The transaction's ID
// comes from the payment and the date, so a retry after a failed second step doesn't add it twice.
// Sheets with formula IDs get no ID and no such check.
export async function approveRecurringDraft(accessToken: string, spreadsheetId: string, draft: Pick<RecurringDraft, 'payment' | 'date'>): Promise<void> {
  const { payment, date } = draft
  const sheetRow = await findRecurringRow(accessToken, spreadsheetId, payment)
  const input = draftTransaction(draft)

  if (await hasStoredIds(accessToken, spreadsheetId)) {
    const transactionId = draftTransactionId(draft)
    if (!await transactionIdExists(accessToken, spreadsheetId, transactionId)) {
      await appendQueuedTransaction(accessToken, spreadsheetId, input, transactionId)
    }
  } else {
    await appendTransaction(accessToken, spreadsheetId, input)
  }

  await writeRecurringRow(accessToken, spreadsheetId, sheetRow, { ...payment, next: occurrenceAfter(payment, date) })
}

// Moves the payment to its next date without adding a transaction
export async function skipRecurringDraft(accessToken: string, spreadsheetId: string, draft: Pick<RecurringDraft, 'payment' | 'date'>): Promise<void> {
  const { payment, date } = draft
  const sheetRow = await findRecurringRow(accessToken, spreadsheetId, payment)
  await writeRecurringRow(accessToken, spreadsheetId, sheetRow, { ...payment, next: occurrenceAfter(payment, date) })
}
