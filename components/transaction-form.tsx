'use client'

import { useMemo, useState, type FormEvent } from 'react'
import { useCategories, useCategoryListActions, useRecentTransactions, useSaveTransaction } from '@/hooks/use-transactions'
import { useFinanceDataProvider } from '@/contexts/data-provider-context'
import { recordedAmount } from '@/lib/returns'
import { parseMoney } from '@/lib/sheets'
import { getCategoryColor, withAlpha } from '@/lib/colors'
import { cn } from '@/lib/utils'
import type { Transaction, TransactionInput } from '@/lib/types'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { AlertCircle, Plus } from 'lucide-react'

interface TransactionFormProps {
  // Edits this transaction when set, otherwise adds a new one
  original?: Transaction
  onSaved: (input: TransactionInput) => void
  onCancel?: () => void
}

export const AMOUNT_PATTERN = /^[-−]?\d[\d\s.,]*$/
const MAX_TEXT_LENGTH = 200
const MAX_NOTES_LENGTH = 1000
const MAX_QUICK_PICKS = 8

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

type QuickPick = { what: string; category: string }

// Frequent descriptions, each with the category it is most often filed under
function getQuickPicks(transactions: Transaction[]): (QuickPick & { count: number })[] {
  const byWhat = new Map<string, { what: string; count: number; categories: string[] }>()

  transactions.forEach(t => {
    const key = t.what.toLowerCase()
    const entry = byWhat.get(key) ?? { what: t.what, count: 0, categories: [] }
    entry.count += 1
    entry.categories.push(t.category)
    byWhat.set(key, entry)
  })

  return [...byWhat.values()]
    .map(({ what, count, categories }) => ({ what, count, category: byFrequency(categories)[0] }))
    .sort((a, b) => b.count - a.count)
}

function validate(fields: { what: string; category: string; amount: string; currency: string; timestamp: string; notes: string }, isEdit: boolean): TransactionInput | string {
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
  const notes = fields.notes.trim()
  if (notes.length > MAX_NOTES_LENGTH) return `Notes must be at most ${MAX_NOTES_LENGTH} characters.`

  const timestamp = isEdit ? new Date(fields.timestamp) : new Date()
  if (isNaN(timestamp.getTime())) return 'Enter a valid date and time.'

  // Notes are only edited, never entered when adding
  return isEdit ? { timestamp, what, category, amount, currency, notes } : { timestamp, what, category, amount, currency }
}

interface ChipPickerProps {
  id: string
  label: string
  options: string[]
  value: string
  onChange: (value: string) => void
  colorFor?: (value: string) => string
  allowCustom?: boolean
}

// One tap selects an option; "New" reveals a text field for values not used before
function ChipPicker({ id, label, options, value, onChange, colorFor, allowCustom = true }: ChipPickerProps) {
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
              // Unselected category chips are tinted with their color so each is recognisable at a glance
              style={color ? (selected ? { backgroundColor: color } : { borderColor: color, backgroundColor: withAlpha(color, 0.12) }) : undefined}
            >
              {option}
            </button>
          )
        })}
        {allowCustom && (
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
        )}
      </div>
      {isCustom && (
        <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={`New ${label.toLowerCase()}`} autoComplete="off" autoFocus className="h-11" />
      )}
    </div>
  )
}

