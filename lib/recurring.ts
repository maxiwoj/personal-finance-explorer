// Recurring payments: the optional recurring tab, one payment per row. Kept free of runtime
// imports so tests can load it.
import type { StartDate } from './currencies'
import type { TransactionInput } from './types'

export type RecurringUnit = 'day' | 'week' | 'month' | 'year'

export const RECURRING_UNITS: RecurringUnit[] = ['day', 'week', 'month', 'year']

// Columns A–J of the recurring tab
export const RECURRING_HEADER = ['ID', 'What', 'Category', 'Amount', 'Currency', 'Every', 'Unit', 'Start', 'Next', 'End']

// Fields a user enters when adding or editing a recurring payment
export type RecurringPaymentInput = {
  what: string
  category: string
  amount: number
  currency: string
  // The payment repeats every `every` units, counted from start
  every: number
  unit: RecurringUnit
  start: StartDate
  // The last day a payment can fall on; null repeats forever
  end: StartDate | null
}

export type RecurringPayment = RecurringPaymentInput & {
  id: string
  // The first payment not yet approved or removed; due once it is today or earlier
  next: StartDate
}

// A payment that is due and waits to be approved (added as a transaction) or removed
export type RecurringDraft = {
  payment: RecurringPayment
  date: StartDate
  // Later payments of the same schedule that are also due already
  moreDue: number
}

const MAX_EVERY = 1000
const MAX_TEXT_LENGTH = 200
// Bounds the walk over a schedule's dates, e.g. a daily payment unattended for years
const MAX_DUE_COUNT = 1000

export function compareDates(a: StartDate, b: StartDate) {
  return a.year - b.year || a.month - b.month || a.day - b.day
}

export function dayOf(date: Date): StartDate {
  return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() }
}

// YYYY-MM-DD: written to the sheet, which reads it as a date in every locale, and used by <input type="date">
export function isoDate({ year, month, day }: StartDate) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function parseIsoDate(value: string): StartDate | null {
  const match = value.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  return match ? validDay(+match[1], +match[2], +match[3]) : null
}

function validDay(year: number, month: number, day: number): StartDate | null {
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? { year, month, day }
    : null
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function addDays({ year, month, day }: StartDate, days: number): StartDate {
  const date = new Date(Date.UTC(year, month - 1, day + days))
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() }
}

function daysBetween(from: StartDate, to: StartDate) {
  return Math.round((Date.UTC(to.year, to.month - 1, to.day) - Date.UTC(from.year, from.month - 1, from.day)) / 86_400_000)
}

type Schedule = Pick<RecurringPaymentInput, 'start' | 'every' | 'unit'>

// The nth date of the schedule, counted from start. Months are counted from start too, so a
// payment on the 31st falls on the 30th in April and on the 31st again in May.
export function occurrence({ start, every, unit }: Schedule, n: number): StartDate {
  if (unit === 'day' || unit === 'week') {
    return addDays(start, n * every * (unit === 'week' ? 7 : 1))
  }

  const months = start.month - 1 + n * every * (unit === 'year' ? 12 : 1)
  const year = start.year + Math.floor(months / 12)
  const month = (months % 12) + 1
  return { year, month, day: Math.min(start.day, daysInMonth(year, month)) }
}

// The first date of the schedule on or after the given day
export function occurrenceOnOrAfter(schedule: Schedule, from: StartDate): StartDate {
  if (compareDates(from, schedule.start) <= 0) return schedule.start

  const { start, every, unit } = schedule
  const elapsed = unit === 'day' || unit === 'week'
    ? daysBetween(start, from) / (unit === 'week' ? 7 : 1)
    : (from.year - start.year) * (unit === 'year' ? 1 : 12) + (unit === 'year' ? 0 : from.month - start.month)

  // Starts at or before the answer: a clamped month-end date is never later than its month
  let n = Math.max(0, Math.floor(elapsed / every))
  while (compareDates(occurrence(schedule, n), from) < 0) n += 1
  return occurrence(schedule, n)
}

// The payment's next date after this one
export function occurrenceAfter(schedule: Schedule, date: StartDate): StartDate {
  return occurrenceOnOrAfter(schedule, addDays(date, 1))
}

// After an edit, the payments already approved or removed stay handled: the new schedule
// continues from the old next date, or from its start when that is later
export function rescheduledNext(previousNext: StartDate, input: RecurringPaymentInput): StartDate {
  const from = compareDates(input.start, previousNext) > 0 ? input.start : previousNext
  return occurrenceOnOrAfter(input, from)
}

export function hasEnded(payment: RecurringPayment) {
  return payment.end !== null && compareDates(payment.next, payment.end) > 0
}

// One draft per payment, its earliest due date: approving or removing it moves the payment to
// the next date, which then shows if it is due too
export function dueDrafts(payments: RecurringPayment[], today: StartDate): RecurringDraft[] {
  return payments
    .filter(payment => compareDates(payment.next, today) <= 0 && !hasEnded(payment))
    .map(payment => {
      let moreDue = 0
      let date = occurrenceAfter(payment, payment.next)
      while (moreDue < MAX_DUE_COUNT && compareDates(date, today) <= 0 && (!payment.end || compareDates(date, payment.end) <= 0)) {
        moreDue += 1
        date = occurrenceAfter(payment, date)
      }
      return { payment, date: payment.next, moreDue }
    })
    .sort((a, b) => compareDates(a.date, b.date))
}

