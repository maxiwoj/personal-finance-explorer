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
}

export type SampleDataPlan =
  | { ok: true; counts: SampleDataCounts; ranges: string[] }
  | { ok: false; reason: string }

const hasValue = (row: string[] | undefined, from: number, to: number) =>
  !!row && row.slice(from, to + 1).some(cell => cell?.trim())

// 1-based numbers of the rows below the header that hold something in columns from..to
function dataRows(rows: string[][], from: number, to: number) {
  return rows.flatMap((row, index) => index > 0 && hasValue(row, from, to) ? [index + 1] : [])
}

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

export const NOT_SAMPLE_MESSAGE = "This spreadsheet isn't a fresh copy of the template, so its data can't be cleared from the app."

// What clearing the sample data removes, or why it is refused. Allowed only while the config tab
// marks the sheet as the template's sample (templateSample) and every transaction and recurring
// payment is a sample one, so data the user added is never touched. Cells are cleared, not rows
// deleted, so the header and the formula columns (expenses F:G) stay; only the rows read are
// cleared, so a row appended meanwhile survives.
export function planSampleDataClear(sheets: SampleDataRows, tabs: { config: string; expenses: string; recurring: string; categories: string }): SampleDataPlan {
  const config = sheets.config ?? []
  const markerRows = config.flatMap((row, index) => row[0]?.trim() === CONFIG_KEYS.TEMPLATE_SAMPLE ? [index + 1] : [])
  if (!isTemplateSample(parseConfigRows(config))) return { ok: false, reason: NOT_SAMPLE_MESSAGE }

  // Input columns A:E and H:K (TransactionID, Notes, ReturnOf, Recurring); F:G are formulas
  const expenses = sheets.expenses
  const transactions = expenses.flatMap((row, index) => index > 0 && (hasValue(row, 0, 4) || hasValue(row, 7, 10)) ? [index + 1] : [])
  const ownTransactions = transactions.filter(row => !isSampleId(expenses[row - 1][7])).length

  const recurring = sheets.recurring ?? []
  const payments = dataRows(recurring, 0, 9)
  const ownPayments = payments.filter(row => !isSampleId(recurring[row - 1][0])).length

  if (ownTransactions || ownPayments) {
    const own = [ownTransactions && plural(ownTransactions, 'transaction'), ownPayments && plural(ownPayments, 'recurring payment')].filter(Boolean).join(' and ')
    return { ok: false, reason: `This spreadsheet has ${own} that ${ownTransactions + ownPayments === 1 ? "isn't" : "aren't"} sample data, so the app won't clear it. Delete the sample rows in the sheet instead.` }
  }

  const categories = dataRows(sheets.categories ?? [], 0, 2)
  const ranges = [
    ...(expenses.length > 1 ? [`${tabs.expenses}!A2:E${expenses.length}`, `${tabs.expenses}!H2:K${expenses.length}`] : []),
    ...(recurring.length > 1 ? [`${tabs.recurring}!A2:J${recurring.length}`] : []),
    ...(sheets.categories && sheets.categories.length > 1 ? [`${tabs.categories}!A2:C${sheets.categories.length}`] : []),
    ...markerRows.map(row => `${tabs.config}!A${row}:C${row}`),
  ]

  return { ok: true, counts: { transactions: transactions.length, recurring: payments.length, categories: categories.length }, ranges }
}
