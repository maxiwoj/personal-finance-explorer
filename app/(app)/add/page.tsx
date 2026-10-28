'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { TransactionForm } from '@/components/transaction-form'
import { useOnline, useOutboxEntries } from '@/hooks/use-outbox-sync'
import { getCategoryColor } from '@/lib/colors'
import { isStalled } from '@/lib/outbox-view'
import type { TransactionInput } from '@/lib/types'
import { CheckCircle2 } from 'lucide-react'

export default function AddTransactionPage() {
  const [saved, setSaved] = useState<TransactionInput | null>(null)
  const [outboxId, setOutboxId] = useState<string | null>(null)
  const entries = useOutboxEntries()
  const online = useOnline()
  // Still on this device: offline, or the sync failed so far
  const queued = entries.find((entry) => entry.id === outboxId)
  const title = queued?.status === 'failed' ? 'Saved – not synced' : queued && isStalled(queued, online) ? 'Saved – will sync when online' : 'Transaction added'

  return (
    <div className="max-w-xl mx-auto">
      <Card>
        {saved ? (
          <CardContent className="py-10 flex flex-col items-center text-center gap-4">
            <CheckCircle2 className="h-14 w-14 text-emerald-500" />
            <div className="space-y-1">
              <p className="text-lg font-semibold">{title}</p>
              <p className="text-3xl font-black tracking-tight">
                {saved.amount.toLocaleString('pl-PL', { minimumFractionDigits: 2 })}
                <span className="text-sm font-bold text-muted-foreground ml-1 uppercase">{saved.currency}</span>
              </p>
              <p className="text-base font-medium">{saved.what}</p>
              <span
                className="inline-block px-2 py-0.5 text-xs font-bold rounded-md text-white"
                style={{ backgroundColor: getCategoryColor(saved.category.toLowerCase()) }}
              >
                {saved.category.toLowerCase()}
              </span>
            </div>
            <div className="flex w-full gap-2 pt-2">
              <Button variant="outline" size="lg" className="flex-1" asChild>
                <Link href="/transactions">View transactions</Link>
              </Button>
              <Button size="lg" className="flex-1" onClick={() => setSaved(null)} autoFocus>
                Add another
              </Button>
            </div>
          </CardContent>
        ) : (
          <>
            <CardHeader>
              <CardTitle>Add Transaction</CardTitle>
              <CardDescription>Saved to your spreadsheet with the current date and time.</CardDescription>
            </CardHeader>
            <CardContent>
              <TransactionForm onSaved={(input, id) => { setSaved(input); setOutboxId(id ?? null) }} />
            </CardContent>
          </>
        )}
      </Card>
    </div>
  )
}
