'use client'

import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useAuth } from '@/contexts/auth-context'
import { useSpreadsheet } from '@/contexts/spreadsheet-context'
import { clearCache, clearFullTransactionsCache, clearRecentTransactionsCache, getCachedFullTransactions, getCachedRecentTransactions, setCachedFullTransactions, setCachedRecentTransactions } from '@/lib/cache'
import { addDemoTransaction, deleteDemoTransaction, demoModeMessage, getDemoCurrencies, getDemoRatesStart, getOrCreateDemoTransactions, updateDemoTransaction } from '@/lib/demo-data'
import { addCurrency, appendCategory, appendTransaction, changeDefaultCurrency, createCategoriesSheet, deleteTransaction, describeSpreadsheetAccessError, fetchCategories, fetchCategoriesAndRecent, fetchCurrencies, extendRates, fetchFullTransactions, fetchRatesStart, fetchRecentTransactions, removeCurrency, revertRates, setCategoryHidden, SheetsApiError, updateCurrencyMultiplier, updateTransaction } from '@/lib/sheets'
import type { FinanceDataScope } from '@/hooks/use-transactions'
import type { ExtendResult, RatesStart, StartDate } from '@/lib/currencies'
import type { CategoryDefinition, CurrencyDefinition, CurrencyList, Transaction, TransactionInput } from '@/lib/types'

export type DataMode = 'google' | 'demo'

