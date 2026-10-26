import type { Transaction } from '@/lib/types'
import { cn } from '@/lib/utils'
import { StickyNote, Undo2 } from 'lucide-react'

// Small icons next to a transaction's description in lists; the details show what they stand for
export function TransactionIndicators({ transaction, className }: { transaction: Transaction; className?: string }) {
  if (!transaction.notes && !transaction.returns) return null

  return (
    <span className={cn('flex shrink-0 items-center gap-1 text-muted-foreground', className)}>
      {transaction.returns && <Undo2 className="h-3.5 w-3.5" aria-label="Returned" />}
      {transaction.notes && <StickyNote className="h-3.5 w-3.5" aria-label="Has notes" />}
    </span>
  )
}
