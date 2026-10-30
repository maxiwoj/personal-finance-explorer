'use client'

import { useEffect, useMemo } from 'react'
import { useIsRestoring } from '@tanstack/react-query'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/auth-context'
import { useSpreadsheet } from '@/contexts/spreadsheet-context'
import { Nav } from '@/components/nav'
import { Footer } from '@/components/footer'
import { SpreadsheetSetup } from '@/components/spreadsheet-setup'
import { Spinner } from '@/components/ui/spinner'
import { useCategories, useCurrencies } from '@/hooks/use-transactions'
import { setCategoryPalette } from '@/lib/colors'
import { Plus } from 'lucide-react'

export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { isAuthenticated, isLoading, isOffline, mode } = useAuth()
  const { spreadsheet, accessError } = useSpreadsheet()
  const router = useRouter()
  const pathname = usePathname()
  const isRestoring = useIsRestoring()
  // At startup the stored Google session is refreshed in the background; the app shows cached
  // data meanwhile, and its requests wait for the refresh
  const hasSession = isAuthenticated || (isLoading && mode === 'google')
  const hasSource = hasSession && (mode === 'demo' || (!!spreadsheet && !accessError))
  const categories = useCategories(hasSource)
  // Started together with categories instead of after the page mounts; not waited for here
  useCurrencies(hasSource)

  // Seeded before pages render so every chart, table and chip uses the same fixed colors
  useMemo(() => {
    if (categories.data) setCategoryPalette(categories.data)
  }, [categories.data])

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login')
    }
  }, [isAuthenticated, isLoading, router])

  // Offline there's no token, so categories fail at once; waiting on them would remount the page into a refetch loop.
  // With cached categories, categories.isLoading is false and nothing waits on the network.
  if (!hasSession || (isLoading && !hasSource) || isRestoring || (hasSource && !isOffline && categories.isLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  if (mode === 'google' && (!spreadsheet || accessError)) {
    return <SpreadsheetSetup />
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Nav />
      <main className="flex-1 container px-4 md:px-6 lg:px-8 py-6 mx-auto max-w-7xl overflow-x-hidden">
        {children}
      </main>
      <Footer />
      {pathname !== '/add' && (
        <Link
          href="/add"
          aria-label="Add transaction"
          className="md:hidden fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg"
        >
          <Plus className="h-6 w-6" />
        </Link>
      )}
    </div>
  )
}
