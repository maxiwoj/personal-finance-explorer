'use client'

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { IsRestoringProvider, useQueryClient, type Query } from '@tanstack/react-query'
import { persistQueryClientRestore, persistQueryClientSubscribe } from '@tanstack/react-query-persist-client'
import { useAuth } from '@/contexts/auth-context'
import { useSpreadsheet } from '@/contexts/spreadsheet-context'
import { createQueryPersister } from '@/lib/cache'
import { PERSIST_BUSTER, PERSIST_MAX_AGE_MS, persistScopeKey, shouldPersistQuery } from '@/lib/query-persistence'
import { addDemoTransaction, deleteDemoTransaction, demoModeMessage, getDemoCurrencies, getDemoRatesStart, getOrCreateDemoTransactions, updateDemoTransaction } from '@/lib/demo-data'
import { addCurrency, addRecurringPayment, linkTransactionToRecurring, appendCategory, approveRecurringDraft, deleteRecurringPayment, fetchRecurringPayments, skipRecurringDraft, updateRecurringPayment, appendTransaction, changeDefaultCurrency, createCategoriesSheet, deleteTransaction, describeSpreadsheetAccessError, fetchCategories, fetchCategoriesAndRecent, fetchCurrencies, extendRates, fetchFullTransactions, fetchRatesStart, fetchRecentTransactions, hasStoredIds, removeCurrency, revertRates, setCategoryHidden, SheetsApiError, updateCurrencyMultiplier, updateTransaction } from '@/lib/sheets'
import { enqueueTransaction, getKnownStoredIds, requestOutboxSync, setKnownStoredIds } from '@/lib/outbox'
import { classifySyncError } from '@/lib/outbox-sync'
import { useOutboxSync, useTrackSyncedOutboxEntries } from '@/hooks/use-outbox-sync'
import type { FinanceDataScope } from '@/hooks/use-transactions'
import type { ExtendResult, RatesStart, StartDate } from '@/lib/currencies'
import type { RecurringDraft, RecurringPayment, RecurringPaymentInput } from '@/lib/recurring'
import type { CategoryDefinition, CurrencyDefinition, CurrencyList, Transaction, TransactionInput } from '@/lib/types'

export type DataMode = 'google' | 'demo'

