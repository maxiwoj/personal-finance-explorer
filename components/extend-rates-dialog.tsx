'use client'

import { useState } from 'react'
import { useExtendRates } from '@/hooks/use-transactions'
import { formatDate, type ExtendableRatesStart } from '@/lib/currencies'
import { SHEETS } from '@/lib/config'
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

interface ExtendRatesDialogProps {
  // Only offered when the earliest transaction is before a readable start
  ratesStart: ExtendableRatesStart
  open: boolean
  onOpenChange: (open: boolean) => void
  onExtended?: () => void
  onError: (message: string) => void
}

// Confirms moving the start of every currency formula back to the earliest transaction
export function ExtendRatesDialog({ ratesStart, open, onOpenChange, onExtended, onError }: ExtendRatesDialogProps) {
  const extendRates = useExtendRates()
  const [isExtending, setIsExtending] = useState(false)
  const newStart = formatDate(ratesStart.earliest)

  const handleExtend = async () => {
    setIsExtending(true)
    try {
      await extendRates(ratesStart.earliest)
      onExtended?.()
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Failed to extend the rates.')
    } finally {
      setIsExtending(false)
      onOpenChange(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(next) => { if (!next && !isExtending) onOpenChange(false) }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Extend rates to {newStart}?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>
                The rates start on {formatDate(ratesStart.start)}. {ratesStart.formulas} currency formula{ratesStart.formulas === 1 ? '' : 's'} in the &quot;{SHEETS.CURRENCIES}&quot; tab
                {ratesStart.formulas === 1 ? ' is' : ' are'} rewritten to start on {newStart}, the day of the earliest transaction.
              </p>
              <p className="font-semibold text-destructive">
                Warning: Google Finance may have no rates that far back for some currencies. Such a currency then shows no rates at all, until its start is moved back in the spreadsheet.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isExtending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={isExtending}
            onClick={(event) => {
              // Keep the dialog open until the change finishes
              event.preventDefault()
              void handleExtend()
            }}
          >
            {isExtending ? 'Extending...' : `Extend to ${newStart}`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
