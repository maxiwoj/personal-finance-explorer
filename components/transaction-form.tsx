'use client'

import { useMemo, useState, type FormEvent } from 'react'
import { useCategories, useCategoryListActions, useCurrencies, useFetchRatesStart, useRecentTransactions, useSaveTransaction } from '@/hooks/use-transactions'
import { useFinanceDataProvider } from '@/contexts/data-provider-context'
import { canExtendRates, compareDates, formatDate, type RatesStart, type StartDate } from '@/lib/currencies'
import { recordedAmount } from '@/lib/returns'
import { parseMoney } from '@/lib/sheets'
import { getCategoryColor, withAlpha } from '@/lib/colors'
import { cn } from '@/lib/utils'
import { useUnsavedInput } from '@/lib/unsaved-input'
import type { CategoryDefinition, Transaction, TransactionInput } from '@/lib/types'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ExtendRatesDialog } from '@/components/extend-rates-dialog'
import { AlertCircle, ChevronDown, ChevronUp, Plus } from 'lucide-react'

interface TransactionFormProps {
  // Edits this transaction when set, otherwise adds a new one
  original?: Transaction
  // outboxId: set when a new transaction was queued to sync in the background
  onSaved: (input: TransactionInput, outboxId?: string) => void
  onCancel?: () => void
}

export const AMOUNT_PATTERN = /^[-−]?\d[\d\s.,]*$/
const MAX_TEXT_LENGTH = 200
const MAX_NOTES_LENGTH = 1000
const MAX_QUICK_PICKS = 8
const MAX_CATEGORY_CHIPS = 8

function pad(value: number) {
  return String(value).padStart(2, '0')
}

// The local day, as the sheet stores timestamps in local time
function dayOf(date: Date): StartDate {
  return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() }
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
  // Caps the chips shown; "More" reveals the rest
  maxVisible?: number
  // Options most likely to be picked first, deciding which chips are shown when capped
  rank?: string[]
}