export interface FinanceDataProvider {
  mode: DataMode
  // Part of query keys so switching spreadsheets never serves another sheet's data
  sourceId: string | null
  getRecentTransactions: () => Promise<Transaction[]>
  getFullTransactions: () => Promise<Transaction[]>
  reloadData: (scope?: FinanceDataScope) => Promise<void>
  addTransaction: (input: TransactionInput) => Promise<void>
  updateTransaction: (original: Transaction, input: TransactionInput) => Promise<void>
  deleteTransaction: (original: Transaction) => Promise<void>
  // null when the source has no category list (no categories tab, or demo mode)
  getCategories: () => Promise<CategoryDefinition[] | null>
  // Both in one request, for the first load; recentTransactions is null when it has to be fetched on its own
  getCategoriesAndRecent: () => Promise<{ categories: CategoryDefinition[] | null; recentTransactions: Transaction[] | null }>
  createCategoryList: (categories: CategoryDefinition[]) => Promise<void>
  addCategory: (name: string) => Promise<void>
  // Hides or shows a category on the Add page; showing one not in the list adds it
  setCategoryHidden: (name: string, hidden: boolean) => Promise<void>
  // null when the source has no currencyDates tab
  getCurrencies: () => Promise<CurrencyList | null>
  // Without a multiplier, a standard currency converted with GOOGLEFINANCE
  addCurrency: (input: { code: string; multiplier?: number }) => Promise<void>
  updateCurrencyMultiplier: (currency: CurrencyDefinition, multiplier: number) => Promise<void>
  removeCurrency: (currency: CurrencyDefinition) => Promise<void>
  // Swaps B1 with a standard currency's code
  changeDefaultCurrency: (code: string) => Promise<void>
  // The rates' first day and the earliest transaction's; null without a currencyDates tab
  getRatesStart: () => Promise<RatesStart | null>
  // Moves the start of every currency formula back to newStart, the earliest transaction's day,
  // and reports the currencies Google Finance then has no rates for
  extendRates: (newStart: StartDate) => Promise<ExtendResult>
  // Undoes extendRates, while the formulas still start on extendedStart
  revertRates: (extendedStart: StartDate, previousStart: StartDate) => Promise<void>
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
  // Writes skip the post-pick retry and access-error reporting: a 403 on write usually means
  // view-only access, which must not bounce the user back to spreadsheet setup
  const fetchWithRefresh = async <T,>(
    currentToken: string | null,
    fetcher: (token: string, spreadsheetId: string) => Promise<T>,
    { isWrite = false } = {}
  ): Promise<T> => {
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
          if (isWrite || !isMissingAccess(error) || !withinGracePeriod) throw error
          await sleep(delay)
        }
      }
      return fetcher(token, spreadsheetId)
    }

    try {
      return await fetchWithPickRetry(currentToken)
    } catch (error) {
      const accessError = isWrite ? null : describeSpreadsheetAccessError(error)
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
    async addTransaction(input) {
      await fetchWithRefresh(accessToken, (token, id) => appendTransaction(token, id, input), { isWrite: true })
    },
    async updateTransaction(original, input) {
      await fetchWithRefresh(accessToken, (token, id) => updateTransaction(token, id, original, input), { isWrite: true })
    },
    async deleteTransaction(original) {
      await fetchWithRefresh(accessToken, (token, id) => deleteTransaction(token, id, original), { isWrite: true })
    },
    async getCategories() {
      return fetchWithRefresh(accessToken, fetchCategories)
    },
    async getCategoriesAndRecent() {
      const result = await fetchWithRefresh(accessToken, fetchCategoriesAndRecent)
      if (result.recentTransactions) await setCachedRecentTransactions(result.recentTransactions)
      return result
    },
    async createCategoryList(categories) {
      await fetchWithRefresh(accessToken, (token, id) => createCategoriesSheet(token, id, categories), { isWrite: true })
    },
    async addCategory(name) {
      await fetchWithRefresh(accessToken, (token, id) => appendCategory(token, id, name), { isWrite: true })
    },
    async setCategoryHidden(name, hidden) {
      await fetchWithRefresh(accessToken, (token, id) => setCategoryHidden(token, id, name, hidden), { isWrite: true })
    },
    async getCurrencies() {
      return fetchWithRefresh(accessToken, fetchCurrencies)
    },
    async addCurrency(input) {
      await fetchWithRefresh(accessToken, (token, id) => addCurrency(token, id, input), { isWrite: true })
    },
    async updateCurrencyMultiplier(currency, multiplier) {
      await fetchWithRefresh(accessToken, (token, id) => updateCurrencyMultiplier(token, id, currency, multiplier), { isWrite: true })
    },
    async removeCurrency(currency) {
      await fetchWithRefresh(accessToken, (token, id) => removeCurrency(token, id, currency), { isWrite: true })
    },
    async changeDefaultCurrency(code) {
      await fetchWithRefresh(accessToken, (token, id) => changeDefaultCurrency(token, id, code), { isWrite: true })
    },
    async getRatesStart() {
      return fetchWithRefresh(accessToken, fetchRatesStart)
    },
    async extendRates(newStart) {
      return fetchWithRefresh(accessToken, (token, id) => extendRates(token, id, newStart), { isWrite: true })
    },
    async revertRates(extendedStart, previousStart) {
      await fetchWithRefresh(accessToken, (token, id) => revertRates(token, id, extendedStart, previousStart), { isWrite: true })
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
    addTransaction: addDemoTransaction,
    updateTransaction: updateDemoTransaction,
    deleteTransaction: deleteDemoTransaction,
    async getCategories() {
      return null
    },
    // Demo data is local, so there is no round trip to save
    async getCategoriesAndRecent() {
      return { categories: null, recentTransactions: null }
    },
    async createCategoryList() {
      throw new Error(demoModeMessage('Managing categories'))
    },
    async addCategory() {},
    async setCategoryHidden() {
      throw new Error(demoModeMessage('Managing categories'))
    },
    async getCurrencies() {
      return getDemoCurrencies()
    },
    async addCurrency() {
      throw new Error(demoModeMessage('Adding a currency'))
    },
    async updateCurrencyMultiplier() {
      throw new Error(demoModeMessage('Changing a multiplier'))
    },
    async removeCurrency() {
      throw new Error(demoModeMessage('Removing a currency'))
    },
    async changeDefaultCurrency() {
      throw new Error(demoModeMessage('Changing the default currency'))
    },
    getRatesStart: getDemoRatesStart,
    async extendRates() {
      throw new Error(demoModeMessage('Extending the rates'))
    },
    async revertRates() {
      throw new Error(demoModeMessage('Reverting the rates'))
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
