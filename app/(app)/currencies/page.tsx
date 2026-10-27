'use client'

import { useMemo, useState, type FormEvent } from 'react'
import { useFinanceDataProvider } from '@/contexts/data-provider-context'
import { useCurrencies, useCurrencyActions, useFullTransactions, useRatesStart } from '@/hooks/use-transactions'
import { ExtendRatesDialog } from '@/components/extend-rates-dialog'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { SHEETS } from '@/lib/config'
import { canExtendRates, formatDate, type ExtendableRatesStart } from '@/lib/currencies'
import type { CurrencyDefinition } from '@/lib/types'
import { AlertCircle } from 'lucide-react'

type Kind = CurrencyDefinition['kind']

function parseMultiplier(value: string) {
  const parsed = Number(value.trim().replace(',', '.'))
  return value.trim() && Number.isFinite(parsed) ? parsed : NaN
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

function MultiplierEditor({ currency, onError }: { currency: CurrencyDefinition; onError: (message: string | null) => void }) {
  const { updateCurrencyMultiplier } = useCurrencyActions()
  const [value, setValue] = useState(currency.multiplier === null ? '' : String(currency.multiplier))
  const [isSaving, setIsSaving] = useState(false)
  const multiplier = parseMultiplier(value)
  const unchanged = multiplier === currency.multiplier

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setIsSaving(true)
    onError(null)
    try {
      await updateCurrencyMultiplier(currency, multiplier)
    } catch (error) {
      onError(errorMessage(error, 'Failed to update the multiplier.'))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="flex items-center gap-2">
      <Label htmlFor={`multiplier-${currency.code}`} className="sr-only">{currency.code} multiplier</Label>
      <Input id={`multiplier-${currency.code}`} inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} className="h-9 w-24" autoComplete="off" />
      <Button type="submit" size="sm" variant="outline" disabled={isSaving || unchanged || !(multiplier > 0)}>
        {isSaving ? 'Saving...' : 'Save'}
      </Button>
    </form>
  )
}

