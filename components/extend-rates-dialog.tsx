'use client'

import { useState } from 'react'
import { useRatesStartActions } from '@/hooks/use-transactions'
import { formatDate, type ExtendableRatesStart, type ExtendResult, type StartDate } from '@/lib/currencies'
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

// Confirms moving the start of every currency formula back to the earliest transaction. Once
// Google Finance has answered, a currency it has no rates for that far back is reported and the
// start can be reverted; the dialog stays open for that, so the caller keeps it mounted until
// onOpenChange(false) even if ratesStart changes meanwhile.
export function ExtendRatesDialog({ ratesStart, open, onOpenChange, onExtended, onError }: ExtendRatesDialogProps) {
  const { extendRates, revertRates } = useRatesStartActions()
  const [isWorking, setIsWorking] = useState(false)
  const [result, setResult] = useState<ExtendResult | null>(null)
  const newStart = formatDate(ratesStart.earliest)

  const close = () => {
    setResult(null)
    onOpenChange(false)
  }

  const handleExtend = async () => {
    setIsWorking(true)
    try {
      const extended = await extendRates(ratesStart.earliest)
      if (extended.broken.length > 0 || extended.loading.length > 0) {
        setResult(extended)
        return
      }
      close()
      onExtended?.()
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Failed to extend the rates.')
      close()
    } finally {
      setIsWorking(false)
    }
  }

  const handleRevert = async (previousStart: StartDate) => {
    setIsWorking(true)
    try {
      await revertRates(ratesStart.earliest, previousStart)
      onExtended?.()
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Failed to revert the rates.')
    } finally {
      setIsWorking(false)
      close()
    }
  }

  const keep = () => {
    close()
    onExtended?.()
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (next || isWorking) return
        // Dismissing after the extension keeps it
        if (result) keep()
        else close()
      }}
    >
      <AlertDialogContent>
        {result ? (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Some currencies may have no rates back to {newStart}</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2">
                  {result.broken.length > 0 && (
                    <p className="font-semibold text-destructive">
                      {result.broken.join(', ')} {result.broken.length === 1 ? 'shows an error or has' : 'show an error or have'} no rates from {newStart} since the start moved, so {result.broken.length === 1 ? 'its' : 'their'} transactions are not converted correctly.
                    </p>
                  )}
                  {result.loading.length > 0 && (
                    <p>Google Finance was still loading {result.loading.join(', ')}. Check {result.loading.length === 1 ? 'it' : 'them'} in the &quot;{SHEETS.CURRENCIES}&quot; tab.</p>
                  )}
                  <p>Reverting moves every currency back to {formatDate(result.previousStart)}, as they must share one start.</p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isWorking} onClick={(event) => { event.preventDefault(); keep() }}>
                Keep {newStart}
              </AlertDialogCancel>
              <AlertDialogAction
                disabled={isWorking}
                className="bg-destructive text-white hover:bg-destructive/90"
                onClick={(event) => {
                  // Keep the dialog open until the revert finishes
                  event.preventDefault()
                  void handleRevert(result.previousStart)
                }}
              >
                {isWorking ? 'Reverting...' : `Revert to ${formatDate(result.previousStart)}`}
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        ) : (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Extend rates to {newStart}?</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2">
                  <p>
                    The rates start on {formatDate(ratesStart.start)}. {ratesStart.formulas} currency formula{ratesStart.formulas === 1 ? '' : 's'} in the &quot;{SHEETS.CURRENCIES}&quot; tab
                    {ratesStart.formulas === 1 ? ' is' : ' are'} rewritten to start on {newStart}, the day of the earliest transaction.
                  </p>
                  <p className="font-semibold text-destructive">
                    Warning: Google Finance may have no rates that far back for some currencies. Such a currency then shows no rates at all. The app checks once Google Finance answers and offers to revert.
                  </p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isWorking}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={isWorking}
                onClick={(event) => {
                  // Keep the dialog open until the change and the check finish
                  event.preventDefault()
                  void handleExtend()
                }}
              >
                {isWorking ? 'Checking rates...' : `Extend to ${newStart}`}
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  )
}