export interface FinanceDataProvider {
  mode: DataMode
  // Part of query keys so switching spreadsheets never serves another sheet's data
  sourceId: string | null
  getRecentTransactions: () => Promise<Transaction[]>
  getFullTransactions: () => Promise<Transaction[]>
  reloadData: (scope?: FinanceDataScope) => Promise<void>
  // queued: saved on this device and sent by the sync (hooks/use-outbox-sync.ts), not yet in the
  // sheet; outboxId is then its queue entry's
  addTransaction: (input: TransactionInput) => Promise<{ queued: boolean; outboxId?: string }>
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
  // null when the source has no recurring tab; adding the first payment creates it
  getRecurringPayments: () => Promise<RecurringPayment[] | null>
  // next defaults to the start; later when set up from a transaction already paid. Returns its ID.
  addRecurringPayment: (input: RecurringPaymentInput, next?: StartDate) => Promise<string>
  // Sets an existing transaction's column K to a recurring payment's date
  linkTransactionToRecurring: (original: Transaction, link: string) => Promise<void>
  updateRecurringPayment: (original: RecurringPayment, input: RecurringPaymentInput) => Promise<void>
  deleteRecurringPayment: (original: RecurringPayment) => Promise<void>
  // Adds a due payment as a transaction and moves the payment to its next date
  approveRecurringDraft: (draft: RecurringDraft) => Promise<void>
  // Moves the payment to its next date without adding a transaction
  skipRecurringDraft: (draft: RecurringDraft) => Promise<void>
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

// The request couldn't be sent: no token (offline at startup) or no network
function isOfflineError(error: unknown) {
  return (error instanceof Error && error.message === 'Not authenticated') || classifySyncError(error) === 'retry'
}

const UNKNOWN_IDS_OFFLINE_MESSAGE = 'Saving offline needs the spreadsheet to have been opened online on this device. Connect to the internet and try again.'
const FORMULA_IDS_OFFLINE_MESSAGE = 'This spreadsheet computes TransactionID with a formula, so transactions can only be saved online. Update it as described in docs/migrations/stable-transaction-ids.md to save offline.'

function buildGoogleProvider(
  accessToken: string | null,
  userId: string | null,
  spreadsheetId: string | null,
  pickedAt: number | null,
  refreshSession: () => Promise<boolean>,
  pendingRefresh: () => Promise<boolean>,
  reportAccessError: (message: string) => void
): FinanceDataProvider {
  // Writes skip the post-pick retry and access-error reporting: a 403 on write usually means
  // view-only access, which must not bounce the user back to spreadsheet setup
  const fetchWithRefresh = async <T,>(
    currentToken: string | null,
    fetcher: (token: string, spreadsheetId: string) => Promise<T>,
    { isWrite = false } = {}
  ): Promise<T> => {
    // At startup the stored session's refresh may still be running while cached data shows;
    // the request waits for it instead of failing
    if (!currentToken && await pendingRefresh()) {
      currentToken = localStorage.getItem('pfe_access_token')
    }

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
      return fetchWithRefresh(accessToken, fetchRecentTransactions)
    },
    async getFullTransactions() {
      return fetchWithRefresh(accessToken, fetchFullTransactions)
    },
    // Cached data is the query cache itself, which the caller invalidates
    async reloadData() {},
    // A new transaction is queued and synced in the background, online or not. Returns need the
    // purchase row and sheets with formula IDs have no ID to check for duplicates, so both are
    // saved directly, online only.
    async addTransaction(input) {
      let storedIds = spreadsheetId ? getKnownStoredIds(spreadsheetId) : null

      if (!input.returnOf && userId && spreadsheetId && storedIds === null) {
        try {
          storedIds = await fetchWithRefresh(accessToken, (token, id) => hasStoredIds(token, id), { isWrite: true })
          setKnownStoredIds(spreadsheetId, storedIds)
        } catch (error) {
          throw isOfflineError(error) ? new Error(UNKNOWN_IDS_OFFLINE_MESSAGE) : error
        }
      }

      if (!input.returnOf && userId && spreadsheetId && storedIds) {
        const entry = await enqueueTransaction(userId, spreadsheetId, input)
        requestOutboxSync()
        return { queued: true, outboxId: entry.id }
      }

      try {
        await fetchWithRefresh(accessToken, (token, id) => appendTransaction(token, id, input), { isWrite: true })
      } catch (error) {
        throw !input.returnOf && storedIds === false && isOfflineError(error) ? new Error(FORMULA_IDS_OFFLINE_MESSAGE) : error
      }
      return { queued: false }
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
      return fetchWithRefresh(accessToken, fetchCategoriesAndRecent)
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
    async getRecurringPayments() {
      return fetchWithRefresh(accessToken, fetchRecurringPayments)
    },
    async addRecurringPayment(input, next) {
      return fetchWithRefresh(accessToken, (token, id) => addRecurringPayment(token, id, input, next), { isWrite: true })
    },
    async linkTransactionToRecurring(original, link) {
      await fetchWithRefresh(accessToken, (token, id) => linkTransactionToRecurring(token, id, original, link), { isWrite: true })
    },
    async updateRecurringPayment(original, input) {
      await fetchWithRefresh(accessToken, (token, id) => updateRecurringPayment(token, id, original, input), { isWrite: true })
    },
    async deleteRecurringPayment(original) {
      await fetchWithRefresh(accessToken, (token, id) => deleteRecurringPayment(token, id, original), { isWrite: true })
    },
    async approveRecurringDraft(draft) {
      await fetchWithRefresh(accessToken, (token, id) => approveRecurringDraft(token, id, draft), { isWrite: true })
    },
    async skipRecurringDraft(draft) {
      await fetchWithRefresh(accessToken, (token, id) => skipRecurringDraft(token, id, draft), { isWrite: true })
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
    async addTransaction(input) {
      await addDemoTransaction(input)
      return { queued: false }
    },
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
    async getRecurringPayments() {
      return null
    },
    async addRecurringPayment() {
      throw new Error(demoModeMessage('Recurring payments'))
    },
    async linkTransactionToRecurring() {
      throw new Error(demoModeMessage('Recurring payments'))
    },
    async updateRecurringPayment() {
      throw new Error(demoModeMessage('Recurring payments'))
    },
    async deleteRecurringPayment() {
      throw new Error(demoModeMessage('Recurring payments'))
    },
    async approveRecurringDraft() {
      throw new Error(demoModeMessage('Recurring payments'))
    },
    async skipRecurringDraft() {
      throw new Error(demoModeMessage('Recurring payments'))
    },
  }
}

export function FinanceDataProvider({ children }: { children: ReactNode }) {
  const { mode, accessToken, userId, isOffline, refreshSession, pendingRefresh } = useAuth()
  const { spreadsheet, reportAccessError } = useSpreadsheet()
  const queryClient = useQueryClient()
  const spreadsheetId = spreadsheet?.id ?? null
  const pickedAt = spreadsheet?.pickedAt ?? null
  const wasOffline = useRef(isOffline)
  const persistScope = mode === 'google' && userId && spreadsheetId ? persistScopeKey(userId, spreadsheetId) : null
  const [restoredScope, setRestoredScope] = useState<string | null>(null)
  // Queries don't fetch until the cached data is back, so they refresh it instead of racing it
  const isRestoring = persistScope !== null && restoredScope !== persistScope

  useOutboxSync({ enabled: mode === 'google', userId, spreadsheetId, accessToken, refreshSession })
  useTrackSyncedOutboxEntries()

  // Restores the user's and spreadsheet's cached queries, then keeps them saved
  useEffect(() => {
    if (!persistScope || !spreadsheetId) return
    let active = true
    let unsubscribe: (() => void) | undefined
    const persister = createQueryPersister(persistScope)

    const isPersisted = (query: Query) => shouldPersistQuery(query.queryKey, query.state.data !== undefined, spreadsheetId)

    persistQueryClientRestore({ queryClient, persister, maxAge: PERSIST_MAX_AGE_MS, buster: PERSIST_BUSTER })
      .catch((error) => console.error('Failed to restore cached data:', error))
      .finally(() => {
        if (!active) return
        // The sheet may have changed since the last launch: restored data shows at once and
        // refetches when used, even within its staleTime
        void queryClient.invalidateQueries({ predicate: isPersisted, refetchType: 'none' })
        unsubscribe = persistQueryClientSubscribe({ queryClient, persister, buster: PERSIST_BUSTER, dehydrateOptions: { shouldDehydrateQuery: isPersisted } })
        setRestoredScope(persistScope)
      })

    return () => {
      active = false
      unsubscribe?.()
    }
  }, [persistScope, queryClient, spreadsheetId])

  // Queries that failed without a token while offline are retried once the token is back
  useEffect(() => {
    if (wasOffline.current && !isOffline && accessToken) {
      void queryClient.refetchQueries({ predicate: (query) => query.state.status === 'error' })
    }
    wasOffline.current = isOffline
  }, [accessToken, isOffline, queryClient])

  const provider = useMemo(() => {
    if (mode === 'demo') {
      return buildDemoProvider()
    }

    return buildGoogleProvider(accessToken, userId, spreadsheetId, pickedAt, refreshSession, pendingRefresh, reportAccessError)
  }, [accessToken, mode, pendingRefresh, pickedAt, refreshSession, reportAccessError, spreadsheetId, userId])

  return (
    <DataProviderContext.Provider value={provider}>
      <IsRestoringProvider value={isRestoring}>{children}</IsRestoringProvider>
    </DataProviderContext.Provider>
  )
}

export function useFinanceDataProvider() {
  const context = useContext(DataProviderContext)

  if (!context) {
    throw new Error('useFinanceDataProvider must be used within a FinanceDataProvider')
  }

  return context
}
