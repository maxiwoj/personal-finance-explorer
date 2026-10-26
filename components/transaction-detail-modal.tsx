'use client'

import { useState } from 'react'
import type { Transaction } from '@/lib/types'
import { getCategoryColor } from '@/lib/colors'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
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
import { useDeleteTransaction } from '@/hooks/use-transactions'
import { TransactionForm } from '@/components/transaction-form'
import { ReturnForm } from '@/components/return-form'
import { recordedAmount, returnableAmount } from '@/lib/returns'
import { Calendar, CreditCard, Tag, FileText, Clock, Hash, Pencil, StickyNote, Trash2, Undo2 } from 'lucide-react'

interface TransactionDetailModalProps {
  transaction: Transaction | null
  open: boolean
  onClose: () => void
}

function formatFullDateTime(date: Date): string {
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  })
}

function formatAmount(value: number) {
  return value.toLocaleString('pl-PL', { minimumFractionDigits: 2 })
}

export function TransactionDetailModal({ transaction, open, onClose }: TransactionDetailModalProps) {
  const [mode, setMode] = useState<'view' | 'edit' | 'return'>('view')
  // The transaction itself, or one of its returns, awaiting confirmation
  const [pendingDelete, setPendingDelete] = useState<Transaction | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const deleteTransaction = useDeleteTransaction()
  const isEditing = mode !== 'view'

  if (!transaction) return null

  const handleClose = () => {
    setMode('view')
    setPendingDelete(null)
    setDeleteError(null)
    onClose()
  }

  const isReturnDelete = pendingDelete !== null && pendingDelete !== transaction
  const blockedByReturns = pendingDelete === transaction && !!transaction.returns

  const handleDelete = async () => {
    if (!pendingDelete) return
    setIsDeleting(true)
    setDeleteError(null)
    try {
      await deleteTransaction(pendingDelete)
      handleClose()
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Failed to delete the transaction.')
      setPendingDelete(null)
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className={cn(isEditing ? 'sm:max-w-lg max-h-[90vh] overflow-y-auto' : 'sm:max-w-sm overflow-hidden', 'p-0 border-none shadow-2xl')}>
        <DialogHeader className="p-4 pb-2 border-b bg-muted/30">
          <DialogTitle className="text-lg font-bold flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-primary" />
            {mode === 'edit' ? 'Edit Transaction' : mode === 'return' ? 'Record Return' : 'Transaction Details'}
          </DialogTitle>
        </DialogHeader>

        {mode === 'edit' ? (
          <div className="p-4">
            <TransactionForm original={transaction} onSaved={() => handleClose()} onCancel={() => setMode('view')} />
          </div>
        ) : mode === 'return' ? (
          <div className="p-4">
            <ReturnForm purchase={transaction} onSaved={() => handleClose()} onCancel={() => setMode('view')} />
          </div>
        ) : (
        <div className="p-4 space-y-4">
          {/* Main Info: Amount & Description */}
          <div className="text-center space-y-1 pb-2 border-b border-dashed">
            <p className="text-3xl font-black tracking-tight">
              {transaction.amountPLN.toLocaleString('pl-PL', { minimumFractionDigits: 2 })}
              <span className="text-sm font-bold text-muted-foreground ml-1 uppercase">PLN</span>
            </p>
            <p className="text-base font-semibold text-foreground leading-tight">
              {transaction.what}
            </p>
            {transaction.currency !== 'PLN' && (
              <p className="text-xs font-medium text-muted-foreground bg-muted w-fit mx-auto px-2 py-0.5 rounded-full">
                Original: {transaction.amountOriginal.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} {transaction.currency}
              </p>
            )}
            {transaction.returnOf && (
              <p className="text-xs font-medium text-muted-foreground">
                Return of a purchase outside the loaded transactions
              </p>
            )}
          </div>

          {transaction.returns && (
            <div className="space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <Undo2 className="h-3 w-3" /> Returns
              </p>
              <div className="text-xs space-y-0.5">
                <div className="flex justify-between">
                  <span>Purchase</span>
                  <span className="font-semibold">{formatAmount(recordedAmount(transaction).amountOriginal)} {transaction.currency}</span>
                </div>
                {transaction.returns.map(r => (
                  <div key={r.transactionId} className="flex items-center justify-between gap-2 text-muted-foreground">
                    <span>Returned {formatDate(r.timestamp)}</span>
                    <span className="flex items-center gap-1">
                      <span className="font-semibold">{formatAmount(r.amountOriginal)} {r.currency}</span>
                      <button
                        type="button"
                        className="rounded p-0.5 hover:bg-muted hover:text-destructive"
                        aria-label="Remove this return"
                        onClick={() => setPendingDelete(r)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Details Grid */}
          <div className="grid grid-cols-2 gap-4 pt-1">
            <div className="space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <Tag className="h-3 w-3" /> Category
              </p>
              <span
                className="inline-block px-2 py-0.5 text-xs font-bold rounded-md text-white shadow-sm"
                style={{ backgroundColor: getCategoryColor(transaction.category) }}
              >
                {transaction.category}
              </span>
            </div>

            <div className="space-y-1 text-right">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1 justify-end">
                <Calendar className="h-3 w-3" /> Date
              </p>
              <p className="text-xs font-semibold">{formatDate(transaction.timestamp)}</p>
            </div>

            <div className="space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" /> Time
              </p>
              <p className="text-xs font-mono font-medium">{formatFullDateTime(transaction.timestamp).split(',')[1]}</p>
            </div>

            <div className="space-y-1 text-right">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1 justify-end">
                <Hash className="h-3 w-3" /> ID
              </p>
              <p className="text-[10px] font-mono text-muted-foreground truncate" title={transaction.transactionId}>
                {transaction.transactionId.split('-').pop()}
              </p>
            </div>
          </div>

          {transaction.notes && (
            <div className="space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <StickyNote className="h-3 w-3" /> Notes
              </p>
              <p className="text-xs whitespace-pre-wrap break-words">{transaction.notes}</p>
            </div>
          )}

          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1 gap-2" onClick={() => setMode('edit')}>
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </Button>
            {returnableAmount(transaction) > 0 && (
              <Button variant="outline" size="sm" className="flex-1 gap-2" onClick={() => setMode('return')}>
                <Undo2 className="h-3.5 w-3.5" />
                Return
              </Button>
            )}
            <Button variant="outline" size="sm" className="gap-2 text-destructive hover:text-destructive" onClick={() => setPendingDelete(transaction)} aria-label="Delete">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>

          {deleteError && <p className="text-xs text-destructive">{deleteError}</p>}

          <AlertDialog open={pendingDelete !== null} onOpenChange={(open) => { if (!open && !isDeleting) setPendingDelete(null) }}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {blockedByReturns ? 'Remove the returns first' : isReturnDelete ? 'Remove this return?' : 'Delete this transaction?'}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {blockedByReturns
                    ? 'This purchase has returns. Remove them from its details before deleting it.'
                    : isReturnDelete
                      ? `The return of ${formatAmount(Math.abs(pendingDelete.amountOriginal))} ${pendingDelete.currency} is deleted from the spreadsheet, and that amount counts towards the purchase again.`
                      : 'Its row is deleted from the spreadsheet. This cannot be undone from the app.'}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isDeleting}>{blockedByReturns ? 'OK' : 'Cancel'}</AlertDialogCancel>
                {!blockedByReturns && (
                  <AlertDialogAction
                    disabled={isDeleting}
                    className="bg-destructive text-white hover:bg-destructive/90"
                    onClick={(event) => {
                      // Keep the dialog open until the delete finishes
                      event.preventDefault()
                      void handleDelete()
                    }}
                  >
                    {isDeleting ? 'Deleting...' : isReturnDelete ? 'Remove return' : 'Delete'}
                  </AlertDialogAction>
                )}
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
