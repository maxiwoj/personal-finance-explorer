import type { Transaction } from '@/lib/types'
import { cn } from '@/lib/utils'
import { StickyNote } from 'lucide-react'

// Small icons next to a transaction's description in lists; the details show what they stand for
export function TransactionIndicators({ transaction, className }: { transaction: Transaction; className?: string }) {
  if (!transaction.notes) return null

  return (
    <span className={cn('flex shrink-0 items-center gap-1 text-muted-foreground', className)}>
      <StickyNote className="h-3.5 w-3.5" aria-label="Has notes" />
    </span>
  )
}
