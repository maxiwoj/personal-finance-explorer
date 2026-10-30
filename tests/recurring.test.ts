import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { draftTransaction, draftTransactionId, dueDrafts, occurrence, occurrenceAfter, occurrenceOnOrAfter, parseRecurringRows, RECURRING_HEADER, rescheduledNext, validateRecurringInput, type RecurringFields, type RecurringPayment } from '../lib/recurring.ts'

const d = (year: number, month: number, day: number) => ({ year, month, day })

const PAYMENT: RecurringPayment = {
  id: 'rent',
  what: 'Rent',
  category: 'home',
  amount: 2500,
  currency: 'PLN',
  every: 1,
  unit: 'month',
  start: d(2026, 1, 31),
  next: d(2026, 1, 31),
  end: null,
}

describe('occurrence', () => {
  it('keeps the day of the month from the start, clamped to short months', () => {
    assert.deepEqual([0, 1, 2, 3].map(n => occurrence(PAYMENT, n)), [d(2026, 1, 31), d(2026, 2, 28), d(2026, 3, 31), d(2026, 4, 30)])
  })

  it('counts weeks, days and years', () => {
    assert.deepEqual(occurrence({ start: d(2026, 12, 28), every: 2, unit: 'week' }, 1), d(2027, 1, 11))
    assert.deepEqual(occurrence({ start: d(2026, 2, 27), every: 3, unit: 'day' }, 1), d(2026, 3, 2))
    assert.deepEqual(occurrence({ start: d(2024, 2, 29), every: 1, unit: 'year' }, 1), d(2025, 2, 28))
  })
})

describe('occurrenceOnOrAfter', () => {
  it('returns the start for earlier days', () => {
    assert.deepEqual(occurrenceOnOrAfter(PAYMENT, d(2025, 6, 1)), d(2026, 1, 31))
  })

  it('finds the first date on or after the day', () => {
    assert.deepEqual(occurrenceOnOrAfter(PAYMENT, d(2026, 3, 1)), d(2026, 3, 31))
    assert.deepEqual(occurrenceOnOrAfter(PAYMENT, d(2026, 3, 31)), d(2026, 3, 31))
    assert.deepEqual(occurrenceOnOrAfter({ start: d(2026, 1, 5), every: 2, unit: 'month' }, d(2026, 2, 1)), d(2026, 3, 5))
    assert.deepEqual(occurrenceOnOrAfter({ start: d(2026, 1, 1), every: 2, unit: 'week' }, d(2026, 1, 16)), d(2026, 1, 29))
  })

  it('moves past the given date', () => {
    assert.deepEqual(occurrenceAfter(PAYMENT, d(2026, 2, 28)), d(2026, 3, 31))
  })
})

describe('rescheduledNext', () => {
  it('keeps already handled dates handled', () => {
    assert.deepEqual(rescheduledNext(d(2026, 3, 31), { ...PAYMENT, start: d(2026, 1, 10) }), d(2026, 4, 10))
  })

  it('starts at a later start', () => {
    assert.deepEqual(rescheduledNext(d(2026, 3, 31), { ...PAYMENT, start: d(2026, 6, 1) }), d(2026, 6, 1))
  })
})

describe('dueDrafts', () => {
  it('shows the earliest due date of each payment and counts the rest', () => {
    const [draft, ...rest] = dueDrafts([PAYMENT, { ...PAYMENT, id: 'later', next: d(2026, 5, 1) }], d(2026, 4, 30))

    assert.equal(rest.length, 0)
    assert.deepEqual(draft.date, d(2026, 1, 31))
    assert.equal(draft.moreDue, 3)
  })

  it('stops at the end date', () => {
    const drafts = dueDrafts([{ ...PAYMENT, end: d(2026, 3, 1) }], d(2026, 4, 30))
    assert.equal(drafts[0].moreDue, 1)
    assert.deepEqual(dueDrafts([{ ...PAYMENT, next: d(2026, 3, 31), end: d(2026, 3, 1) }], d(2026, 4, 30)), [])
  })

  it('orders drafts by date', () => {
    const drafts = dueDrafts([{ ...PAYMENT, id: 'b', next: d(2026, 2, 1) }, { ...PAYMENT, id: 'a', next: d(2026, 1, 1) }], d(2026, 2, 1))
    assert.deepEqual(drafts.map(draft => draft.payment.id), ['a', 'b'])
  })
})

describe('draftTransaction', () => {
  it('is dated on the draft day with a stable ID', () => {
    const draft = { payment: PAYMENT, date: d(2026, 2, 28) }
    assert.deepEqual(draftTransaction(draft), { timestamp: new Date(2026, 1, 28), what: 'Rent', category: 'home', amount: 2500, currency: 'PLN' })
    assert.equal(draftTransactionId(draft), 'rent-2026-02-28')
  })
})

describe('parseRecurringRows', () => {
  it('reads serial dates and text dates, skipping the header', () => {
    // 46053 is 31/01/2026
    const [payment] = parseRecurringRows([RECURRING_HEADER, ['rent', 'Rent', 'Home', 2500, 'PLN', 1, 'Months', 46053, '2026-02-28', '']])

    assert.deepEqual(payment, { ...PAYMENT, next: d(2026, 2, 28) })
    assert.deepEqual(parseRecurringRows([['x', 'Gym', 'sport', '99,5', 'EUR', '2', 'week', '01/03/2026', '01/03/2026', '31/12/2026']])[0].end, d(2026, 12, 31))
  })

  it('drops rows it cannot read', () => {
    assert.deepEqual(parseRecurringRows([
      ['a', 'Rent', 'home', 1, 'PLN', 1, 'fortnight', 46053, 46053],
      ['b', 'Rent', 'home', 1, 'PLN', 0, 'month', 46053, 46053],
      ['c', 'Rent', 'home', '', 'PLN', 1, 'month', 46053, 46053],
      ['d', 'Rent', 'home', 1, 'PLN', 1, 'month', 46053, 46053, 'someday'],
    ]), [])
  })
})

describe('validateRecurringInput', () => {
  const fields: RecurringFields = { what: ' Rent ', category: 'Home', amount: 2500, currency: 'PLN', every: '1', unit: 'month', start: '2026-01-31', end: '' }

  it('returns the payment', () => {
    assert.deepEqual(validateRecurringInput(fields), { what: 'Rent', category: 'home', amount: 2500, currency: 'PLN', every: 1, unit: 'month', start: d(2026, 1, 31), end: null })
  })

  it('rejects bad input', () => {
    assert.equal(typeof validateRecurringInput({ ...fields, amount: null }), 'string')
    assert.equal(typeof validateRecurringInput({ ...fields, every: '1.5' }), 'string')
    assert.equal(typeof validateRecurringInput({ ...fields, start: '2026-02-30' }), 'string')
    assert.equal(typeof validateRecurringInput({ ...fields, end: '2025-12-31' }), 'string')
  })
})
