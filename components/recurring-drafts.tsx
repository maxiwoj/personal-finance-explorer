'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRecurringActions, useRecurringDrafts } from '@/hooks/use-transactions'
import { getCategoryColor } from '@/lib/colors'
import { formatDate } from '@/lib/currencies'
import { compareDates, dayOf, describeSchedule, isoDate, type RecurringDraft } from '@/lib/recurring'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertCircle, Check, Repeat, X } from 'lucide-react'

function draftKey(draft: RecurringDraft) {
  return `${draft.payment.id}-${isoDate(draft.date)}`
}

// Approving or removing a draft, one at a time; busy is the draft being saved. handle resolves
// to whether it succeeded.
function useDraftActions() {
  const { approveRecurringDraft, skipRecurringDraft } = useRecurringActions()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handle = async (draft: RecurringDraft, approve: boolean) => {
    setBusy(draftKey(draft))
    setError(null)
    try {
      await (approve ? approveRecurringDraft(draft) : skipRecurringDraft(draft))
      return true
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Failed to update the recurring payment.')
      return false
    } finally {
      setBusy(null)
    }
  }

  return { busy, error, setError, handle }
}

export function dueLabel(draft: RecurringDraft) {
  return compareDates(draft.date, dayOf(new Date())) === 0 ? 'due today' : `due ${formatDate(draft.date)}`
}

// Marks a draft among transactions
export function DraftBadge({ className }: { className?: string }) {
  return (
    <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0 h-4 gap-1 border-primary/50 text-primary', className)}>
      <Repeat className="h-2.5 w-2.5" />
      Draft
    </Badge>
  )
}

// Opened from a draft among the dashboard's transactions, to approve or remove it
export function RecurringDraftDialog({ draft, onClose }: { draft: RecurringDraft | null; onClose: () => void }) {
  const { busy, error, setError, handle } = useDraftActions()

  const close = () => {
    if (busy) return
    setError(null)
    onClose()
  }

  const act = async (approve: boolean) => {
    if (draft && await handle(draft, approve)) onClose()
  }

  return (
    <Dialog open={draft !== null} onOpenChange={(open) => { if (!open) close() }}>
      <DialogContent className="sm:max-w-sm">
        {draft && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Repeat className="h-4 w-4 text-primary" />
                Draft transaction
              </DialogTitle>
              <DialogDescription>
                A recurring payment {dueLabel(draft)}. Approve adds it as a transaction; remove skips this date.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <p className="font-semibold break-words">{draft.payment.what}</p>
                  <span className="inline-block rounded-md px-2 py-0.5 text-xs font-bold text-white" style={{ backgroundColor: getCategoryColor(draft.payment.category) }}>
                    {draft.payment.category}
                  </span>
                </div>
                <p className="shrink-0 text-lg font-bold tabular-nums">
                  {draft.payment.amount.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} {draft.payment.currency}
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                {describeSchedule(draft.payment)}
                {draft.moreDue > 0 && ` · ${draft.moreDue} more due after this one`}
              </p>
            </div>
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => void act(false)} disabled={busy !== null}>
                <X className="h-4 w-4" />
                Remove
              </Button>
              <Button className="flex-1" onClick={() => void act(true)} disabled={busy !== null}>
                <Check className="h-4 w-4" />
                {busy ? 'Saving...' : 'Approve'}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

// Due recurring payments, shown above the transactions until each is approved (added as a
// transaction) or removed (skipped). Nothing shows when none is due.
export function RecurringDrafts() {
  const drafts = useRecurringDrafts()
  const { busy, error, handle } = useDraftActions()

  if (drafts.length === 0) return null

  return (
    <Card className="border-dashed">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Repeat className="h-4 w-4" />
          Draft transactions
        </CardTitle>
        <CardDescription>
          Recurring payments that are due. Approve adds one as a transaction; remove skips it.{' '}
          <Link href="/recurring" className="underline underline-offset-2">Manage recurring payments</Link>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <ul className="divide-y">
          {drafts.map(draft => {
            const { payment } = draft
            const key = draftKey(draft)
            return (
              <li key={key} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
                <span className="text-sm text-muted-foreground tabular-nums">{formatDate(draft.date)}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{payment.what}</div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="inline-block rounded-md px-2 py-0.5 font-bold text-white" style={{ backgroundColor: getCategoryColor(payment.category) }}>
                      {payment.category}
                    </span>
                    {draft.moreDue > 0 && <span>+{draft.moreDue} more due</span>}
                  </div>
                </div>
                <span className="font-semibold tabular-nums">
                  {payment.amount.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} {payment.currency}
                </span>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => void handle(draft, false)} disabled={busy !== null} aria-label={`Remove ${payment.what} on ${formatDate(draft.date)}`}>
                    <X className="h-4 w-4" />
                    Remove
                  </Button>
                  <Button size="sm" onClick={() => void handle(draft, true)} disabled={busy !== null} aria-label={`Approve ${payment.what} on ${formatDate(draft.date)}`}>
                    <Check className="h-4 w-4" />
                    {busy === key ? 'Saving...' : 'Approve'}
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}
