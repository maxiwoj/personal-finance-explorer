// Parsing of values read from the sheet, kept free of runtime imports so tests can load it
import type { CategoryDefinition, Transaction } from './types'

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

export function parseRow(row: string[]): Transaction | null {
  try {
    if (row.length < 7) return null
    
    // Columns: Timestamp, What, Category, Amount, Currency, AmountPLN, MonthYear, TransactionID, Notes, ReturnOf, Recurring
    const [timestamp, what, category, amount, currency, amountPLN, monthYear, transactionId, notes, returnOf, recurring] = row
    
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
      recurring: recurring?.trim() ?? '',
    }
  } catch {
    return null
  }
}

// Rows of a transactions tab (Timestamp..Recurring), with or without the header row
export function parseTransactionRows(rows: string[][]): Transaction[] {
  const dataRows = rows.length > 0 && rows[0][0]?.toLowerCase().includes('timestamp')
    ? rows.slice(1)
    : rows

  return dataRows
    .map(parseRow)
    .filter((t): t is Transaction => t !== null)
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i

// Rows of the categories tab: name, color, hidden; with or without the header row
export function parseCategoryRows(rows: string[][]): CategoryDefinition[] {
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

// The reply of a values:batchGet for [categories, recent transactions], in that order
export function parseCategoriesAndRecent(valueRanges: { values?: string[][] }[] | undefined): {
  categories: CategoryDefinition[]
  recentTransactions: Transaction[]
} {
  const [categories, recent] = valueRanges ?? []
  return {
    categories: parseCategoryRows(categories?.values || []),
    recentTransactions: parseTransactionRows(recent?.values || []),
  }
}

// Indexes of the TransactionID cells (column H, read as rows) holding this ID
export function rowsWithId(ids: string[][], transactionId: string): number[] {
  return ids.flatMap((row, index) => row[0]?.trim() === transactionId ? [index] : [])
}
