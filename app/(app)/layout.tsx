'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/auth-context'
import { useSpreadsheet } from '@/contexts/spreadsheet-context'
import { Nav } from '@/components/nav'
import { Footer } from '@/components/footer'
import { SpreadsheetSetup } from '@/components/spreadsheet-setup'
import { Spinner } from '@/components/ui/spinner'

export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { isAuthenticated, isLoading, mode } = useAuth()
  const { spreadsheet, accessError } = useSpreadsheet()
  const router = useRouter()

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login')
    }
  }, [isAuthenticated, isLoading, router])

  if (isLoading || !isAuthenticated) {
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
    </div>
  )
}
