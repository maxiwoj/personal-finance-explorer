import { SHEETS_API_BASE, SHEETS } from './config'
import { columnLetter, CURRENCY_LAYOUT_ROWS, defaultCurrencySwap, newCurrencyCells, parseCurrencyLayout, validateNewCurrency, type CurrencyLayout } from './currencies'
import { recordedAmount } from './returns'
import type { CategoryDefinition, CurrencyList, Transaction, TransactionInput } from './types'

export class SheetsApiError extends Error {
  constructor(message: string, public status: number) {
    super(message)
    this.name = 'SheetsApiError'
  }
}

function parseTimestamp(timestampStr: string): Date {
  // Always try DD/MM/YYYY format first (European format)
  // Match: DD/MM/YYYY with optional time (any separator: space, T, or nothing)
  // Time formats: HH:MM, HH:MM:SS, H:MM, H:MM:SS
  const dateTimeMatch = timestampStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[\sT]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/)
  if (dateTimeMatch) {
    const [, day, month, year, hours, minutes, seconds] = dateTimeMatch
    return new Date(
      parseInt(year),
      parseInt(month) - 1,
      parseInt(day),
      hours ? parseInt(hours) : 0,
      minutes ? parseInt(minutes) : 0,
      seconds ? parseInt(seconds) : 0
    )
  }
  
  // Try ISO format (e.g., 2024-03-15T10:30:00 or 2024-03-15 10:30:00)
  const isoMatch = timestampStr.match(/^(\d{4})-(\d{2})-(\d{2})(?:[\sT]+(\d{2}):(\d{2})(?::(\d{2}))?)?/)
  if (isoMatch) {
    const [, year, month, day, hours, minutes, seconds] = isoMatch
    return new Date(
      parseInt(year),
      parseInt(month) - 1,
      parseInt(day),
      hours ? parseInt(hours) : 0,
      minutes ? parseInt(minutes) : 0,
      seconds ? parseInt(seconds) : 0
    )
  }
  
  // Last resort fallback - try native parsing
  const fallbackDate = new Date(timestampStr)
  if (!isNaN(fallbackDate.getTime())) {
    return fallbackDate
  }
  
  // Return current date if nothing works
  console.error('Failed to parse date:', timestampStr)
  return new Date()
}

export function parseMoney(value: string | undefined): number | null {
  if (!value) return null
  
  // Clean the string:
  // 1. Replace special minus sign − (U+2212) with standard hyphen -
  // 2. Remove any characters that are not digits, commas, dots, or the leading minus sign
  // 3. Keep the minus sign only if it's at the beginning
  
  let cleaned = value.trim().replace(/−/g, '-')
  
  // If there are multiple minus signs or it's not at the start, this is weird but let's be safe
  const isNegative = cleaned.startsWith('-')
  
  // Remove everything except digits, dots and commas
  cleaned = cleaned.replace(/[^\d.,]/g, '')
  
  if (!cleaned) return null
  
  // Handle decimal separator
  // If there's both a comma and a dot, the last one is likely the decimal separator
  const lastComma = cleaned.lastIndexOf(',')
  const lastDot = cleaned.lastIndexOf('.')
  
  if (lastComma > lastDot) {
    // Comma is decimal separator (e.g. 1.234,56 or 1234,56)
    // Remove dots (thousands separators) and replace comma with dot
    cleaned = cleaned.replace(/\./g, '').replace(',', '.')
  } else if (lastDot > lastComma) {
    // Dot is decimal separator (e.g. 1,234.56 or 1234.56)
    // Remove commas (thousands separators)
    cleaned = cleaned.replace(/,/g, '')
  } else {
    // Only one type of separator or none. 
    // If it's a comma, it might be a decimal separator (European) or thousands (US)
    // In the context of PLN, it's very likely a decimal separator.
    // However, if it's followed by exactly 3 digits, it *might* be thousands.
    // But let's assume if there's only one, it's a decimal separator if it's towards the end.
    if (lastComma !== -1) {
      cleaned = cleaned.replace(',', '.')
    }
  }
  
  const parsed = parseFloat(cleaned)
  if (isNaN(parsed)) return null
  
  return isNegative ? -parsed : parsed
}

