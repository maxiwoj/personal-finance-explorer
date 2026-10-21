'use client'

import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useAuth } from '@/contexts/auth-context'
import { useSpreadsheet } from '@/contexts/spreadsheet-context'
import { clearCache, clearFullTransactionsCache, clearRecentTransactionsCache, getCachedFullTransactions, getCachedRecentTransactions, setCachedFullTransactions, setCachedRecentTransactions } from '@/lib/cache'
import { getOrCreateDemoTransactions } from '@/lib/demo-data'
import { describeSpreadsheetAccessError, fetchFullTransactions, fetchRecentTransactions, SheetsApiError } from '@/lib/sheets'
import type { FinanceDataScope } from '@/hooks/use-transactions'
import type { Transaction } from '@/lib/types'

export type DataMode = 'google' | 'demo'

export interface FinanceDataProvider {
  mode: DataMode
  // Part of query keys so switching spreadsheets never serves another sheet's data
  sourceId: string | null
  getRecentTransactions: () => Promise<Transaction[]>
  getFullTransactions: () => Promise<Transaction[]>
  reloadData: (scope?: FinanceDataScope) => Promise<void>
}

const DataProviderContext = createContext<FinanceDataProvider | null>(null)

// Google grants drive.file access to a picked file asynchronously; for a freshly copied file the
// first reads can return 403/404 for a few seconds. Retry those right after a pick.
const PICK_GRACE_PERIOD_MS = 30_000
const PICK_RETRY_DELAYS_MS = [1000, 2000, 3000, 4000, 5000]

function isMissingAccess(error: unknown) {
  return error instanceof SheetsApiError && (error.status === 403 || error.status === 404)
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function buildGoogleProvider(
  accessToken: string | null,
  spreadsheetId: string | null,
  pickedAt: number | null,
  refreshSession: () => Promise<boolean>,
  reportAccessError: (message: string) => void
): FinanceDataProvider {
  const fetchWithRefresh = async (
    currentToken: string | null,
    fetcher: (token: string, spreadsheetId: string) => Promise<Transaction[]>
  ) => {
    if (!currentToken) {
      throw new Error('Not authenticated')
    }

    if (!spreadsheetId) {
      throw new Error('No spreadsheet selected')
    }

    const fetchWithPickRetry = async (token: string) => {
      for (const delay of PICK_RETRY_DELAYS_MS) {
        try {
          return await fetcher(token, spreadsheetId)
        } catch (error) {
          const withinGracePeriod = pickedAt !== null && Date.now() - pickedAt < PICK_GRACE_PERIOD_MS
          if (!isMissingAccess(error) || !withinGracePeriod) throw error
          await sleep(delay)
        }
      }
      return fetcher(token, spreadsheetId)
    }

    try {
      return await fetchWithPickRetry(currentToken)
    } catch (error) {
      const accessError = describeSpreadsheetAccessError(error)
      if (accessError) {
        reportAccessError(accessError)
        throw new Error(accessError)
      }

      if (!(error instanceof SheetsApiError) || error.status !== 401) {
        throw error
      }

      const refreshed = await refreshSession()
      if (!refreshed) {
        throw new Error('Session expired')
      }

      const nextToken = localStorage.getItem('pfe_access_token')
      if (!nextToken) {
        throw new Error('Not authenticated')
      }

      return fetcher(nextToken, spreadsheetId)
    }
  }

  return {
    mode: 'google',
    sourceId: spreadsheetId,
    async getRecentTransactions() {
      const cached = await getCachedRecentTransactions()

      if (!accessToken) {
        if (cached) return cached
        throw new Error('Not authenticated')
      }

      const fresh = await fetchWithRefresh(accessToken, fetchRecentTransactions)
      await setCachedRecentTransactions(fresh)
      return fresh
    },
    async getFullTransactions() {
      const cached = await getCachedFullTransactions()

      if (!accessToken) {
        if (cached) return cached
        throw new Error('Not authenticated')
      }

      const fresh = await fetchWithRefresh(accessToken, fetchFullTransactions)
      await setCachedFullTransactions(fresh)
      return fresh
    },
    async reloadData(scope = 'all') {
      if (scope === 'recent') {
        await clearRecentTransactionsCache()
        return
      }

      if (scope === 'full') {
        await clearFullTransactionsCache()
        return
      }

      await clearCache()
    },
  }
}

function buildDemoProvider(): FinanceDataProvider {
  const loadTransactions = async () => getOrCreateDemoTransactions()

  return {
    mode: 'demo',
    sourceId: null,
    async getRecentTransactions() {
      const allTransactions = await loadTransactions()
      return allTransactions.slice(0, 90)
    },
    async getFullTransactions() {
      return loadTransactions()
    },
    async reloadData() {
      await getOrCreateDemoTransactions(true)
    },
  }
}

export function FinanceDataProvider({ children }: { children: ReactNode }) {
  const { mode, accessToken, refreshSession } = useAuth()
  const { spreadsheet, reportAccessError } = useSpreadsheet()
  const spreadsheetId = spreadsheet?.id ?? null
  const pickedAt = spreadsheet?.pickedAt ?? null

  const provider = useMemo(() => {
    if (mode === 'demo') {
      return buildDemoProvider()
    }

    return buildGoogleProvider(accessToken, spreadsheetId, pickedAt, refreshSession, reportAccessError)
  }, [accessToken, mode, pickedAt, refreshSession, reportAccessError, spreadsheetId])

  return <DataProviderContext.Provider value={provider}>{children}</DataProviderContext.Provider>
}

export function useFinanceDataProvider() {
  const context = useContext(DataProviderContext)

  if (!context) {
    throw new Error('useFinanceDataProvider must be used within a FinanceDataProvider')
  }

  return context
}
