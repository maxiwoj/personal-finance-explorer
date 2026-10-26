'use client'

import { useState, type FormEvent } from 'react'
import { useFinanceDataProvider } from '@/contexts/data-provider-context'
import { useCurrencies, useCurrencyActions } from '@/hooks/use-transactions'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
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
  const { addCurrency, removeCurrency } = useCurrencyActions()

  const [kind, setKind] = useState<Kind>('standard')
  const [code, setCode] = useState('')
  const [multiplier, setMultiplier] = useState('')
  const [isAdding, setIsAdding] = useState(false)
  const [pendingRemove, setPendingRemove] = useState<CurrencyDefinition | null>(null)
  const [isRemoving, setIsRemoving] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

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