export default function CurrenciesPage() {
  const provider = useFinanceDataProvider()
  const { data: currencyList, isLoading, error } = useCurrencies()
  const { addCurrency, removeCurrency, changeDefaultCurrency } = useCurrencyActions()
  const { data: transactions } = useFullTransactions()
  const { data: ratesStart } = useRatesStart(provider.mode === 'google')
  // The rates being extended, kept while the dialog is open: ratesStart changes once extended
  const [extending, setExtending] = useState<ExtendableRatesStart | null>(null)

  const [kind, setKind] = useState<Kind>('standard')
  const [code, setCode] = useState('')
  const [multiplier, setMultiplier] = useState('')
  const [isAdding, setIsAdding] = useState(false)
  const [pendingRemove, setPendingRemove] = useState<CurrencyDefinition | null>(null)
  const [isRemoving, setIsRemoving] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [newDefault, setNewDefault] = useState<string | null>(null)
  const [confirmDefault, setConfirmDefault] = useState(false)
  const [isChangingDefault, setIsChangingDefault] = useState(false)

  // What changing the default silently re-reads: rows without a currency, and rows in a multiplier,
  // which assumes the amount is in the default currency
  const affected = useMemo(() => {
    const multipliers = new Set(currencyList?.currencies.filter(c => c.kind === 'custom').map(c => c.code))
    return {
      multipliers: [...multipliers],
      implicit: transactions?.filter(t => t.implicitCurrency).length ?? null,
      inMultipliers: transactions?.filter(t => multipliers.has(t.currency)).length ?? null,
    }
  }, [currencyList, transactions])

  const handleChangeDefault = async () => {
    if (!newDefault) return
    setIsChangingDefault(true)
    setActionError(null)
    try {
      await changeDefaultCurrency(newDefault)
      setNewDefault(null)
    } catch (changeError) {
      setActionError(errorMessage(changeError, 'Failed to change the default currency.'))
    } finally {
      setIsChangingDefault(false)
      setConfirmDefault(false)
    }
  }

  const handleAdd = async (event: FormEvent) => {
    event.preventDefault()
    setIsAdding(true)
    setActionError(null)
    try {
      const normalized = code.trim().toUpperCase()
      await addCurrency(kind === 'custom' ? { code: normalized, multiplier: parseMultiplier(multiplier) } : { code: normalized })
      setCode('')
      setMultiplier('')
    } catch (addError) {
      setActionError(errorMessage(addError, 'Failed to add the currency.'))
    } finally {
      setIsAdding(false)
    }
  }

  const handleRemove = async () => {
    if (!pendingRemove) return
    setIsRemoving(true)
    setActionError(null)
    try {
      await removeCurrency(pendingRemove)
    } catch (removeError) {
      setActionError(errorMessage(removeError, 'Failed to remove the currency.'))
    } finally {
      setIsRemoving(false)
      setPendingRemove(null)
    }
  }

  if (provider.mode === 'demo') {
    return (
      <Alert className="max-w-lg mx-auto mt-10">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>Currency management needs a Google spreadsheet.</AlertDescription>
      </Alert>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  if (error) {
    return (
      <Alert variant="destructive" className="max-w-lg mx-auto mt-10">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{errorMessage(error, 'Failed to load currencies.')}</AlertDescription>
      </Alert>
    )
  }

  if (!currencyList) {
    return (
      <Alert className="max-w-lg mx-auto mt-10">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Your spreadsheet has no &quot;{SHEETS.CURRENCIES}&quot; tab with the default currency in B1, so amounts are shown in PLN. Copy the tab from the template to manage currencies.
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Currencies</CardTitle>
          <CardDescription>
            Amounts are converted to {currencyList.defaultCurrency}, the default currency in B1 of the &quot;{SHEETS.CURRENCIES}&quot; tab.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {actionError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{actionError}</AlertDescription>
            </Alert>
          )}
          <ul className="divide-y">
            {currencyList.currencies.map(currency => (
              <li key={`${currency.column}-${currency.code}`} className="flex flex-wrap items-center gap-2 py-3">
                <span className="font-semibold">{currency.code}</span>
                <Badge variant="secondary">
                  {currency.isDefault ? 'Default' : currency.kind === 'custom' ? 'Multiplier' : 'Exchange rate'}
                </Badge>
                <div className="ml-auto flex items-center gap-2">
                  {currency.kind === 'custom' && <MultiplierEditor key={currency.multiplier} currency={currency} onError={setActionError} />}
                  {!currency.isDefault && (
                    <Button size="sm" variant="ghost" onClick={() => setPendingRemove(currency)}>
                      Remove
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {ratesStart && (
        <Card>
          <CardHeader>
            <CardTitle>Rate history</CardTitle>
            <CardDescription>
              A transaction dated before the rates start cannot be converted. Extending moves the start of every currency formula back to the earliest transaction.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {typeof ratesStart.start === 'string' ? (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{ratesStart.start}</AlertDescription>
              </Alert>
            ) : (
              <p className="text-sm">
                Rates start {formatDate(ratesStart.start)} · earliest transaction {ratesStart.earliest ? formatDate(ratesStart.earliest) : 'none'}
              </p>
            )}
            {canExtendRates(ratesStart) ? (
              <Button variant="outline" onClick={() => setExtending(ratesStart)}>
                Extend rates to {formatDate(ratesStart.earliest)}
              </Button>
            ) : (
              <Button variant="outline" disabled>Extend rates</Button>
            )}
            {extending && (
              <ExtendRatesDialog ratesStart={extending} open onOpenChange={(open) => { if (!open) setExtending(null) }} onError={setActionError} />
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Default currency</CardTitle>
          <CardDescription>
            Only an exchange-rate currency can become the default. {currencyList.defaultCurrency} then takes its place in the list.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-2">
          <Select value={newDefault ?? ''} onValueChange={setNewDefault}>
            <SelectTrigger className="w-[140px]" aria-label="New default currency">
              <SelectValue placeholder={currencyList.defaultCurrency} />
            </SelectTrigger>
            <SelectContent>
              {currencyList.currencies.filter(c => !c.isDefault && c.kind === 'standard').map(c => (
                <SelectItem key={c.code} value={c.code}>{c.code}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" disabled={!newDefault} onClick={() => setConfirmDefault(true)}>
            Change default
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Add a currency</CardTitle>
          <CardDescription>
            {kind === 'standard'
              ? `Converted to ${currencyList.defaultCurrency} with daily rates from Google Finance.`
              : `Converted by a fixed multiplier, e.g. 0.5 to count half of a joint account's payments.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={(event) => void handleAdd(event)} className="space-y-4">
            <ToggleGroup type="single" variant="outline" value={kind} onValueChange={(value) => { if (value) setKind(value as Kind) }}>
              <ToggleGroupItem value="standard">Exchange rate</ToggleGroupItem>
              <ToggleGroupItem value="custom">Multiplier</ToggleGroupItem>
            </ToggleGroup>
            <div className="space-y-2">
              <Label htmlFor="currency-code">{kind === 'standard' ? 'Currency code' : 'Name'}</Label>
              <Input id="currency-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder={kind === 'standard' ? 'EUR' : 'JOINED_ACCOUNT'} autoComplete="off" />
            </div>
            {kind === 'custom' && (
              <div className="space-y-2">
                <Label htmlFor="currency-multiplier">Multiplier</Label>
                <Input id="currency-multiplier" inputMode="decimal" value={multiplier} onChange={(e) => setMultiplier(e.target.value)} placeholder="0.5" autoComplete="off" />
              </div>
            )}
            <Button type="submit" disabled={isAdding || !code.trim()}>
              {isAdding ? 'Adding...' : 'Add currency'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <AlertDialog open={confirmDefault} onOpenChange={(open) => { if (!open && !isChangingDefault) setConfirmDefault(false) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Make {newDefault} the default currency?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>Every converted amount, past ones included, is recalculated in {newDefault}. {currencyList.defaultCurrency} stays in the list, converted with {newDefault} rates.</p>
                <p className="font-semibold text-destructive">
                  Warning: transactions without a currency are converted silently. They count as the default currency, so their amounts are read as {newDefault} instead of {currencyList.defaultCurrency}
                  {affected.implicit !== null && ` (${affected.implicit} transaction${affected.implicit === 1 ? '' : 's'})`}.
                </p>
                {affected.multipliers.length > 0 && (
                  <p className="font-semibold text-destructive">
                    Warning: multipliers ({affected.multipliers.join(', ')}) assume amounts in the default currency, so their transactions are read as {newDefault} too
                    {affected.inMultipliers !== null && ` (${affected.inMultipliers} transaction${affected.inMultipliers === 1 ? '' : 's'})`}.
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isChangingDefault}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isChangingDefault}
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={(event) => {
                // Keep the dialog open until the change finishes
                event.preventDefault()
                void handleChangeDefault()
              }}
            >
              {isChangingDefault ? 'Changing...' : `Make ${newDefault} the default`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={pendingRemove !== null} onOpenChange={(open) => { if (!open && !isRemoving) setPendingRemove(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {pendingRemove?.code}?</AlertDialogTitle>
            <AlertDialogDescription>
              Its cells are cleared from the &quot;{SHEETS.CURRENCIES}&quot; tab; its columns stay empty so other currencies keep their positions. A currency used by any transaction cannot be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRemoving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isRemoving}
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={(event) => {
                // Keep the dialog open until the removal finishes
                event.preventDefault()
                void handleRemove()
              }}
            >
              {isRemoving ? 'Removing...' : 'Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
