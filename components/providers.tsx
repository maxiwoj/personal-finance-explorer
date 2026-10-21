'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/contexts/auth-context'
import { FinanceDataProvider } from '@/contexts/data-provider-context'
import { SpreadsheetProvider } from '@/contexts/spreadsheet-context'
import { FilterProvider } from '@/contexts/filter-context'
import { useState, type ReactNode } from 'react'
import { ThemeProvider } from '@/components/theme-provider'

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      })
  )

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <SpreadsheetProvider>
            <FinanceDataProvider>
              <FilterProvider>{children}</FilterProvider>
            </FinanceDataProvider>
          </SpreadsheetProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  )
}
