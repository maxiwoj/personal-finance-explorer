import { SHEETS_API_BASE, SHEETS } from './config'
import type { Transaction, TransactionInput } from './types'

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
    
    // Columns: Timestamp, What, Category, Amount, Currency, AmountPLN, MonthYear, TransactionID
    const [timestamp, what, category, amount, currency, amountPLN, monthYear, transactionId] = row
    
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
      currency: currency?.trim() || 'PLN',
      amountPLN: pAmountPLN !== null ? pAmountPLN : pAmountOriginal,
      monthYear: derivedMonthYear,
      monthName: '', // Not used - derive from timestamp when needed
      transactionId: transactionId?.trim() || `${timestamp}-${what}-${Math.random().toString(36).slice(2, 8)}`
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
  const range = `${sheetName}!A:H`
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

// Only the input columns (Timestamp..Currency) are written; the template's ARRAYFORMULAs
// derive AmountPLN, MonthYear and TransactionID.
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

    if (response.status === 403) {
      message = 'You need edit access to this spreadsheet to save transactions.'
    }

    throw new SheetsApiError(message, response.status)
  }

  return response.json()
}

export async function appendTransaction(
  accessToken: string,
  spreadsheetId: string,
  input: TransactionInput
): Promise<void> {
  const range = `${SHEETS.FULL}!A:${INPUT_RANGE_END}`
  const url = `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED`

  await sheetsRequest(accessToken, url, {
    method: 'POST',
    body: JSON.stringify({ values: [toInputRow(input)] }),
  })
}

function matchesTransaction(row: string[], original: Transaction) {
  const parsed = parseRow(row)
  if (!parsed) return false

  // Rows without an ID get a random one on read, so only compare IDs the sheet actually holds
  const sheetId = row[7]?.trim()
  if (sheetId && sheetId !== original.transactionId) return false

  return parsed.timestamp.getTime() === original.timestamp.getTime() &&
    parsed.what === original.what &&
    parsed.category === original.category &&
    parsed.amountOriginal === original.amountOriginal &&
    parsed.currency === original.currency
}

// Transactions may come from either tab, so the row is located in the full tab by content
// right before writing. Anything but exactly one match aborts instead of guessing.
export async function updateTransaction(
  accessToken: string,
  spreadsheetId: string,
  original: Transaction,
  input: TransactionInput
): Promise<void> {
  const readRange = `${SHEETS.FULL}!A:H`
  const sheet = await sheetsRequest(
    accessToken,
    `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(readRange)}`
  )
  const rows: string[][] = sheet.values || []

  const matches: number[] = []
  rows.forEach((row, index) => {
    const isHeader = index === 0 && row[0]?.toLowerCase().includes('timestamp')
    if (!isHeader && matchesTransaction(row, original)) matches.push(index)
  })

  if (matches.length === 0) {
    throw new Error('This transaction changed in the spreadsheet. Reload the data and try again.')
  }

  if (matches.length > 1) {
    throw new Error('Several identical rows match this transaction. Edit it directly in the spreadsheet.')
  }

  const sheetRow = matches[0] + 1
  const next = toInputRow(input)
  const changed = [
    input.timestamp.getTime() !== original.timestamp.getTime(),
    input.what !== original.what,
    input.category.toLowerCase() !== original.category,
    input.amount !== original.amountOriginal,
    input.currency !== original.currency,
  ]

  // Only changed cells are written, so untouched cells keep their exact value and formatting
  const data = next.flatMap((value, index) => changed[index]
    ? [{ range: `${SHEETS.FULL}!${'ABCDE'[index]}${sheetRow}`, values: [[value]] }]
    : [])

  if (data.length === 0) return

  await sheetsRequest(accessToken, `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}/values:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data }),
  })
}
