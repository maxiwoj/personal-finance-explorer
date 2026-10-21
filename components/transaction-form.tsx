'use client'

import { useMemo, useState, type FormEvent } from 'react'
import { useRecentTransactions, useSaveTransaction } from '@/hooks/use-transactions'
import { parseMoney } from '@/lib/sheets'
import { getCategoryColor } from '@/lib/colors'
import { cn } from '@/lib/utils'
import type { Transaction, TransactionInput } from '@/lib/types'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AlertCircle, Plus } from 'lucide-react'

interface TransactionFormProps {
  // Edits this transaction when set, otherwise adds a new one
  original?: Transaction
  onSaved: (input: TransactionInput) => void
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

// Most frequent first, so the usual picks are the first chips
function byFrequency(values: string[]) {
  const counts = new Map<string, number>()
  values.forEach(value => counts.set(value, (counts.get(value) ?? 0) + 1))
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([value]) => value)
}

function validate(fields: { what: string; category: string; amount: string; currency: string; timestamp: string }, isEdit: boolean): TransactionInput | string {
  const what = fields.what.trim()
  const category = fields.category.trim()
  const currency = fields.currency.trim()
  const amountText = fields.amount.trim()

  const amount = AMOUNT_PATTERN.test(amountText) ? parseMoney(amountText) : null
  if (amount === null) return 'Enter a valid amount, e.g. 12.50.'
  if (!what) return 'Enter what the transaction was for.'
  if (!category) return 'Pick a category.'
  if (!currency) return 'Pick a currency.'
  if ([what, category, currency].some(value => value.length > MAX_TEXT_LENGTH)) {
    return `Text fields must be at most ${MAX_TEXT_LENGTH} characters.`
  }

  const timestamp = isEdit ? new Date(fields.timestamp) : new Date()
  if (isNaN(timestamp.getTime())) return 'Enter a valid date and time.'

  return { timestamp, what, category, amount, currency }
}

interface ChipPickerProps {
  id: string
  label: string
  options: string[]
  value: string
  onChange: (value: string) => void
  colorFor?: (value: string) => string
}

// One tap selects an option; "New" reveals a text field for values not used before
function ChipPicker({ id, label, options, value, onChange, colorFor }: ChipPickerProps) {
  const [isCustom, setIsCustom] = useState(false)

  return (
    <div className="space-y-2">
      <Label htmlFor={isCustom ? id : undefined}>{label}</Label>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={label}>
        {options.map(option => {
          const selected = !isCustom && option === value
          const color = colorFor?.(option)
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => {
                setIsCustom(false)
                onChange(option)
              }}
              className={cn(
                'min-h-10 rounded-full border px-4 text-sm font-medium transition-colors',
                selected ? 'border-transparent text-white' : 'bg-background hover:bg-muted',
                selected && !color && 'bg-primary text-primary-foreground'
              )}
              style={selected && color ? { backgroundColor: color } : undefined}
            >
              {option}
            </button>
          )
        })}
        <button
          type="button"
          onClick={() => {
            setIsCustom(true)
            onChange('')
          }}
          className={cn(
            'min-h-10 rounded-full border border-dashed px-4 text-sm font-medium transition-colors flex items-center gap-1',
            isCustom ? 'bg-muted' : 'text-muted-foreground hover:bg-muted'
          )}
        >
          <Plus className="h-3.5 w-3.5" />
          New
        </button>
      </div>
      {isCustom && (
        <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={`New ${label.toLowerCase()}`} autoComplete="off" autoFocus className="h-11" />
      )}
    </div>
  )
}

export function TransactionForm({ original, onSaved, onCancel }: TransactionFormProps) {
  const { data: transactions } = useRecentTransactions()
  const saveTransaction = useSaveTransaction()

  const categories = useMemo(() => {
    const values = byFrequency((transactions ?? []).map(t => t.category))
    return original && !values.includes(original.category) ? [original.category, ...values] : values
  }, [original, transactions])

  const currencies = useMemo(() => {
    const values = byFrequency((transactions ?? []).map(t => t.currency))
    if (original && !values.includes(original.currency)) return [original.currency, ...values]
    return values.length > 0 ? values : ['PLN']
  }, [original, transactions])

  const [amount, setAmount] = useState(original ? String(original.amountOriginal) : '')
  const [what, setWhat] = useState(original?.what ?? '')
  const [category, setCategory] = useState(original?.category ?? '')
  // null until picked: a new transaction then uses the most common currency
  const [currency, setCurrency] = useState<string | null>(original?.currency ?? null)
  const [timestamp, setTimestamp] = useState(original ? toDateTimeLocal(original.timestamp) : '')
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const effectiveCurrency = currency ?? currencies[0]

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
      onSaved(result)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save the transaction.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="transaction-amount">Amount</Label>
        <Input
          id="transaction-amount"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          autoComplete="off"
          autoFocus={!original}
          className="h-14 text-2xl font-semibold md:text-2xl"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="transaction-what">What</Label>
        <Input id="transaction-what" value={what} onChange={(e) => setWhat(e.target.value)} placeholder="Groceries" autoComplete="off" className="h-11 text-base" />
      </div>

      <ChipPicker id="transaction-category" label="Category" options={categories} value={category} onChange={setCategory} colorFor={getCategoryColor} />

      <ChipPicker id="transaction-currency" label="Currency" options={currencies} value={effectiveCurrency} onChange={setCurrency} />

      {original && (
        <div className="space-y-2">
          <Label htmlFor="transaction-timestamp">Date and time</Label>
          <Input id="transaction-timestamp" type="datetime-local" step="1" value={timestamp} onChange={(e) => setTimestamp(e.target.value)} className="h-11" />
        </div>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex gap-2">
        {onCancel && (
          <Button type="button" variant="outline" size="lg" onClick={onCancel} disabled={isSaving} className="flex-1">
            Cancel
          </Button>
        )}
        <Button type="submit" size="lg" disabled={isSaving} className="flex-1">
          {isSaving ? 'Saving...' : original ? 'Save changes' : 'Add transaction'}
        </Button>
      </div>
    </form>
  )
}
