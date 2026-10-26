'use client'

import { useState, type FormEvent } from 'react'
import { useSaveTransaction } from '@/hooks/use-transactions'
import { returnableAmount } from '@/lib/returns'
import { parseMoney } from '@/lib/sheets'
import type { Transaction } from '@/lib/types'
import { AMOUNT_PATTERN } from '@/components/transaction-form'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AlertCircle } from 'lucide-react'

interface ReturnFormProps {
  purchase: Transaction
  onSaved: () => void
  onCancel: () => void
}

// Records a return as its own row: dated now, with a negative amount in the purchase's currency,
// linked to the purchase by its TransactionID
export function ReturnForm({ purchase, onSaved, onCancel }: ReturnFormProps) {
  const saveTransaction = useSaveTransaction()
  const returnable = returnableAmount(purchase)
  const [amount, setAmount] = useState(String(returnable))
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const text = amount.trim()
    const value = AMOUNT_PATTERN.test(text) ? parseMoney(text) : null

    if (value === null || value <= 0) {
      setError('Enter the returned amount, e.g. 12.50.')
      return
    }

    if (value > returnable) {
      setError(`At most ${returnable} ${purchase.currency} can be returned.`)
      return
    }

    setError(null)
    setIsSaving(true)
    try {
      await saveTransaction({
        timestamp: new Date(),
        what: purchase.what,
        category: purchase.category,
        amount: -value,
        currency: purchase.currency,
        returnOf: purchase.transactionId,
      })
      onSaved()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to record the return.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="return-amount">Returned amount ({purchase.currency})</Label>
        <Input
          id="return-amount"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          autoComplete="off"
          autoFocus
          className="h-14 text-2xl font-semibold md:text-2xl"
        />
        <p className="text-xs text-muted-foreground">
          Up to {returnable} {purchase.currency}. Counts towards the purchase&apos;s month and category.
        </p>
      </div>

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
          {isSaving ? 'Saving...' : 'Record return'}
        </Button>
      </div>
    </form>
  )
}