function parseRow(row: string[]): Transaction | null {
  try {
    if (row.length < 7) return null
    
    // Columns: Timestamp, What, Category, Amount, Currency, AmountPLN, MonthYear, TransactionID, Notes, ReturnOf
    const [timestamp, what, category, amount, currency, amountPLN, monthYear, transactionId, notes, returnOf] = row
    
    if (!timestamp || !what || !category) return null
    
    const parsedTimestamp = parseTimestamp(timestamp)
    
    // Generate monthYear from timestamp if not provided
    const derivedMonthYear = monthYear?.trim() || 
      `${parsedTimestamp.getMonth() + 1}_${parsedTimestamp.getFullYear()}`
    
    const pAmountOriginal = parseMoney(amount) || 0
    const pAmountPLN = parseMoney(amountPLN)
    
    return {
      timestamp: parsedTimestamp,
      what: what.trim(),
      category: category.trim().toLowerCase(),
      amountOriginal: pAmountOriginal,
      // Empty means the default currency, which resolveDefaultCurrency fills in once it is known
      currency: currency?.trim() ?? '',
      amountPLN: pAmountPLN !== null ? pAmountPLN : pAmountOriginal,
      monthYear: derivedMonthYear,
      monthName: '', // Not used - derive from timestamp when needed
      transactionId: transactionId?.trim() || `${timestamp}-${what}-${Math.random().toString(36).slice(2, 8)}`,
      notes: notes?.trim() ?? '',
      returnOf: returnOf?.trim() ?? '',
    }
  } catch {
    return null
  }
}

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
  const rows: string[][] = data.values || []
  
  // Skip header row if present
  const dataRows = rows.length > 0 && rows[0][0]?.toLowerCase().includes('timestamp')
    ? rows.slice(1)
    : rows
  
  return dataRows
    .map(parseRow)
    .filter((t): t is Transaction => t !== null)
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
async function hasStoredIds(accessToken: string, spreadsheetId: string) {
  const range = `${SHEETS.FULL}!H1:H2`
  const data = await sheetsRequest(accessToken, `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?valueRenderOption=FORMULA`)
  const cells: unknown[][] = data.values || []
  return !cells.some(row => typeof row[0] === 'string' && row[0].startsWith('='))
}

// Index into the TransactionID column, which is also the sheet row number minus one
async function findRowIndex(accessToken: string, spreadsheetId: string, transactionId: string) {
  const range = `${SHEETS.FULL}!H:H`
  const idColumn = await sheetsRequest(accessToken, `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`)
  const ids: string[][] = idColumn.values || []
  const matches = ids.flatMap((row, index) => row[0]?.trim() === transactionId ? [index] : [])

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

const HEX_COLOR = /^#[0-9a-f]{6}$/i

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

  const rows = data.values || []
  const seen = new Set<string>()

  return rows
    .filter((row, index) => !(index === 0 && /^categor(y|ies)$/i.test(row[0]?.trim() ?? '')))
    .map(([name, color, hidden]) => ({
      name: name?.trim().toLowerCase() ?? '',
      color: color && HEX_COLOR.test(color.trim()) ? color.trim() : null,
      // Any value hides it, except FALSE, so a checkbox column works too
      hidden: !!hidden?.trim() && !/^false$/i.test(hidden.trim()),
    }))
    .filter(({ name }) => {
      if (!name || seen.has(name)) return false
      seen.add(name)
      return true
    })
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

async function fetchCurrencyLayout(accessToken: string, spreadsheetId: string): Promise<CurrencyLayout | null> {
  const range = `${SHEETS.CURRENCIES}!1:${CURRENCY_LAYOUT_ROWS}`
  let data: { values?: unknown[][] }

  try {
    data = await sheetsRequest(accessToken, `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?valueRenderOption=FORMULA`)
  } catch (error) {
    if (isMissingTab(error)) return null
    throw error
  }

  return parseCurrencyLayout(data.values || [])
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
