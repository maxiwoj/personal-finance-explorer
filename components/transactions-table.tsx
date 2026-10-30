'use client'

import { useEffect, useMemo, useState } from 'react'
import type { Transaction } from '@/lib/types'
import { getCategoryColor } from '@/lib/colors'
import { TransactionDetailModal } from './transaction-detail-modal'
import { TransactionIndicators } from './transaction-indicators'
import { DraftBadge, RecurringDraftDialog } from './recurring-drafts'
import { draftLink, type RecurringDraft } from '@/lib/recurring'
import { useDefaultCurrency } from '@/hooks/use-transactions'
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface TransactionsTableProps {
  transactions: Transaction[]
  showCategory?: boolean
  limit?: number
  sortBy?: 'date' | 'amount'
  // Due recurring payments, listed first on the first page and marked as drafts to approve
  drafts?: RecurringDraft[]
}

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const

function formatDateOnly(date: Date): string {
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  })
}

function buildPageNumbers(currentPage: number, totalPages: number): number[] {
  if (totalPages <= 5) {
    return Array.from({ length: totalPages }, (_, index) => index + 1)
  }

  if (currentPage <= 3) {
    return [1, 2, 3, 4, 5]
  }

  if (currentPage >= totalPages - 2) {
    return Array.from({ length: 5 }, (_, index) => totalPages - 4 + index)
  }

  return Array.from({ length: 5 }, (_, index) => currentPage - 2 + index)
}

