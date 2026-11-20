'use client'

import { useMemo, useState, type FormEvent } from 'react'
import { useCategories, useCurrencies, useRecentTransactions, useRecurringActions } from '@/hooks/use-transactions'
import { AMOUNT_PATTERN, byFrequency, ChipPicker } from '@/components/transaction-form'
import { getCategoryColor } from '@/lib/colors'
import { formatDate } from '@/lib/currencies'
import { dayOf, isoDate, nextAfterToday, occurrenceLink, parseIsoDate, RECURRING_UNITS, validateRecurringInput, type RecurringPayment, type RecurringUnit } from '@/lib/recurring'
import { recordedAmount } from '@/lib/returns'
import type { Transaction } from '@/lib/types'
import { parseMoney } from '@/lib/sheets'
import { useUnsavedInput } from '@/lib/unsaved-input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AlertCircle } from 'lucide-react'

interface RecurringPaymentFormProps {
  // Edits this payment when set, otherwise adds a new one
  original?: RecurringPayment
  // Sets up a new payment from this transaction, which counts as paid: drafts start after today
  from?: Transaction
  onSaved: () => void
  onCancel: () => void
}

// The same fields as a transaction, plus how often it repeats and from when
export function RecurringPaymentForm({ original, from, onSaved, onCancel }: RecurringPaymentFormProps) {
  const { data: transactions } = useRecentTransactions()
  const { data: categoryList } = useCategories()
  const { data: currencyList } = useCurrencies()
  const { addRecurringPayment, linkTransactionToRecurring, updateRecurringPayment } = useRecurringActions()

  // As on the Add page: the categories tab's order without hidden ones, else alphabetical
  const categories = useMemo(() => {
    const values = categoryList?.length
      ? categoryList.filter(c => !c.hidden).map(c => c.name)
      : [...new Set((transactions ?? []).map(t => t.category))].sort()
    const own = original?.category ?? from?.category
    return own && !values.includes(own) ? [...values, own] : values
  }, [categoryList, from, original, transactions])

  // Only currencies the sheet converts, most used first
  const currencies = useMemo(() => {
    const used = byFrequency((transactions ?? []).map(t => t.currency))
    const values = currencyList
      ? [...used.filter(code => currencyList.currencies.some(c => c.code === code)), ...currencyList.currencies.map(c => c.code).filter(code => !used.includes(code))]
      : used
    const own = original?.currency ?? from?.currency
    if (own && !values.includes(own)) return [own, ...values]
    return values.length > 0 ? values : [currencyList?.defaultCurrency ?? 'PLN']
  }, [currencyList, from, original, transactions])

  const [initial] = useState(() => ({
    // A purchase's own amount, before any returns
    amount: original ? String(original.amount) : from ? String(recordedAmount(from).amountOriginal) : '',
    what: original?.what ?? from?.what ?? '',
    category: original?.category ?? from?.category ?? '',
    currency: original?.currency ?? from?.currency ?? null,
    every: original ? String(original.every) : '1',
    unit: original?.unit ?? 'month' as RecurringUnit,
    start: isoDate(original?.start ?? (from ? dayOf(from.timestamp) : dayOf(new Date()))),
    end: original?.end ? isoDate(original.end) : '',
  }))
  const [amount, setAmount] = useState(initial.amount)
  const [what, setWhat] = useState(initial.what)
  const [category, setCategory] = useState(initial.category)
  const [currency, setCurrency] = useState<string | null>(initial.currency)
  const [every, setEvery] = useState(initial.every)
  const [unit, setUnit] = useState<RecurringUnit>(initial.unit)
  const [start, setStart] = useState(initial.start)
  const [end, setEnd] = useState(initial.end)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  // Set up from a transaction whose link failed: a retry only links it
  const [createdId, setCreatedId] = useState<string | null>(null)

  useUnsavedInput(
    isSaving || amount !== initial.amount || what !== initial.what || category !== initial.category || currency !== initial.currency ||
    every !== initial.every || unit !== initial.unit || start !== initial.start || end !== initial.end
  )

  const effectiveCurrency = currency ?? currencies[0]
  // Shown when setting up from a transaction, so it is clear no drafts come for past dates
  const parsedStart = parseIsoDate(start)
  const everyNumber = Number(every)
  const firstDraft = from && parsedStart && Number.isInteger(everyNumber) && everyNumber >= 1
    ? nextAfterToday({ start: parsedStart, every: everyNumber, unit }, dayOf(new Date()))
    : null

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const amountText = amount.trim()
    const result = validateRecurringInput({
      what,
      category,
      amount: AMOUNT_PATTERN.test(amountText) ? parseMoney(amountText) : null,
      currency: effectiveCurrency,
      every,
      unit,
      start,
      end,
    })

    if (typeof result === 'string') {
      setError(result)
      return
    }

    setError(null)
    setIsSaving(true)
    let saved = createdId !== null
    try {
      if (original) {
        await updateRecurringPayment(original, result)
      } else if (from) {
        // The transaction is linked (column K) as the payment's date it fell on
        const paymentId = createdId ?? await addRecurringPayment(result, nextAfterToday(result, dayOf(new Date())))
        setCreatedId(paymentId)
        saved = true
        await linkTransactionToRecurring(from, occurrenceLink(paymentId, dayOf(from.timestamp)))
      } else {
        await addRecurringPayment(result)
      }
      onSaved()
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : 'Failed to save the recurring payment.'
      setError(saved && from ? `The recurring payment is saved, but marking this transaction as part of it failed: ${message} Try again to retry only that.` : message)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="recurring-amount">Amount</Label>
        <Input id="recurring-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" autoComplete="off" autoFocus={!original} className="h-11 text-base" />
      </div>

      <ChipPicker id="recurring-category" label="Category" options={categories} value={category} onChange={setCategory} colorFor={getCategoryColor} />

      <div className="space-y-2">
        <Label htmlFor="recurring-what">What</Label>
        <Input id="recurring-what" value={what} onChange={(e) => setWhat(e.target.value)} placeholder="Rent" autoComplete="off" className="h-11 text-base" />
      </div>

      <ChipPicker id="recurring-currency" label="Currency" options={currencies} value={effectiveCurrency} onChange={setCurrency} allowCustom={false} />

      <div className="space-y-2">
        <Label htmlFor="recurring-every">Repeats every</Label>
        <div className="flex gap-2">
          <Input id="recurring-every" type="number" min={1} step={1} inputMode="numeric" value={every} onChange={(e) => setEvery(e.target.value)} className="h-11 w-24 text-base" />
          <Select value={unit} onValueChange={(value) => setUnit(value as RecurringUnit)}>
            <SelectTrigger className="h-11 w-[140px]" aria-label="Unit">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RECURRING_UNITS.map(value => (
                <SelectItem key={value} value={value}>{every.trim() === '1' ? value : `${value}s`}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="recurring-start">First payment</Label>
          <Input id="recurring-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} className="h-11" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="recurring-end">Ends (optional)</Label>
          <Input id="recurring-end" type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="h-11" />
        </div>
      </div>

      {from && (
        <p className="text-xs text-muted-foreground">
          This transaction and any dates up to today count as paid{firstDraft && `; the first draft is on ${formatDate(firstDraft)}`}.
        </p>
      )}

      {original && (
        <p className="text-xs text-muted-foreground">
          Payments already approved or removed stay as they are; the new schedule applies from the next one.
        </p>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex gap-2">
        <Button type="button" variant="outline" size="lg" onClick={onCancel} disabled={isSaving} className="flex-1">
          Cancel
        </Button>
        <Button type="submit" size="lg" disabled={isSaving} className="flex-1">
          {isSaving ? 'Saving...' : original ? 'Save changes' : 'Add recurring payment'}
        </Button>
      </div>
    </form>
  )
}
