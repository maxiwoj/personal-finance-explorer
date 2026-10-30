'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRecurringActions, useRecurringDrafts } from '@/hooks/use-transactions'
import { getCategoryColor } from '@/lib/colors'
import { formatDate } from '@/lib/currencies'
import { compareDates, dayOf, isoDate, type RecurringDraft } from '@/lib/recurring'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AlertCircle, Check, Repeat, X } from 'lucide-react'

function draftKey(draft: RecurringDraft) {
  return `${draft.payment.id}-${isoDate(draft.date)}`
}

// Approving or removing a draft, one at a time; busy is the draft being saved
function useDraftActions() {
  const { approveRecurringDraft, skipRecurringDraft } = useRecurringActions()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handle = async (draft: RecurringDraft, approve: boolean) => {
    setBusy(draftKey(draft))
    setError(null)
    try {
      await (approve ? approveRecurringDraft(draft) : skipRecurringDraft(draft))
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Failed to update the recurring payment.')
    } finally {
      setBusy(null)
    }
  }

  return { busy, error, handle }
}

// A draft among the dashboard's recent transactions, marked as such and approved in one tap
export function RecurringDraftCard({ draft }: { draft: RecurringDraft }) {
  const { busy, error, handle } = useDraftActions()
  const { payment } = draft
  const dueToday = compareDates(draft.date, dayOf(new Date())) === 0

  return (
    <Card className="border-2 border-dashed border-primary/40 bg-transparent py-0 gap-0">
      <CardContent className="p-3.5 space-y-2">
        <div className="flex justify-between items-start gap-2">
          <div className="space-y-1 min-w-0">
            <p className="text-sm font-semibold leading-tight truncate">{payment.what}</p>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 gap-1 border-primary/40 text-primary">
                <Repeat className="h-2.5 w-2.5" />
                Draft
              </Badge>
              <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                {dueToday ? 'due today' : `due ${formatDate(draft.date)}`}
                {draft.moreDue > 0 && ` · +${draft.moreDue} more`}
              </span>
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="text-sm font-bold leading-none">
              {payment.amount.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-tighter mt-1">{payment.currency}</p>
          </div>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" className="h-7 flex-1" onClick={() => void handle(draft, false)} disabled={busy !== null} aria-label={`Remove ${payment.what} on ${formatDate(draft.date)}`}>
            <X className="h-3.5 w-3.5" />
            Remove
          </Button>
          <Button size="sm" className="h-7 flex-1" onClick={() => void handle(draft, true)} disabled={busy !== null} aria-label={`Approve ${payment.what} on ${formatDate(draft.date)}`}>
            <Check className="h-3.5 w-3.5" />
            {busy ? 'Saving...' : 'Approve'}
          </Button>
        </div>
      </CardContent>
    </Card>
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
