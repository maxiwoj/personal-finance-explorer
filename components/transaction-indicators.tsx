import type { Transaction } from '@/lib/types'
import { cn } from '@/lib/utils'
import { CloudAlert, CloudOff, StickyNote, Undo2 } from 'lucide-react'

// Small icons next to a transaction's description in lists; the details show what they stand for
export function TransactionIndicators({ transaction, className }: { transaction: Transaction; className?: string }) {
  const { unsynced } = transaction
  if (!transaction.notes && !transaction.returns && !unsynced) return null

  return (
    <span className={cn('flex shrink-0 items-center gap-1 text-muted-foreground', className)}>
      {unsynced?.status === 'failed' && <CloudAlert className="h-3.5 w-3.5" aria-label={`Not synced: ${unsynced.error ?? 'sync failed'}`} />}
      {unsynced && unsynced.status !== 'failed' && <CloudOff className="h-3.5 w-3.5" aria-label="Not synced yet" />}
      {transaction.returns && <Undo2 className="h-3.5 w-3.5" aria-label="Returned" />}
      {transaction.notes && <StickyNote className="h-3.5 w-3.5" aria-label="Has notes" />}
    </span>
  )
}
