'use client'

import { useMemo, useState, type FormEvent } from 'react'
import { useRecentTransactions, useSaveTransaction } from '@/hooks/use-transactions'
import { parseMoney } from '@/lib/sheets'
import type { Transaction, TransactionInput } from '@/lib/types'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AlertCircle } from 'lucide-react'

interface TransactionFormProps {
  // Edits this transaction when set, otherwise adds a new one
  original?: Transaction
  onSaved: () => void
  onCancel?: () => void
}

const AMOUNT_PATTERN = /^[-−]?\d[\d\s.,]*$/
const MAX_TEXT_LENGTH = 200

function pad(value: number) {
  return String(value).padStart(2, '0')
}

// Value for <input type="datetime-local" step="1">, in local time
function toDateTimeLocal(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

function mostCommon(values: string[]) {
  const counts = new Map<string, number>()
  values.forEach(value => counts.set(value, (counts.get(value) ?? 0) + 1))
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([value]) => value)
}

function validate(fields: { what: string; category: string; amount: string; currency: string; timestamp: string }, isEdit: boolean): TransactionInput | string {
  const what = fields.what.trim()
  const category = fields.category.trim()
  const currency = fields.currency.trim()
  const amountText = fields.amount.trim()

  if (!what) return 'Enter what the transaction was for.'
  if (!category) return 'Enter a category.'
  if (!currency) return 'Enter a currency.'
  if ([what, category, currency].some(value => value.length > MAX_TEXT_LENGTH)) {
    return `Text fields must be at most ${MAX_TEXT_LENGTH} characters.`
  }

  const amount = AMOUNT_PATTERN.test(amountText) ? parseMoney(amountText) : null
  if (amount === null) return 'Enter a valid amount, e.g. 12.50.'

  const timestamp = isEdit ? new Date(fields.timestamp) : new Date()
  if (isNaN(timestamp.getTime())) return 'Enter a valid date and time.'

  return { timestamp, what, category, amount, currency }
}

export function TransactionForm({ original, onSaved, onCancel }: TransactionFormProps) {
  const { data: transactions } = useRecentTransactions()
  const saveTransaction = useSaveTransaction()

  const categories = useMemo(() => mostCommon((transactions ?? []).map(t => t.category)), [transactions])
  const currencies = useMemo(() => mostCommon((transactions ?? []).map(t => t.currency)), [transactions])

  const [what, setWhat] = useState(original?.what ?? '')
  const [category, setCategory] = useState(original?.category ?? '')
  const [amount, setAmount] = useState(original ? String(original.amountOriginal) : '')
  const [currency, setCurrency] = useState(original?.currency ?? '')
  const [timestamp, setTimestamp] = useState(original ? toDateTimeLocal(original.timestamp) : '')
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const effectiveCurrency = currency || currencies[0] || 'PLN'

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const result = validate({ what, category, amount, currency: effectiveCurrency, timestamp }, !!original)

    if (typeof result === 'string') {
      setError(result)
      return
    }

    setError(null)
    setIsSaving(true)
    try {
      await saveTransaction(result, original)
      onSaved()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save the transaction.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="transaction-what">What</Label>
        <Input id="transaction-what" value={what} onChange={(e) => setWhat(e.target.value)} placeholder="Groceries" autoFocus={!original} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="transaction-category">Category</Label>
        <Input id="transaction-category" list="transaction-categories" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="food" autoComplete="off" />
        <datalist id="transaction-categories">
          {categories.map(value => <option key={value} value={value} />)}
        </datalist>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="transaction-amount">Amount</Label>
          <Input id="transaction-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" autoComplete="off" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="transaction-currency">Currency</Label>
          <Input id="transaction-currency" list="transaction-currencies" value={currency} onChange={(e) => setCurrency(e.target.value)} placeholder={effectiveCurrency} autoComplete="off" />
          <datalist id="transaction-currencies">
            {currencies.map(value => <option key={value} value={value} />)}
          </datalist>
        </div>
      </div>

      {original && (
        <div className="space-y-2">
          <Label htmlFor="transaction-timestamp">Date and time</Label>
          <Input id="transaction-timestamp" type="datetime-local" step="1" value={timestamp} onChange={(e) => setTimestamp(e.target.value)} />
        </div>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={isSaving}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={isSaving}>
          {isSaving ? 'Saving...' : original ? 'Save changes' : 'Add transaction'}
        </Button>
      </div>
    </form>
  )
}
