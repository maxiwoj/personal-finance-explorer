'use client'

import * as React from 'react'
import { formatDistanceToNow } from 'date-fns'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Transaction } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Wallet, ArrowRight } from 'lucide-react'
import { TransactionIndicators } from './transaction-indicators'
import { RecurringDraftCard } from './recurring-drafts'
import { draftTransactionId, type RecurringDraft } from '@/lib/recurring'

interface RecentTransactionsCarouselProps {
  transactions: Transaction[]
  className?: string
  limit?: number
  // Due recurring payments, shown first and marked as drafts to approve
  drafts?: RecurringDraft[]
  onTransactionClick?: (transaction: Transaction) => void
}

export function RecentTransactionsCarousel({
  transactions,
  className,
  limit = 3,
  drafts = [],
  onTransactionClick,
}: RecentTransactionsCarouselProps) {
  // Take the most recent transactions based on the limit
  const recentTransactions = React.useMemo(() => {
    return [...transactions]
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit)
  }, [transactions, limit])

  const scrollToRecent = () => {
    const element = document.getElementById('recent-transactions')
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  if (recentTransactions.length === 0 && drafts.length === 0) {
    return null
  }

  return (
    <div className={cn('w-full space-y-2', className)}>
      <div className="flex items-center justify-between px-1">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Wallet className="h-4 w-4 text-primary" />
          Recent Activity
        </h2>
        <button 
          onClick={scrollToRecent}
          className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors outline-none focus-visible:ring-1 focus-visible:ring-primary rounded-sm px-1"
        >
          View all
          <ArrowRight className="h-3 w-3" />
        </button>
      </div>
      
      {/* Native horizontal scroll for better desktop/trackpad experience */}
      <div className="w-full overflow-x-auto pb-2 scrollbar-none snap-x snap-mandatory flex gap-3 scroll-smooth">
        {drafts.map((draft) => (
          <div key={draftTransactionId(draft)} className="basis-[85%] sm:basis-[45%] lg:basis-[30%] shrink-0 snap-start">
            <RecurringDraftCard draft={draft} />
          </div>
        ))}
        {recentTransactions.map((transaction) => (
          <div 
            key={transaction.transactionId} 
            className="basis-[85%] sm:basis-[45%] lg:basis-[30%] shrink-0 snap-start"
          >
            <Card 
              className="border-none bg-muted/50 hover:bg-muted/80 transition-all cursor-pointer active:scale-[0.98] group py-0 gap-0"
              onClick={() => onTransactionClick?.(transaction)}
            >
              <CardContent className="p-3.5">
                <div className="flex justify-between items-start gap-2">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-semibold leading-tight truncate group-hover:text-primary transition-colors">
                        {transaction.what}
                      </p>
                      <TransactionIndicators transaction={transaction} />
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 font-normal bg-background/50 border-none">
                        {transaction.category}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                        {formatDistanceToNow(transaction.timestamp, { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold leading-none">
                      {transaction.amountOriginal.toLocaleString('pl-PL', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </p>
                    <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-tighter mt-1">
                      {transaction.currency}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        ))}
      </div>
    </div>
  )
}
