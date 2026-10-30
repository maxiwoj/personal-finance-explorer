'use client'

import { useState } from 'react'
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
import { formatDate } from '@/lib/currencies'
import { compareDates, dayOf, describeSchedule, hasEnded, type RecurringPayment } from '@/lib/recurring'
import { AlertCircle, Plus } from 'lucide-react'

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

export default function RecurringPaymentsPage() {
  const provider = useFinanceDataProvider()
  const { data: payments, isLoading, error } = useRecurringPayments()
  const { deleteRecurringPayment } = useRecurringActions()
  // 'new' while adding, a payment while editing it
  const [editing, setEditing] = useState<RecurringPayment | 'new' | null>(null)
  const [pendingDelete, setPendingDelete] = useState<RecurringPayment | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const today = dayOf(new Date())

  const handleDelete = async () => {
    if (!pendingDelete) return
    setIsDeleting(true)
    setActionError(null)
    try {
      await deleteRecurringPayment(pendingDelete)
    } catch (deleteError) {
      setActionError(errorMessage(deleteError, 'Failed to delete the recurring payment.'))
    } finally {
      setIsDeleting(false)
      setPendingDelete(null)
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
          {!payments?.length ? (
            <p className="text-sm text-muted-foreground">No recurring payments yet.</p>
          ) : (
            <ul className="divide-y">
              {payments.map(payment => {
                const ended = hasEnded(payment)
                const due = !ended && compareDates(payment.next, today) <= 0
                return (
                  <li key={payment.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">{payment.what}</span>
                        {ended && <Badge variant="secondary">Ended</Badge>}
                        {due && <Badge>Due</Badge>}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span className="inline-block rounded-md px-2 py-0.5 font-bold text-white" style={{ backgroundColor: getCategoryColor(payment.category) }}>
                          {payment.category}
                        </span>
                        <span>{describeSchedule(payment)}</span>
                        {!ended && <span>· next {formatDate(payment.next)}</span>}
                        {payment.end && <span>· until {formatDate(payment.end)}</span>}
                      </div>
                    </div>
                    <span className="font-semibold tabular-nums">
                      {payment.amount.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} {payment.currency}
                    </span>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(payment)}>Edit</Button>
                      <Button size="sm" variant="ghost" onClick={() => setPendingDelete(payment)}>Delete</Button>
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

      <AlertDialog open={pendingDelete !== null} onOpenChange={(open) => { if (!open && !isDeleting) setPendingDelete(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {pendingDelete?.what}?</AlertDialogTitle>
            <AlertDialogDescription>
              Its row is removed from the &quot;{SHEETS.RECURRING}&quot; tab and no more drafts are made. Transactions it already added stay.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeleting}
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={(event) => {
                // Keep the dialog open until the deletion finishes
                event.preventDefault()
                void handleDelete()
              }}
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