// One tap selects an option; "New" reveals a text field for values not used before
function ChipPicker({ id, label, options, value, onChange, colorFor, allowCustom = true, maxVisible, rank = [] }: ChipPickerProps) {
  const [isCustom, setIsCustom] = useState(false)
  const [showAll, setShowAll] = useState(false)

  // The top-ranked options plus the selected one, kept in the options' order so chips do not jump around
  const visibleOptions = useMemo(() => {
    if (showAll || maxVisible === undefined || options.length <= maxVisible) return options
    const top = new Set([...rank.filter(option => options.includes(option)), ...options].slice(0, maxVisible))
    if (value) top.add(value)
    return options.filter(option => top.has(option))
  }, [showAll, maxVisible, options, rank, value])
  const hiddenCount = options.length - visibleOptions.length
  const canCollapse = showAll && maxVisible !== undefined && options.length > maxVisible

  const select = (option: string) => {
    setIsCustom(false)
    onChange(option)
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={isCustom ? id : undefined}>{label}</Label>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={label}>
        {visibleOptions.map(option => {
          const selected = !isCustom && option === value
          const color = colorFor?.(option)
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => select(option)}
              className={cn(
                'min-h-9 rounded-full border px-3 text-sm sm:min-h-10 sm:px-4 font-medium transition-colors',
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
        {(hiddenCount > 0 || canCollapse) && (
          <button
            type="button"
            aria-expanded={showAll}
            onClick={() => setShowAll(!showAll)}
            className="min-h-9 rounded-full border border-dashed px-3 text-sm sm:min-h-10 sm:px-4 font-medium transition-colors flex items-center gap-1 text-muted-foreground hover:bg-muted"
          >
            {showAll ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {showAll ? 'Less' : `More (${hiddenCount})`}
          </button>
        )}
        {allowCustom && (
        <button
          type="button"
          onClick={() => {
            setIsCustom(true)
            onChange('')
          }}
          className={cn(
            'min-h-9 rounded-full border border-dashed px-3 text-sm sm:min-h-10 sm:px-4 font-medium transition-colors flex items-center gap-1',
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

interface CategoryManagerProps {
  categories: CategoryDefinition[]
  newCategory: string
  onNewCategoryChange: (value: string) => void
  onAdd: () => void
  onToggle: (category: CategoryDefinition) => void
  onDone: () => void
  disabled: boolean
}

// Chooses which categories the Add page offers; hiding never changes existing transactions
function CategoryManager({ categories, newCategory, onNewCategoryChange, onAdd, onToggle, onDone, disabled }: CategoryManagerProps) {
  return (
    <div className="space-y-2 rounded-md border p-3">
      <ul className="space-y-1">
        {categories.map(c => (
          <li key={c.name} className="flex items-center justify-between gap-2 text-sm">
            <span className={cn(c.hidden && 'text-muted-foreground')}>
              {c.name}{c.hidden && ' (hidden)'}
            </span>
            <Button type="button" variant="ghost" size="sm" onClick={() => onToggle(c)} disabled={disabled}>
              {c.hidden ? 'Show' : 'Hide'}
            </Button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Input
          value={newCategory}
          onChange={(e) => onNewCategoryChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return
            e.preventDefault()
            onAdd()
          }}
          placeholder="New category"
          aria-label="New category"
          autoComplete="off"
        />
        <Button type="button" variant="outline" onClick={onAdd} disabled={disabled}>
          Add
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Hidden categories are only left out when adding; their transactions do not change.
      </p>
      <Button type="button" variant="ghost" size="sm" onClick={onDone}>
        Done
      </Button>
    </div>
  )
}

export function TransactionForm({ original, onSaved, onCancel }: TransactionFormProps) {
  const provider = useFinanceDataProvider()
  const { data: transactions } = useRecentTransactions()
  const { data: categoryList } = useCategories()
  const { data: currencyList } = useCurrencies()
  const { createCategoryList, addCategory, setCategoryHidden } = useCategoryListActions()
  const saveTransaction = useSaveTransaction()
  const fetchRatesStart = useFetchRatesStart()

  // Hidden categories are only left out when adding; editing offers the whole list
  const hiddenCategories = useMemo(
    () => new Set(original ? [] : (categoryList ?? []).filter(c => c.hidden).map(c => c.name)),
    [categoryList, original]
  )

  // The categories tab fixes the order; without it, alphabetical keeps chips in place between visits
  const categories = useMemo(() => {
    const values = categoryList?.length
      ? categoryList.filter(c => !hiddenCategories.has(c.name)).map(c => c.name)
      : [...new Set((transactions ?? []).map(t => t.category))].sort()
    return original && !values.includes(original.category) ? [...values, original.category] : values
  }, [categoryList, hiddenCategories, original, transactions])

  // Only currencies the sheet converts: those in the currencyDates tab, most used first; without
  // that tab, the ones already in transactions, since its formulas may not convert an unknown one
  const currencies = useMemo(() => {
    const used = byFrequency((transactions ?? []).map(t => t.currency))
    const values = currencyList
      ? [...used.filter(code => currencyList.currencies.some(c => c.code === code)), ...currencyList.currencies.map(c => c.code).filter(code => !used.includes(code))]
      : used
    if (original && !values.includes(original.currency)) return [original.currency, ...values]
    return values.length > 0 ? values : [currencyList?.defaultCurrency ?? 'PLN']
  }, [currencyList, original, transactions])

  const quickPicks = useMemo(
    () => getQuickPicks(transactions ?? []).filter(pick => !hiddenCategories.has(pick.category)),
    [hiddenCategories, transactions]
  )
  const categoryRank = useMemo(() => byFrequency((transactions ?? []).map(t => t.category)), [transactions])

  const [initial] = useState(() => ({
    amount: original ? String(recordedAmount(original).amountOriginal) : '',
    what: original?.what ?? '',
    category: original?.category ?? '',
    // null until picked: a new transaction then uses the most common currency
    currency: original?.currency ?? null,
    timestamp: original ? toDateTimeLocal(original.timestamp) : '',
    notes: original?.notes ?? '',
  }))
  const [amount, setAmount] = useState(initial.amount)
  const [what, setWhat] = useState(initial.what)
  const [category, setCategory] = useState(initial.category)
  const [currency, setCurrency] = useState<string | null>(initial.currency)
  const [timestamp, setTimestamp] = useState(initial.timestamp)
  const [notes, setNotes] = useState(initial.notes)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isCreatingList, setIsCreatingList] = useState(false)
  const [isManaging, setIsManaging] = useState(false)
  const [newCategory, setNewCategory] = useState('')
  const [isUpdatingList, setIsUpdatingList] = useState(false)
  // A saved transaction dated before the currency rates start, which cannot be converted yet
  const [beforeStart, setBeforeStart] = useState<{ result: TransactionInput; ratesStart: RatesStart & { start: StartDate } } | null>(null)
  const [confirmExtend, setConfirmExtend] = useState(false)

  // Holds back an app update's reload (lib/app-update.ts) while there's something to lose
  useUnsavedInput(
    isSaving || beforeStart !== null || newCategory.trim() !== '' || amount !== initial.amount || what !== initial.what ||
    category !== initial.category || currency !== initial.currency || timestamp !== initial.timestamp || notes !== initial.notes
  )

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
      return true
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Failed to create the category list.')
      return false
    } finally {
      setIsCreatingList(false)
    }
  }

  // Managing needs the categories tab, so it is created first when missing
  const handleOpenManager = async () => {
    if (categoryList === null && !await handleCreateCategoryList()) return
    setIsManaging(true)
  }

  // Only the categories tab changes: transactions keep their category whether it is hidden or not
  const updateCategoryList = async (name: string, hidden: boolean) => {
    setIsUpdatingList(true)
    setError(null)
    try {
      await setCategoryHidden(name, hidden)
      if (hidden && normalizedCategory === name) setCategory('')
      return true
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Failed to update the category list.')
      return false
    } finally {
      setIsUpdatingList(false)
    }
  }

  const handleAddCategory = async () => {
    const name = newCategory.trim().toLowerCase()
    if (!name) {
      setError('Enter a category name.')
      return
    }
    if (name.length > MAX_TEXT_LENGTH) {
      setError(`Text fields must be at most ${MAX_TEXT_LENGTH} characters.`)
      return
    }
    if (await updateCategoryList(name, false)) setNewCategory('')
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
      const { outboxId } = await saveTransaction(result, original)
      // Keep the categories tab complete; the transaction is already saved, so a failure here is not
      // fatal. A new transaction doesn't wait for it, so the saved screen shows at once, also offline.
      const listed = categoryList?.find(c => c.name === result.category.toLowerCase())
      let updateList: Promise<void> | undefined
      if (categoryList && !listed) {
        updateList = addCategory(result.category.toLowerCase()).catch(() => undefined)
      } else if (listed?.hidden && !original) {
        // Typed in with "New", so it is wanted on the Add page again
        updateList = setCategoryHidden(listed.name, false).catch(() => undefined)
      }
      if (original) await updateList
      // Only an edit can move a date back: adding uses the current time. The save stands either
      // way, and the rates are never extended without asking.
      if (original && provider.mode === 'google') {
        const ratesStart = await fetchRatesStart().catch(() => null)
        if (ratesStart && typeof ratesStart.start !== 'string' && compareDates(dayOf(result.timestamp), ratesStart.start) < 0) {
          setBeforeStart({ result, ratesStart: { ...ratesStart, start: ratesStart.start } })
          return
        }
      }
      onSaved(result, outboxId)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save the transaction.')
    } finally {
      setIsSaving(false)
    }
  }

  if (beforeStart) {
    const { result, ratesStart } = beforeStart
    return (
      <div className="space-y-5">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Saved. This transaction is dated {formatDate(dayOf(result.timestamp))}, before the currency rates start on {formatDate(ratesStart.start)}, so it cannot be converted until the rates are extended.
          </AlertDescription>
        </Alert>
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="lg" onClick={() => onSaved(result)} className="flex-1">
            Done
          </Button>
          {canExtendRates(ratesStart) && (
            <Button type="button" size="lg" onClick={() => setConfirmExtend(true)} className="flex-1">
              Extend rates to {formatDate(ratesStart.earliest)}
            </Button>
          )}
        </div>
        {canExtendRates(ratesStart) && (
          <ExtendRatesDialog ratesStart={ratesStart} open={confirmExtend} onOpenChange={setConfirmExtend} onExtended={() => onSaved(result)} onError={setError} />
        )}
      </div>
    )
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
        <ChipPicker id="transaction-category" label="Category" options={categories} value={category} onChange={setCategory} colorFor={getCategoryColor} maxVisible={MAX_CATEGORY_CHIPS} rank={categoryRank} />
        {!original && categoryList === null && (
          <p className="text-xs text-muted-foreground">
            Categories are sorted alphabetically.{' '}
            <button type="button" className="underline underline-offset-2" onClick={() => void handleCreateCategoryList()} disabled={isCreatingList}>
              {isCreatingList ? 'Creating...' : 'Create a category list'}
            </button>{' '}
            in your spreadsheet to set their order and colors.
          </p>
        )}
        {!original && (isManaging && categoryList ? (
          <CategoryManager
            categories={categoryList}
            newCategory={newCategory}
            onNewCategoryChange={setNewCategory}
            onAdd={() => void handleAddCategory()}
            onToggle={(c) => void updateCategoryList(c.name, !c.hidden)}
            onDone={() => setIsManaging(false)}
            disabled={isUpdatingList}
          />
        ) : (
          <p className="text-xs text-muted-foreground">
            <button type="button" className="underline underline-offset-2" onClick={() => void handleOpenManager()} disabled={categoryList === undefined || isCreatingList}>
              Manage categories
            </button>
          </p>
        ))}
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