export function TransactionForm({ original, onSaved, onCancel }: TransactionFormProps) {
  const provider = useFinanceDataProvider()
  const { data: transactions } = useRecentTransactions()
  const { data: categoryList } = useCategories()
  const { createCategoryList, addCategory, renameCategory } = useCategoryListActions()
  const saveTransaction = useSaveTransaction()
  // The edited transaction as the sheet now holds it: renaming its category rewrites its row
  const [baseline, setBaseline] = useState(original)

  // The categories tab fixes the order; without it, alphabetical keeps chips in place between visits
  const categories = useMemo(() => {
    const values = categoryList?.length
      ? categoryList.map(c => c.name)
      : [...new Set((transactions ?? []).map(t => t.category))].sort()
    return baseline && !values.includes(baseline.category) ? [...values, baseline.category] : values
  }, [categoryList, baseline, transactions])

  // Only currencies already in the sheet: its formulas may not convert an unknown one to PLN
  const currencies = useMemo(() => {
    const values = byFrequency((transactions ?? []).map(t => t.currency))
    if (original && !values.includes(original.currency)) return [original.currency, ...values]
    return values.length > 0 ? values : ['PLN']
  }, [original, transactions])

  const quickPicks = useMemo(() => getQuickPicks(transactions ?? []), [transactions])

  const [amount, setAmount] = useState(original ? String(recordedAmount(original).amountOriginal) : '')
  const [what, setWhat] = useState(original?.what ?? '')
  const [category, setCategory] = useState(original?.category ?? '')
  // null until picked: a new transaction then uses the most common currency
  const [currency, setCurrency] = useState<string | null>(original?.currency ?? null)
  const [timestamp, setTimestamp] = useState(original ? toDateTimeLocal(original.timestamp) : '')
  const [notes, setNotes] = useState(original?.notes ?? '')
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isCreatingList, setIsCreatingList] = useState(false)
  // null while not renaming; otherwise the new name typed for the selected category
  const [renameTo, setRenameTo] = useState<string | null>(null)
  const [isRenaming, setIsRenaming] = useState(false)

  const effectiveCurrency = currency ?? currencies[0]
  const normalizedCategory = category.trim().toLowerCase()
  const typed = what.trim().toLowerCase()
  const visibleQuickPicks = quickPicks
    .filter(pick => !normalizedCategory || pick.category === normalizedCategory)
    .filter(pick => !typed || (pick.what.toLowerCase().includes(typed) && pick.what.toLowerCase() !== typed))
    .slice(0, MAX_QUICK_PICKS)

  const handleCreateCategoryList = async () => {
    setIsCreatingList(true)
    setError(null)
    try {
      const ordered = byFrequency((transactions ?? []).map(t => t.category))
      await createCategoryList(ordered.map(name => ({ name, color: getCategoryColor(name) })))
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Failed to create the category list.')
    } finally {
      setIsCreatingList(false)
    }
  }

  // Only categories already in use can be renamed, not one typed with "New"
  const canRename = categories.includes(normalizedCategory)
  const renameTarget = renameTo?.trim().toLowerCase() ?? ''

  const handleRenameCategory = async () => {
    if (!renameTarget || renameTarget === normalizedCategory) {
      setError('Enter a new name for the category.')
      return
    }
    if (renameTarget.length > MAX_TEXT_LENGTH) {
      setError(`Text fields must be at most ${MAX_TEXT_LENGTH} characters.`)
      return
    }

    setIsRenaming(true)
    setError(null)
    try {
      await renameCategory(normalizedCategory, renameTarget)
      if (baseline?.category === normalizedCategory) setBaseline({ ...baseline, category: renameTarget })
      setCategory(renameTarget)
      setRenameTo(null)
    } catch (renameError) {
      setError(renameError instanceof Error ? renameError.message : 'Failed to rename the category.')
    } finally {
      setIsRenaming(false)
    }
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const result = validate({ what, category, amount, currency: effectiveCurrency, timestamp, notes }, !!original)

    if (typeof result === 'string') {
      setError(result)
      return
    }

    // The purchase must still cover its returns, which are recorded in its currency
    if (original?.returns) {
      const returned = Math.round((recordedAmount(original).amountOriginal - original.amountOriginal) * 100) / 100
      if (result.currency !== original.currency) {
        setError('The currency cannot change once a return is recorded.')
        return
      }
      if (result.amount < returned) {
        setError(`The amount cannot be less than what was returned (${returned} ${original.currency}).`)
        return
      }
    }

    setError(null)
    setIsSaving(true)
    try {
      await saveTransaction(result, baseline)
      // Keep the categories tab complete; the transaction is already saved, so a failure here is not fatal
      if (categoryList && !categoryList.some(c => c.name === result.category.toLowerCase())) {
        await addCategory(result.category.toLowerCase()).catch(() => undefined)
      }
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
          enterKeyHint="next"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          autoComplete="off"
          autoFocus={!original}
          className="h-14 text-2xl font-semibold md:text-2xl"
        />
      </div>

      <div className="space-y-2">
        <ChipPicker id="transaction-category" label="Category" options={categories} value={category} onChange={setCategory} colorFor={getCategoryColor} />
        {!original && categoryList === null && provider.mode === 'google' && (
          <p className="text-xs text-muted-foreground">
            Categories are sorted alphabetically.{' '}
            <button type="button" className="underline underline-offset-2" onClick={() => void handleCreateCategoryList()} disabled={isCreatingList}>
              {isCreatingList ? 'Creating...' : 'Create a category list'}
            </button>{' '}
            in your spreadsheet to set their order and colors.
          </p>
        )}
        {renameTo !== null && canRename ? (
          <div className="space-y-2">
            <div className="flex gap-2">
              <Input
                value={renameTo}
                onChange={(e) => setRenameTo(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return
                  e.preventDefault()
                  void handleRenameCategory()
                }}
                aria-label={`New name for ${normalizedCategory}`}
                autoComplete="off"
                autoFocus
                className="h-11"
              />
              <Button type="button" variant="outline" size="lg" onClick={() => void handleRenameCategory()} disabled={isRenaming}>
                {isRenaming ? 'Renaming...' : 'Rename'}
              </Button>
              <Button type="button" variant="ghost" size="lg" onClick={() => setRenameTo(null)} disabled={isRenaming}>
                Cancel
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {categories.includes(renameTarget) && renameTarget !== normalizedCategory
                ? `"${renameTarget}" already exists: every "${normalizedCategory}" transaction moves into it.`
                : `Renames "${normalizedCategory}" in every transaction${categoryList ? ' and in the category list' : ''}.`}
            </p>
          </div>
        ) : canRename && (
          <p className="text-xs text-muted-foreground">
            <button type="button" className="underline underline-offset-2" onClick={() => setRenameTo(normalizedCategory)}>
              Rename &quot;{normalizedCategory}&quot;
            </button>
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="transaction-what">What</Label>
        <Input id="transaction-what" value={what} onChange={(e) => setWhat(e.target.value)} placeholder="Groceries" autoComplete="off" enterKeyHint="done" className="h-11 text-base" />
        {visibleQuickPicks.length > 0 && (
          <div className="flex flex-wrap gap-2" aria-label="Frequent descriptions">
            {visibleQuickPicks.map(pick => (
              <button
                key={pick.what}
                type="button"
                onClick={() => {
                  setWhat(pick.what)
                  if (!normalizedCategory) setCategory(pick.category)
                }}
                className="min-h-9 rounded-full border bg-muted/50 px-3 text-sm transition-colors hover:bg-muted"
              >
                {pick.what}
              </button>
            ))}
          </div>
        )}
      </div>

      <ChipPicker id="transaction-currency" label="Currency" options={currencies} value={effectiveCurrency} onChange={setCurrency} allowCustom={false} />

      {original && (
        <div className="space-y-2">
          <Label htmlFor="transaction-timestamp">Date and time</Label>
          <Input id="transaction-timestamp" type="datetime-local" step="1" value={timestamp} onChange={(e) => setTimestamp(e.target.value)} className="h-11" />
        </div>
      )}

      {original && (
        <div className="space-y-2">
          <Label htmlFor="transaction-notes">Notes</Label>
          <Textarea id="transaction-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" className="text-base" />
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