// The transaction an approved draft adds, dated on its day
export function draftTransaction(draft: Pick<RecurringDraft, 'payment' | 'date'>): TransactionInput {
  const { payment, date } = draft
  return {
    timestamp: new Date(date.year, date.month - 1, date.day),
    what: payment.what,
    category: payment.category,
    amount: payment.amount,
    currency: payment.currency,
  }
}

// The same for every attempt, so a retried approval finds the row it already added
export function draftTransactionId(draft: Pick<RecurringDraft, 'payment' | 'date'>) {
  return `${draft.payment.id}-${isoDate(draft.date)}`
}

export function describeSchedule({ every, unit }: Pick<RecurringPaymentInput, 'every' | 'unit'>) {
  return every === 1 ? `Every ${unit}` : `Every ${every} ${unit}s`
}

// Sheets serial numbers count days from 30/12/1899
function serialToDay(serial: number): StartDate {
  const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86_400_000)
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() }
}

// The tab is read with UNFORMATTED_VALUE and SERIAL_NUMBER, so dates are numbers whatever the
// locale; a date typed as text is read as YYYY-MM-DD or DD/MM/YYYY
function parseDay(value: unknown): StartDate | null {
  if (typeof value === 'number' && Number.isFinite(value)) return serialToDay(value)
  if (typeof value !== 'string') return null
  const european = value.trim().match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/)
  return european ? validDay(+european[3], +european[2], +european[1]) : parseIsoDate(value)
}

function parseNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string' || !value.trim()) return null
  const parsed = Number(value.trim().replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : null
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : ''
}

// Rows of the recurring tab, with or without the header row. Rows that can't be read are left
// out rather than guessed, so nothing is added from a half-filled row.
export function parseRecurringRows(rows: unknown[][]): RecurringPayment[] {
  return rows.flatMap((row, index) => {
    if (index === 0 && text(row[0]).toLowerCase() === 'id') return []
    const [id, what, category, amount, currency, every, unit, start, next, end] = row
    const parsed = {
      id: text(id),
      what: text(what),
      category: text(category).toLowerCase(),
      amount: parseNumber(amount),
      currency: text(currency),
      every: parseNumber(every),
      unit: text(unit).toLowerCase().replace(/s$/, '') as RecurringUnit,
      start: parseDay(start),
      next: parseDay(next),
      end: text(end) ? parseDay(end) : null,
    }
    const { amount: a, every: e, start: s, next: n } = parsed
    if (!parsed.id || !parsed.what || !parsed.category || !parsed.currency || a === null || !s || !n) return []
    if (e === null || !Number.isInteger(e) || e < 1 || !RECURRING_UNITS.includes(parsed.unit)) return []
    // An end date that can't be read would make the payment repeat forever
    if (text(end) && !parsed.end) return []
    return [{ ...parsed, amount: a, every: e, start: s, next: n }]
  })
}

// Whether the row still holds this payment, so a write never lands on a changed or moved row
export function sameRecurringPayment(a: RecurringPayment, b: RecurringPayment) {
  return a.id === b.id && a.what === b.what && a.category === b.category && a.amount === b.amount &&
    a.currency === b.currency && a.every === b.every && a.unit === b.unit &&
    compareDates(a.start, b.start) === 0 && compareDates(a.next, b.next) === 0 &&
    (a.end === null ? b.end === null : b.end !== null && compareDates(a.end, b.end) === 0)
}

export type RecurringFields = {
  what: string
  category: string
  amount: number | null
  currency: string
  every: string
  unit: RecurringUnit
  start: string
  end: string
}

// The form's values, or a message saying what to fix
export function validateRecurringInput(fields: RecurringFields): RecurringPaymentInput | string {
  const what = fields.what.trim()
  const category = fields.category.trim().toLowerCase()
  const currency = fields.currency.trim()

  if (fields.amount === null) return 'Enter a valid amount, e.g. 12.50.'
  if (!what) return 'Enter what the payment is for.'
  if (!category) return 'Pick a category.'
  if (!currency) return 'Pick a currency.'
  if ([what, category, currency].some(value => value.length > MAX_TEXT_LENGTH)) {
    return `Text fields must be at most ${MAX_TEXT_LENGTH} characters.`
  }

  const every = Number(fields.every.trim())
  if (!Number.isInteger(every) || every < 1 || every > MAX_EVERY) return `Repeat every 1 to ${MAX_EVERY} ${fields.unit}s.`
  if (!RECURRING_UNITS.includes(fields.unit)) return 'Pick how often it repeats.'

  const start = parseIsoDate(fields.start)
  if (!start) return 'Enter the date of the first payment.'
  const end = fields.end.trim() ? parseIsoDate(fields.end) : null
  if (fields.end.trim() && !end) return 'Enter a valid end date, or leave it empty.'
  if (end && compareDates(end, start) < 0) return 'The end date cannot be before the first payment.'

  return { what, category, amount: fields.amount, currency, every, unit: fields.unit, start, end }
}
