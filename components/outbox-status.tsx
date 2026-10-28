'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/contexts/auth-context'
import { useOnline, useOutboxEntries } from '@/hooks/use-outbox-sync'
import { requestOutboxSync, retryOutboxEntries } from '@/lib/outbox'
import { isStalled } from '@/lib/outbox-view'
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
import { CloudAlert, CloudOff, List, RefreshCw } from 'lucide-react'

function transactionCount(count: number) {
  return `${count} ${count === 1 ? 'transaction' : 'transactions'}`
}

// A bar under the nav while saved transactions wait to sync: offline, after a failed attempt, or
// failed for good. Shows nothing while a new one syncs right away.
export function OutboxStatusBar() {
  const entries = useOutboxEntries()
  const online = useOnline()

  if (!entries.some((entry) => isStalled(entry, online))) return null

  const failed = entries.filter((entry) => entry.status === 'failed')
  const syncing = entries.some((entry) => entry.status === 'syncing')

  return (
    <div className="bg-muted text-muted-foreground px-4 py-1 text-xs font-medium flex items-center justify-center gap-2">
      {failed.length > 0 ? (
        <>
          <CloudAlert className="h-3 w-3" />
          <span>{transactionCount(failed.length)} failed to sync</span>
          <button onClick={() => void retryOutboxEntries(failed.map((entry) => entry.id))} className="underline underline-offset-2 flex items-center gap-1">
            <RefreshCw className="h-3 w-3" />
            Retry
          </button>
          <Link href="/transactions" className="underline underline-offset-2 flex items-center gap-1">
            <List className="h-3 w-3" />
            View
          </Link>
        </>
      ) : syncing ? (
        <>
          <RefreshCw className="h-3 w-3 animate-spin" />
          <span>Syncing {transactionCount(entries.length)}...</span>
        </>
      ) : (
        <>
          <CloudOff className="h-3 w-3" />
          <span>{transactionCount(entries.length)} not synced</span>
          {online && (
            <button onClick={requestOutboxSync} className="underline underline-offset-2 flex items-center gap-1">
              <RefreshCw className="h-3 w-3" />
              Sync now
            </button>
          )}
        </>
      )}
    </div>
  )
}

// Signs out at once, or first warns that saved transactions haven't synced. They're kept per user
// and spreadsheet, so signing back in continues the sync.
export function useSignOutWithWarning() {
  const { signOut } = useAuth()
  const entries = useOutboxEntries()
  const [confirming, setConfirming] = useState(false)

  const requestSignOut = () => {
    if (entries.length === 0) {
      void signOut()
    } else {
      setConfirming(true)
    }
  }

  const dialog = (
    <AlertDialog open={confirming} onOpenChange={setConfirming}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{transactionCount(entries.length)} not synced yet</AlertDialogTitle>
          <AlertDialogDescription>
            They are not in the spreadsheet yet. They stay on this device and sync when you sign back in with the same account and spreadsheet.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => void signOut()}>Sign out</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )

  return { requestSignOut, dialog }
}