export function TransactionsTable({ transactions, showCategory = true, limit, sortBy = 'date', drafts = [] }: TransactionsTableProps) {
  const defaultCurrency = useDefaultCurrency()
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null)
  const [selectedDraft, setSelectedDraft] = useState<RecurringDraft | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(limit ?? 20)

  const sorted = useMemo(
    () => [...transactions].sort((a, b) =>
      sortBy === 'amount' ? b.amountPLN - a.amountPLN : b.timestamp.getTime() - a.timestamp.getTime()
    ),
    [transactions, sortBy]
  )

  const availablePageSizes = useMemo(() => {
    const sizes = new Set<number>(PAGE_SIZE_OPTIONS)

    if (limit) {
      sizes.add(limit)
    }

    if (sorted.length > 0) {
      sizes.add(sorted.length)
    }

    return Array.from(sizes).sort((a, b) => a - b)
  }, [limit, sorted.length])

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const currentPageSafe = Math.min(currentPage, totalPages)
  const startIndex = (currentPageSafe - 1) * pageSize
  const displayed = sorted.slice(startIndex, startIndex + pageSize)
  const pageNumbers = buildPageNumbers(currentPageSafe, totalPages)
  const displayedDrafts = currentPageSafe === 1 ? drafts : []

  useEffect(() => {
    setPageSize(limit ?? 20)
  }, [limit])

  useEffect(() => {
    setCurrentPage(1)
  }, [transactions])

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [currentPage, totalPages])

  const fromCount = sorted.length === 0 ? 0 : startIndex + 1
  const toCount = Math.min(startIndex + pageSize, sorted.length)

  return (
    <>
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {fromCount}-{toCount} of {sorted.length} transactions
          </p>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <span className="text-sm text-muted-foreground">Rows per page</span>
            <Select
              value={String(pageSize)}
              onValueChange={(value) => {
                setPageSize(Number(value))
                setCurrentPage(1)
              }}
            >
              <SelectTrigger className="w-[88px]" aria-label="Select rows per page">
                <SelectValue placeholder="Rows" />
              </SelectTrigger>
              <SelectContent>
                {availablePageSizes.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="overflow-hidden">
          <table className="hidden w-full text-sm md:table">
            <thead>
              <tr className="border-b text-left">
                <th className="pb-3 font-medium text-muted-foreground">Date</th>
                <th className="pb-3 font-medium text-muted-foreground">Description</th>
                {showCategory && (
                  <th className="pb-3 font-medium text-muted-foreground">Category</th>
                )}
                <th className="pb-3 font-medium text-muted-foreground text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {displayedDrafts.map((draft) => (
                <tr
                  key={draftLink(draft)}
                  className="border-b border-dashed bg-primary/5 hover:bg-primary/10 cursor-pointer transition-colors"
                  onClick={() => setSelectedDraft(draft)}
                >
                  <td className="py-3 text-muted-foreground whitespace-nowrap">
                    {formatDateOnly(new Date(draft.date.year, draft.date.month - 1, draft.date.day))}
                  </td>
                  <td className="py-3 max-w-[200px]" title={draft.payment.what}>
                    <div className="flex items-center gap-1.5">
                      <span className="truncate">{draft.payment.what}</span>
                      <DraftBadge className="shrink-0" />
                    </div>
                  </td>
                  {showCategory && (
                    <td className="py-3">
                      <span
                        className="inline-block px-2 py-1 text-xs rounded-full text-white"
                        style={{ backgroundColor: getCategoryColor(draft.payment.category) }}
                      >
                        {draft.payment.category}
                      </span>
                    </td>
                  )}
                  <td className="py-3 text-right whitespace-nowrap font-bold">
                    {draft.payment.amount.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} {draft.payment.currency}
                  </td>
                </tr>
              ))}
              {displayed.map((t, index) => (
                <tr
                  key={`${t.transactionId}-${startIndex + index}`}
                  className="border-b last:border-0 hover:bg-muted/50 cursor-pointer transition-colors"
                  onClick={() => setSelectedTransaction(t)}
                >
                  <td className="py-3 text-muted-foreground whitespace-nowrap">
                    {formatDateOnly(t.timestamp)}
                  </td>
                  <td className="py-3 max-w-[200px]" title={t.what}>
                    <div className="flex items-center gap-1.5">
                      <span className="truncate">{t.what}</span>
                      <TransactionIndicators transaction={t} />
                    </div>
                  </td>
                  {showCategory && (
                    <td className="py-3">
                      <span
                        className="inline-block px-2 py-1 text-xs rounded-full text-white"
                        style={{ backgroundColor: getCategoryColor(t.category) }}
                      >
                        {t.category}
                      </span>
                    </td>
                  )}
                  <td className="py-3 text-right whitespace-nowrap">
                    <div className="font-bold">
                      {t.amountPLN.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} {defaultCurrency}
                    </div>
                    {t.currency !== defaultCurrency && (
                      <div className="text-[10px] text-muted-foreground font-medium uppercase">
                        {t.amountOriginal.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} {t.currency}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="space-y-3 md:hidden">
            {displayedDrafts.map((draft) => (
              <button
                key={draftLink(draft)}
                type="button"
                className="w-full rounded-lg border border-dashed border-primary/60 bg-primary/5 p-4 text-left transition-colors hover:bg-primary/10"
                onClick={() => setSelectedDraft(draft)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {formatDateOnly(new Date(draft.date.year, draft.date.month - 1, draft.date.day))}
                    </div>
                    <div className="break-words text-sm font-medium text-foreground leading-tight">
                      {draft.payment.what}
                      <DraftBadge className="ml-1.5 align-middle" />
                    </div>
                    {showCategory && (
                      <span
                        className="inline-flex max-w-full rounded-full px-2 py-0.5 text-[10px] font-bold text-white shadow-sm"
                        style={{ backgroundColor: getCategoryColor(draft.payment.category) }}
                      >
                        <span className="truncate">{draft.payment.category}</span>
                      </span>
                    )}
                  </div>
                  <div className="shrink-0 text-right text-sm font-bold whitespace-nowrap">
                    {draft.payment.amount.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} {draft.payment.currency}
                  </div>
                </div>
              </button>
            ))}
            {displayed.map((t, index) => (
              <button
                key={`${t.transactionId}-${startIndex + index}`}
                type="button"
                className="w-full rounded-lg border p-4 text-left transition-colors hover:bg-muted/50"
                onClick={() => setSelectedTransaction(t)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {formatDateOnly(t.timestamp)}
                    </div>
                    <div className="break-words text-sm font-medium text-foreground leading-tight">
                      {t.what}
                      <TransactionIndicators transaction={t} className="ml-1.5 inline-flex align-middle" />
                    </div>
                    {showCategory && (
                      <span
                        className="inline-flex max-w-full rounded-full px-2 py-0.5 text-[10px] font-bold text-white shadow-sm"
                        style={{ backgroundColor: getCategoryColor(t.category) }}
                      >
                        <span className="truncate">{t.category}</span>
                      </span>
                    )}
                  </div>
                  <div className="shrink-0 text-right space-y-0.5">
                    <div className="text-sm font-bold whitespace-nowrap">
                      {t.amountPLN.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} {defaultCurrency}
                    </div>
                    {t.currency !== defaultCurrency && (
                      <div className="text-[10px] text-muted-foreground font-medium uppercase whitespace-nowrap">
                        {t.amountOriginal.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} {t.currency}
                      </div>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>

          {displayed.length === 0 && displayedDrafts.length === 0 && (
            <p className="py-8 text-center text-muted-foreground">No transactions found</p>
          )}
        </div>

        {sorted.length > 0 && (
          <Pagination className="justify-end">
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  href="#"
                  onClick={(event) => {
                    event.preventDefault()
                    if (currentPageSafe > 1) {
                      setCurrentPage(currentPageSafe - 1)
                    }
                  }}
                  aria-disabled={currentPageSafe === 1}
                  className={currentPageSafe === 1 ? 'pointer-events-none opacity-50' : undefined}
                />
              </PaginationItem>
              {pageNumbers.map((pageNumber) => (
                <PaginationItem key={pageNumber}>
                  <PaginationLink
                    href="#"
                    isActive={pageNumber === currentPageSafe}
                    onClick={(event) => {
                      event.preventDefault()
                      setCurrentPage(pageNumber)
                    }}
                  >
                    {pageNumber}
                  </PaginationLink>
                </PaginationItem>
              ))}
              <PaginationItem>
                <PaginationNext
                  href="#"
                  onClick={(event) => {
                    event.preventDefault()
                    if (currentPageSafe < totalPages) {
                      setCurrentPage(currentPageSafe + 1)
                    }
                  }}
                  aria-disabled={currentPageSafe === totalPages}
                  className={currentPageSafe === totalPages ? 'pointer-events-none opacity-50' : undefined}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        )}
      </div>

      <RecurringDraftDialog draft={selectedDraft} onClose={() => setSelectedDraft(null)} />

      <TransactionDetailModal
        transaction={selectedTransaction}
        open={selectedTransaction !== null}
        onClose={() => setSelectedTransaction(null)}
      />
    </>
  )
}
