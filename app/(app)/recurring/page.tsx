'use client'

import { useMemo, useState } from 'react'
import { useFinanceDataProvider } from '@/contexts/data-provider-context'
import { useRecurringActions, useRecurringPayments } from '@/hooks/use-transactions'
import { RecurringPaymentForm } from '@/components/recurring-payment-form'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
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
import { getCategoryColor } from '@/lib/colors'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/currencies'
import { canEnd, compareDates, dayOf, describeSchedule, hasEnded, type RecurringPayment } from '@/lib/recurring'
import { AlertCircle, Plus } from 'lucide-react'

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

export default function RecurringPaymentsPage() {
  const provider = useFinanceDataProvider()
  const { data: payments, isLoading, error } = useRecurringPayments()
  const { deleteRecurringPayment, endRecurringPayment } = useRecurringActions()
  // 'new' while adding, a payment while editing it
  const [editing, setEditing] = useState<RecurringPayment | 'new' | null>(null)
  // The payment to end or delete, awaiting confirmation
  const [pending, setPending] = useState<{ payment: RecurringPayment; action: 'end' | 'delete' } | null>(null)
  const [isWorking, setIsWorking] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const today = dayOf(new Date())

  // Ended payments last, so the ones still making drafts come first
  const sorted = useMemo(
    () => [...(payments ?? [])].sort((a, b) => Number(hasEnded(a)) - Number(hasEnded(b))),
    [payments]
  )

  const handleConfirm = async () => {
    if (!pending) return
    setIsWorking(true)
    setActionError(null)
    try {
      await (pending.action === 'end' ? endRecurringPayment(pending.payment) : deleteRecurringPayment(pending.payment))
    } catch (actionFailure) {
      setActionError(errorMessage(actionFailure, `Failed to ${pending.action} the recurring payment.`))
    } finally {
      setIsWorking(false)
      setPending(null)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  if (error && payments === undefined) {
    return (
      <Alert variant="destructive" className="max-w-lg mx-auto mt-10">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{errorMessage(error, 'Failed to load recurring payments.')}</AlertDescription>
      </Alert>
    )
  }

  if (editing) {
    return (
      <div className="max-w-xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>{editing === 'new' ? 'Add recurring payment' : 'Edit recurring payment'}</CardTitle>
            <CardDescription>
              When a payment is due, it shows as a draft transaction on the Transactions page to approve or remove.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RecurringPaymentForm
              key={editing === 'new' ? 'new' : editing.id}
              original={editing === 'new' ? undefined : editing}
              onSaved={() => setEditing(null)}
              onCancel={() => setEditing(null)}
            />
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="max-w-xl mx-auto space-y-6">
      {provider.mode === 'demo' && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Recurring payments are not available in demo mode. Connect a Google Sheet to unlock the full app.
          </AlertDescription>
        </Alert>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Recurring payments</CardTitle>
          <CardDescription>
            Kept in the &quot;{SHEETS.RECURRING}&quot; tab of your spreadsheet. Due payments show as draft transactions on the Transactions page.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {actionError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{actionError}</AlertDescription>
            </Alert>
          )}
          {!sorted.length ? (
            <p className="text-sm text-muted-foreground">No recurring payments yet.</p>
          ) : (
            <ul className="divide-y">
              {sorted.map(payment => {
                const ended = hasEnded(payment)
                const due = !ended && compareDates(payment.next, today) <= 0
                return (
                  <li key={payment.id} className={cn('flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-3', ended && 'text-muted-foreground')}>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="truncate font-medium">{payment.what}</span>
                          {ended && <Badge variant="secondary">Ended</Badge>}
                          {due && <Badge>Due</Badge>}
                        </div>
                        <span className="shrink-0 font-semibold tabular-nums">
                          {payment.amount.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} {payment.currency}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                        <span className="inline-block rounded-md px-2 py-0.5 font-bold text-white" style={{ backgroundColor: getCategoryColor(payment.category) }}>
                          {payment.category}
                        </span>
                        <span className="whitespace-nowrap">{describeSchedule(payment)}</span>
                        {!ended && <span className="whitespace-nowrap">· next {formatDate(payment.next)}</span>}
                        {payment.end && <span className="whitespace-nowrap">· until {formatDate(payment.end)}</span>}
                      </div>
                    </div>
                    {/* Fixed width on wide screens, so amounts line up whether or not End is offered */}
                    <div className="flex shrink-0 justify-end gap-1 sm:w-48">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(payment)}>Edit</Button>
                      {canEnd(payment) && (
                        <Button size="sm" variant="ghost" onClick={() => setPending({ payment, action: 'end' })}>End</Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => setPending({ payment, action: 'delete' })}>Delete</Button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
          <Button onClick={() => { setActionError(null); setEditing('new') }} disabled={provider.mode === 'demo'} className="gap-2">
            <Plus className="h-4 w-4" />
            Add recurring payment
          </Button>
        </CardContent>
      </Card>

      <AlertDialog open={pending !== null} onOpenChange={(open) => { if (!open && !isWorking) setPending(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pending?.action === 'end' ? 'End' : 'Delete'} {pending?.payment.what}?</AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.action === 'end'
                ? `No drafts are made from ${pending ? formatDate(pending.payment.next) : ''} on. It stays in the list as ended, and its transactions keep showing which payment they belong to. Clear the end date by editing it to resume.`
                : `Its row is removed from the "${SHEETS.RECURRING}" tab and no more drafts are made. Transactions it already added stay, but no longer show which payment they belonged to.${pending && canEnd(pending.payment) ? ' To keep that, end it instead.' : ''}`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isWorking}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isWorking}
              className={cn(pending?.action === 'delete' && 'bg-destructive text-white hover:bg-destructive/90')}
              onClick={(event) => {
                // Keep the dialog open until the change finishes
                event.preventDefault()
                void handleConfirm()
              }}
            >
              {isWorking ? 'Saving...' : pending?.action === 'end' ? 'End' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
