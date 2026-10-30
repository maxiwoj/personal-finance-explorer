'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/auth-context'
import { useSpreadsheet } from '@/contexts/spreadsheet-context'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { LayoutDashboard, PieChart, List, LogOut, Menu, X, RefreshCw, AlertTriangle, FlaskConical, BarChart3, FileSpreadsheet, CircleUser, Plus, Coins, WifiOff, Download, Repeat } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useReloadFinanceData, type FinanceDataScope } from '@/hooks/use-transactions'
import { ThemeToggle } from '@/components/theme-toggle'
import { applyUpdate, checkForUpdates, useUpdateStatus, type UpdateStatus } from '@/lib/app-update'
import { OutboxStatusBar, useSignOutWithWarning } from '@/components/outbox-status'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/categories', label: 'Categories', icon: PieChart },
  { href: '/yearly-summary', label: 'Yearly Summary', icon: BarChart3 },
  { href: '/transactions', label: 'Transactions', icon: List },
  { href: '/add', label: 'Add', icon: Plus },
]

function getReloadConfig(pathname: string, mode: 'google' | 'demo' | null): { scope: FinanceDataScope; idleLabel: string; loadingLabel: string } {
  if (mode === 'demo') {
    return {
      scope: 'all',
      idleLabel: 'Regenerate demo data',
      loadingLabel: 'Regenerating demo data...',
    }
  }

  if (pathname === '/dashboard') {
    return {
      scope: 'recent',
      idleLabel: 'Refresh recent data',
      loadingLabel: 'Refreshing recent data...',
    }
  }

  return {
    scope: 'full',
    idleLabel: 'Reload all data',
    loadingLabel: 'Reloading all data...',
  }
}

const UPDATE_MESSAGES: Record<Exclude<UpdateStatus, 'idle'>, string> = {
  checking: 'Checking for updates...',
  'up-to-date': 'Up to date',
  failed: "Couldn't check for updates",
  available: 'New version',
}

export function Nav() {
  const pathname = usePathname()
  const { isExpiring, isOffline, refreshSession, mode, email } = useAuth()
  const { requestSignOut, dialog: signOutDialog } = useSignOutWithWarning()
  const { spreadsheet, changeSpreadsheet } = useSpreadsheet()
  const reloadFinanceData = useReloadFinanceData()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [isReloading, setIsReloading] = useState(false)
  const updateStatus = useUpdateStatus()

  // /add is the app's launch page: prefetching the other pages there (the dashboard's charts
  // alone are ~1MB) would compete with the form's own loading
  const prefetch = pathname === '/add' ? false : undefined
  const activeMode = mode ?? 'google'
  const reloadConfig = useMemo(() => getReloadConfig(pathname, activeMode), [activeMode, pathname])

  const handleReload = async () => {
    setIsReloading(true)
    try {
      await reloadFinanceData(reloadConfig.scope)
    } finally {
      setIsReloading(false)
    }
  }

  const reloadLabel = isReloading ? reloadConfig.loadingLabel : reloadConfig.idleLabel

  const renderAccountMenu = (className: string) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className={className} title="Account" aria-label="Account">
          <CircleUser className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="font-normal">
          <div className="text-sm font-medium truncate">{mode === 'demo' ? 'Demo mode' : email ?? 'Signed in with Google'}</div>
          {mode === 'google' && spreadsheet?.name && (
            <div className="text-xs text-muted-foreground truncate">Spreadsheet: {spreadsheet.name}</div>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {mode === 'google' && (
          <DropdownMenuItem onSelect={() => void changeSpreadsheet()}>
            <FileSpreadsheet className="h-4 w-4" />
            Change spreadsheet
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild>
          <Link href="/currencies" prefetch={prefetch}>
            <Coins className="h-4 w-4" />
            Currencies
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/recurring" prefetch={prefetch}>
            <Repeat className="h-4 w-4" />
            Recurring payments
          </Link>
        </DropdownMenuItem>
        {/* An installed iOS app has no reload gesture */}
        <DropdownMenuItem onSelect={() => void checkForUpdates({ manual: true })}>
          <Download className="h-4 w-4" />
          Check for updates
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={requestSignOut}>
          <LogOut className="h-4 w-4" />
          Sign Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      {isExpiring && (
        <div className="bg-amber-500 text-white px-4 py-1 text-xs font-medium flex items-center justify-center gap-2 animate-in fade-in slide-in-from-top-1">
          <AlertTriangle className="h-3 w-3" />
          <span>Session expiring soon</span>
          <button onClick={refreshSession} className="underline underline-offset-2 hover:text-amber-100 flex items-center gap-1">
            <RefreshCw className="h-3 w-3" />
            Refresh
          </button>
        </div>
      )}
      {isOffline && (
        <div className="bg-muted text-muted-foreground px-4 py-1 text-xs font-medium flex items-center justify-center gap-2">
          <WifiOff className="h-3 w-3" />
          <span>Offline</span>
        </div>
      )}
      <OutboxStatusBar />
      {updateStatus !== 'idle' && (
        <div className="bg-muted text-muted-foreground px-4 py-1 text-xs font-medium flex items-center justify-center gap-2">
          <Download className="h-3 w-3" />
          <span>{UPDATE_MESSAGES[updateStatus]}</span>
          {updateStatus === 'available' && (
            <button onClick={applyUpdate} className="underline underline-offset-2 flex items-center gap-1">
              <RefreshCw className="h-3 w-3" />
              Reload
            </button>
          )}
        </div>
      )}
      <div className="container px-4 md:px-6 lg:px-8 mx-auto max-w-7xl flex h-14 items-center gap-2">
        <Link href="/dashboard" prefetch={prefetch} className="mr-6 flex items-center space-x-2">
          <span className="font-bold text-lg">Finance Explorer</span>
        </Link>

        <nav className="hidden md:flex flex-1 items-center space-x-1">
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={prefetch}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-colors',
                  pathname === item.href || pathname.startsWith(item.href + '/')
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            )
          })}
        </nav>

        {mode === 'demo' && (
          <div className="hidden md:flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs text-muted-foreground">
            <FlaskConical className="h-3.5 w-3.5" />
            Demo mode
          </div>
        )}

        <Button variant="outline" size="sm" onClick={() => void handleReload()} disabled={isReloading} className="hidden md:flex items-center gap-2" title={reloadLabel}>
          <RefreshCw className={cn('h-4 w-4', isReloading && 'animate-spin')} />
          <span className="hidden lg:inline">{reloadLabel}</span>
        </Button>

        {renderAccountMenu('hidden md:flex')}

        <ThemeToggle className="hidden md:inline-flex" />

        <ThemeToggle className="ml-auto md:hidden" />

        {renderAccountMenu('md:hidden')}

        <button className="md:hidden p-2" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
          {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {mobileMenuOpen && (
        <nav className="md:hidden border-t bg-background px-4 md:px-6 lg:px-8 mx-auto max-w-7xl py-4 space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={prefetch}
                onClick={() => setMobileMenuOpen(false)}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors',
                  pathname === item.href || pathname.startsWith(item.href + '/')
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            )
          })}
          <Button variant="outline" size="sm" onClick={() => void handleReload()} disabled={isReloading} className="w-full justify-start gap-3 px-3">
            <RefreshCw className={cn('h-4 w-4', isReloading && 'animate-spin')} />
            {reloadLabel}
          </Button>
        </nav>
      )}
      {signOutDialog}
    </header>
  )
}
