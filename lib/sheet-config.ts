// The optional config tab: per-spreadsheet settings as key/value rows (A: key, B: value,
// C: an optional note), with an optional "Key | Value | Note" header. Kept free of runtime
// imports so tests can load it.

export const CONFIG_KEYS = {
  // TRUE only in the template and its fresh copies: allows clearing the sample data. Removed
  // when it is cleared, so a sheet without it can never be cleared from the app.
  TEMPLATE_SAMPLE: 'templateSample',
  // Reserved for spreadsheet migrations: the layout version the sheet is known to have. A missing
  // value means unknown, never version 0, so older sheets keep being detected from their columns.
  SCHEMA_VERSION: 'schemaVersion',
} as const

export type SheetConfig = Record<string, string>

// Sample rows carry this prefix in their ID (expenses!H, recurring!A); IDs the app writes are
// UUIDs, so any row the user added stands out
export const SAMPLE_ID_PREFIX = 'sample-'

function isHeader(row: string[] | undefined) {
  return /^key$/i.test(row?.[0]?.trim() ?? '')
}

// Keys are matched case-sensitively; the first row with a key wins
export function parseConfigRows(rows: string[][]): SheetConfig {
  const config: SheetConfig = {}
  rows.forEach((row, index) => {
    const key = row[0]?.trim()
    if (!key || (index === 0 && isHeader(row)) || key in config) return
    config[key] = row[1]?.trim() ?? ''
  })
  return config
}

// TRUE (a checkbox too), YES or 1
export function isConfigTrue(value: string | undefined) {
  return /^(true|yes|1)$/i.test(value?.trim() ?? '')
}

export function isTemplateSample(config: SheetConfig | null | undefined) {
  return isConfigTrue(config?.[CONFIG_KEYS.TEMPLATE_SAMPLE])
}

export function isSampleId(id: string | undefined) {
  return !!id?.trim().startsWith(SAMPLE_ID_PREFIX)
}

export interface SampleDataRows {
  // Each tab as read (A1 notation from row 1, header included); null when the tab is missing
  config: string[][] | null
  expenses: string[][]
  recurring: string[][] | null
  categories: string[][] | null
}

export interface SampleDataCounts {
  transactions: number
  recurring: number
  categories: number
  // The user's own, which stay
  keptTransactions: number
  keptRecurring: number
}

// Row numbers are 1-based, as in the sheet
export interface SampleDataChanges {
  deleteExpenseRows: number[]
  deleteRecurringRows: number[]
  // Rows whose cells A:C are emptied: all categories when nothing of the user's stays, and the marker
  clearCategoryRows: number[]
  clearConfigRows: number[]
}

export type SampleDataPlan =
  | { ok: true; counts: SampleDataCounts; changes: SampleDataChanges }
  | { ok: false; reason: string }

const hasValue = (row: string[] | undefined, from: number, to: number) =>
  !!row && row.slice(from, to + 1).some(cell => cell?.trim())

// 1-based numbers of the rows below the header that match
function rowNumbers(rows: string[][], matches: (row: string[]) => boolean) {
  return rows.flatMap((row, index) => index > 0 && matches(row) ? [index + 1] : [])
}

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

function listRows(rows: number[]) {
  const shown = rows.slice(0, 10).join(', ')
  return rows.length > 10 ? `${shown} and ${rows.length - 10} more` : shown
}

export const NOT_SAMPLE_MESSAGE = "This spreadsheet isn't a fresh copy of the template, so its data can't be cleared from the app."

// expenses columns read as A:K
const RETURN_OF = 9
const RECURRING_LINK = 10
const TRANSACTION_ID = 7

