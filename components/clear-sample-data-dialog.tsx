'use client'

import { useEffect, useRef, useState } from 'react'
import { useSampleDataActions } from '@/hooks/use-sheet-config'
import { SHEETS } from '@/lib/config'
import type { SampleDataCounts, SampleDataPlan } from '@/lib/sheet-config'
import { Input } from '@/components/ui/input'
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

const CONFIRM_WORD = 'DELETE'

function count(value: number, word: string) {
  return `${value} ${word}${value === 1 ? '' : 's'}`
}

function describeCounts({ transactions, recurring, categories, keptTransactions, keptRecurring }: SampleDataCounts) {
  return [
    `${count(transactions, 'sample transaction')} in "${SHEETS.FULL}"`,
    `${count(recurring, 'sample recurring payment')} in "${SHEETS.RECURRING}"`,
    // Categories are kept while the user's own transactions use them
    ...(keptTransactions || keptRecurring ? [] : [`${count(categories, 'category')} in "${SHEETS.CATEGORIES}"`]),
  ]
}

// What stays besides headers, formulas, currencies and settings
function describeKept({ keptTransactions, keptRecurring }: SampleDataCounts) {
  if (!keptTransactions && !keptRecurring) return 'Headers, formulas, currencies and settings stay.'
  const own = [keptTransactions && count(keptTransactions, 'transaction'), keptRecurring && count(keptRecurring, 'recurring payment')].filter(Boolean).join(' and ')
  return `Your own ${own} and the categories stay, as do headers, formulas, currencies and settings.`
}

interface ClearSampleDataDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

// Reads the sheet when opened and shows what clearing the template's sample data removes, or why
// it is refused. The user types DELETE to confirm; the clear checks the sheet once more.
export function ClearSampleDataDialog({ open, onOpenChange }: ClearSampleDataDialogProps) {
  const { checkSampleData, clearSampleData, reloadAfterClear } = useSampleDataActions()
  const [plan, setPlan] = useState<SampleDataPlan | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmText, setConfirmText] = useState('')
  const [isClearing, setIsClearing] = useState(false)
  const [cleared, setCleared] = useState<SampleDataCounts | null>(null)
  // The data still shows the sample rows until reloaded: on close, or if the page goes away first
  const needsReload = useRef(false)
  const reloadIfCleared = () => {
    if (!needsReload.current) return
    needsReload.current = false
    void reloadAfterClear()
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- on unmount only
  useEffect(() => reloadIfCleared, [])

  useEffect(() => {
    if (!open) return
    let active = true
    setPlan(null)
    setError(null)
    setConfirmText('')
    setCleared(null)
    checkSampleData()
      .then((result) => { if (active) setPlan(result) })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'Failed to read the spreadsheet.') })
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- read once per opening
  }, [open])

  const handleClear = async () => {
    setIsClearing(true)
    setError(null)
    try {
      const counts = await clearSampleData()
      needsReload.current = true
      setCleared(counts)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Failed to clear the sample data.')
    } finally {
      setIsClearing(false)
    }
  }

  const canClear = plan?.ok && confirmText.trim() === CONFIRM_WORD && !isClearing && !cleared

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (isClearing) return
        if (!next) reloadIfCleared()
        onOpenChange(next)
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{cleared ? 'Sample data cleared' : 'Clear sample data'}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              {cleared ? (
                <p>Removed {describeCounts(cleared).join(', ')}.{cleared.keptTransactions ? '' : ' Add your own transactions to get started.'}</p>
              ) : error ? (
                <p className="text-destructive">{error}</p>
              ) : !plan ? (
                <p>Checking the spreadsheet...</p>
              ) : !plan.ok ? (
                <p>{plan.reason}</p>
              ) : (
                <>
                  <p>This deletes the template&apos;s sample data (rows whose ID starts with &quot;sample-&quot;) from your spreadsheet:</p>
                  <ul className="list-disc pl-5">
                    {describeCounts(plan.counts).map((line) => <li key={line}>{line}</li>)}
                  </ul>
                  <p>{describeKept(plan.counts)}</p>
                  <p className="font-semibold text-destructive">
                    This can&apos;t be undone from the app. To get the data back, use File → Version history in Google Sheets.
                  </p>
                  <p>Type {CONFIRM_WORD} to confirm.</p>
                  <Input
                    value={confirmText}
                    onChange={(event) => setConfirmText(event.target.value)}
                    placeholder={CONFIRM_WORD}
                    aria-label={`Type ${CONFIRM_WORD} to confirm`}
                    autoComplete="off"
                    disabled={isClearing}
                  />
                </>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isClearing}>{cleared || (plan && !plan.ok) || error ? 'Close' : 'Cancel'}</AlertDialogCancel>
          {plan?.ok && !cleared && (
            <AlertDialogAction
              disabled={!canClear}
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={(event) => {
                // Keep the dialog open to show the result
                event.preventDefault()
                void handleClear()
              }}
            >
              {isClearing ? 'Clearing...' : 'Clear sample data'}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