// What clearing the sample data removes, or why it is refused. Allowed only while the config tab
// marks the sheet as the template's sample (templateSample). Only rows with a sample ID are
// deleted (whole rows, so the user's rows close up; the header stays); the user's own
// transactions and recurring payments stay. Refused while one of the user's transactions points
// at a sample row (a return of a sample purchase, or a payment from a sample recurring payment),
// which would be left pointing at nothing. Categories are emptied only when nothing of the user's
// stays, since their transactions use them.
export function planSampleDataClear(sheets: SampleDataRows): SampleDataPlan {
  const config = sheets.config ?? []
  if (!isTemplateSample(parseConfigRows(config))) return { ok: false, reason: NOT_SAMPLE_MESSAGE }
  const clearConfigRows = config.flatMap((row, index) => row[0]?.trim() === CONFIG_KEYS.TEMPLATE_SAMPLE ? [index + 1] : [])

  const expenses = sheets.expenses
  // Input columns A:E and H:K; a row with only formula output in F:G holds no transaction
  const isTransaction = (row: string[]) => hasValue(row, 0, 4) || hasValue(row, TRANSACTION_ID, RECURRING_LINK)
  const deleteExpenseRows = rowNumbers(expenses, row => isTransaction(row) && isSampleId(row[TRANSACTION_ID]))
  const ownTransactions = rowNumbers(expenses, row => isTransaction(row) && !isSampleId(row[TRANSACTION_ID]))

  const recurring = sheets.recurring ?? []
  const isPayment = (row: string[]) => hasValue(row, 0, 9)
  const deleteRecurringRows = rowNumbers(recurring, row => isPayment(row) && isSampleId(row[0]))
  const ownPayments = rowNumbers(recurring, row => isPayment(row) && !isSampleId(row[0]))

  // A link is "<payment ID>@<date>"
  const pointsAtSample = ownTransactions.filter(number => {
    const row = expenses[number - 1]
    return isSampleId(row[RETURN_OF]) || isSampleId(row[RECURRING_LINK]?.split('@')[0])
  })
  if (pointsAtSample.length) {
    return {
      ok: false,
      reason: `${plural(pointsAtSample.length, 'transaction')} of yours ${pointsAtSample.length === 1 ? 'points' : 'point'} at sample data (a return of a sample purchase, or a payment from a sample recurring payment), so ${pointsAtSample.length === 1 ? 'it' : 'they'} would be left pointing at nothing. Change or delete ${pointsAtSample.length === 1 ? 'it' : 'them'} in the "expenses" tab first: row ${listRows(pointsAtSample)}.`,
    }
  }

  const keepsOwnData = ownTransactions.length > 0 || ownPayments.length > 0
  const clearCategoryRows = keepsOwnData ? [] : rowNumbers(sheets.categories ?? [], row => hasValue(row, 0, 2))

  return {
    ok: true,
    counts: {
      transactions: deleteExpenseRows.length,
      recurring: deleteRecurringRows.length,
      categories: clearCategoryRows.length,
      keptTransactions: ownTransactions.length,
      keptRecurring: ownPayments.length,
    },
    changes: { deleteExpenseRows, deleteRecurringRows, clearCategoryRows, clearConfigRows },
  }
}

export interface TabGrid {
  sheetId: number
  rowCount: number
  frozenRowCount: number
}

// Runs of consecutive row numbers as 0-based [start, end), last run first, so deleting one never
// shifts the rows of the next
function runsFromBottom(rows: number[]) {
  const runs: [number, number][] = []
  for (const row of [...rows].sort((a, b) => a - b)) {
    const last = runs[runs.length - 1]
    if (last && last[1] === row - 1) last[1] = row
    else runs.push([row - 1, row])
  }
  return runs.reverse()
}

function deleteRequests(grid: TabGrid, rows: number[]) {
  if (!rows.length) return []
  // Sheets refuses to delete every non-frozen row, so one empty row is added first when needed
  const pad = grid.rowCount - rows.length <= grid.frozenRowCount
    ? [{ appendDimension: { sheetId: grid.sheetId, dimension: 'ROWS', length: 1 } }]
    : []
  return [
    ...pad,
    ...runsFromBottom(rows).map(([startIndex, endIndex]) => ({
      deleteDimension: { range: { sheetId: grid.sheetId, dimension: 'ROWS', startIndex, endIndex } },
    })),
  ]
}

function clearRequests(sheetId: number | undefined, rows: number[]) {
  if (sheetId === undefined) return []
  return runsFromBottom(rows).map(([startRowIndex, endRowIndex]) => ({
    updateCells: { range: { sheetId, startRowIndex, endRowIndex, startColumnIndex: 0, endColumnIndex: 3 }, fields: 'userEnteredValue' },
  }))
}

// One spreadsheets:batchUpdate, which Sheets applies all or nothing
export function sampleDataRequests(
  changes: SampleDataChanges,
  grids: { expenses: TabGrid; recurring?: TabGrid; categories?: TabGrid; config?: TabGrid }
): object[] {
  return [
    ...deleteRequests(grids.expenses, changes.deleteExpenseRows),
    ...(grids.recurring ? deleteRequests(grids.recurring, changes.deleteRecurringRows) : []),
    ...clearRequests(grids.categories?.sheetId, changes.clearCategoryRows),
    ...clearRequests(grids.config?.sheetId, changes.clearConfigRows),
  ]
}
