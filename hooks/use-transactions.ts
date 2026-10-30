'use client'

import { useCallback, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/auth-context'
import { useFinanceDataProvider, type FinanceDataProvider } from '@/contexts/data-provider-context'
import { useSpreadsheet } from '@/contexts/spreadsheet-context'
import { useOutboxEntries, useSyncedOutboxEntries } from '@/hooks/use-outbox-sync'
import { mergeOutbox } from '@/lib/outbox-view'
import { resolveDefaultCurrency, type ExtendResult, type RatesStart, type StartDate } from '@/lib/currencies'
import { dayOf, dueDrafts, type RecurringDraft, type RecurringPayment, type RecurringPaymentInput } from '@/lib/recurring'
import { linkReturns } from '@/lib/returns'
import type { CategoryDefinition, CurrencyDefinition, CurrencyList, Transaction, TransactionInput } from '@/lib/types'

export type FinanceDataScope = 'recent' | 'full' | 'all'

// Rows without a currency get the default one before returns are linked to their purchases
function useTransactionSelect() {
  const defaultCurrency = useDefaultCurrency()
  return useCallback((transactions: Transaction[]) => linkReturns(resolveDefaultCurrency(transactions, defaultCurrency)), [defaultCurrency])
}

export function useRecentTransactions() {
  const provider = useFinanceDataProvider()
  const select = useTransactionSelect()

  return useQuery<Transaction[]>({
    queryKey: ['recent-transactions', provider.mode, provider.sourceId],
    queryFn: provider.getRecentTransactions,
    select,
    staleTime: provider.mode === 'demo' ? Infinity : 5 * 60 * 1000,
  })
}

export function useFullTransactions() {
  const provider = useFinanceDataProvider()
  const select = useTransactionSelect()

  return useQuery<Transaction[]>({
    queryKey: ['full-transactions', provider.mode, provider.sourceId],
    queryFn: provider.getFullTransactions,
    select,
    staleTime: provider.mode === 'demo' ? Infinity : 10 * 60 * 1000,
  })
}

// The transactions with the queued ones added, marked unsynced (lib/outbox-view.ts). An entry that
// has just synced stays, unmarked, until the transactions are refetched with its row, so the row
// doesn't disappear in between. undefined while the transactions are.
export function useTransactionsWithOutbox(transactions: Transaction[] | undefined, dataUpdatedAt: number): Transaction[] | undefined {
  const entries = useOutboxEntries()
  const synced = useSyncedOutboxEntries()
  const defaultCurrency = useDefaultCurrency()
  const { data: currencies } = useCurrencies()
  const { userId } = useAuth()
  const { spreadsheet } = useSpreadsheet()
  const spreadsheetId = spreadsheet?.id ?? null

  // Until a refetch that started after the entry left the queue
  const showSynced = useMemo(
    () => synced.filter(({ entry, at }) => dataUpdatedAt < at && entry.userId === userId && entry.spreadsheetId === spreadsheetId).map(({ entry }) => entry),
    [dataUpdatedAt, spreadsheetId, synced, userId]
  )

  return useMemo(
    () => transactions && mergeOutbox(transactions, entries, showSynced, defaultCurrency, currencies ?? null),
    [currencies, defaultCurrency, entries, showSynced, transactions]
  )
}

export function useReloadFinanceData() {
  const provider = useFinanceDataProvider()
  const queryClient = useQueryClient()

  return async (scope: FinanceDataScope = 'all') => {
    await provider.reloadData(scope)

    const invalidations: Promise<void>[] = []

    if (scope === 'recent' || scope === 'all') {
      invalidations.push(queryClient.invalidateQueries({ queryKey: ['recent-transactions', provider.mode] }))
    }

    if (scope === 'full' || scope === 'all') {
      invalidations.push(queryClient.invalidateQueries({ queryKey: ['full-transactions', provider.mode] }))
    }

    await Promise.all(invalidations)
  }
}

// Writes go to the full tab; the recent tab is derived from it, so both are refetched.
// Demo reloadData regenerates the dataset, so it isn't called here.
function useAfterWrite() {
  const provider = useFinanceDataProvider()
  const queryClient = useQueryClient()

  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['recent-transactions', provider.mode] }),
      queryClient.invalidateQueries({ queryKey: ['full-transactions', provider.mode] }),
      // A saved or deleted transaction can change the earliest date
      queryClient.invalidateQueries({ queryKey: ['rates-start', provider.mode] }),
    ])
  }
}

export function useSaveTransaction() {
  const provider = useFinanceDataProvider()
  const afterWrite = useAfterWrite()

  // queued: the new transaction is on this device and syncs in the background; outboxId is its
  // queue entry's
  return async (input: TransactionInput, original?: Transaction): Promise<{ queued: boolean; outboxId?: string }> => {
    if (original) {
      await provider.updateTransaction(original, input)
      await afterWrite()
      return { queued: false }
    }

    const { queued, outboxId } = await provider.addTransaction(input)
    // A queued transaction is refetched by the sync once it's in the sheet
    if (queued) return { queued, outboxId }

    // A new transaction is shown from what was entered, so the refetch runs in the background.
    // Returns are shown from the refetched rows (a return changes its purchase's amount).
    if (input.returnOf) {
      await afterWrite()
    } else {
      void afterWrite()
    }
    return { queued }
  }
}

export function useDeleteTransaction() {
  const provider = useFinanceDataProvider()
  const afterWrite = useAfterWrite()

  return async (transaction: Transaction) => {
    await provider.deleteTransaction(transaction)
    await afterWrite()
  }
}

export function useCategories(enabled = true) {
  const provider = useFinanceDataProvider()
  const queryClient = useQueryClient()

  return useQuery<CategoryDefinition[] | null>({
    queryKey: ['categories', provider.mode, provider.sourceId],
    // On the first load, recent transactions come in the same request, saving a round trip
    // before the Add form and the dashboard can show
    queryFn: async () => {
      const recentKey = ['recent-transactions', provider.mode, provider.sourceId]
      if (queryClient.getQueryData(recentKey) !== undefined) return provider.getCategories()

      const { categories, recentTransactions } = await provider.getCategoriesAndRecent()
      if (recentTransactions) queryClient.setQueryData(recentKey, recentTransactions)
      return categories
    },
    staleTime: provider.mode === 'demo' ? Infinity : 10 * 60 * 1000,
    enabled,
  })
}

export function useCategoryListActions() {
  const provider = useFinanceDataProvider()
  const queryClient = useQueryClient()
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['categories', provider.mode] })

  return {
    createCategoryList: async (categories: CategoryDefinition[]) => {
      await provider.createCategoryList(categories)
      await invalidate()
    },
    addCategory: async (name: string) => {
      await provider.addCategory(name)
      await invalidate()
    },
    setCategoryHidden: async (name: string, hidden: boolean) => {
      await provider.setCategoryHidden(name, hidden)
      await invalidate()
    },
  }
}

export function useCurrencies(enabled = true) {
  const provider = useFinanceDataProvider()

  return useQuery<CurrencyList | null>({
    queryKey: ['currencies', provider.mode, provider.sourceId],
    queryFn: provider.getCurrencies,
    staleTime: provider.mode === 'demo' ? Infinity : 10 * 60 * 1000,
    enabled,
  })
}

// currencyDates!B1; PLN for sheets without that tab, which the template has always converted to
export function useDefaultCurrency() {
  const { data } = useCurrencies()
  return data?.defaultCurrency ?? 'PLN'
}

export function useCurrencyActions() {
  const provider = useFinanceDataProvider()
  const queryClient = useQueryClient()
  const afterWrite = useAfterWrite()
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['currencies', provider.mode] })

  return {
    addCurrency: async (input: { code: string; multiplier?: number }) => {
      await provider.addCurrency(input)
      await invalidate()
    },
    // Converted amounts of past transactions change with the multiplier, so they are reloaded
    updateCurrencyMultiplier: async (currency: CurrencyDefinition, multiplier: number) => {
      await provider.updateCurrencyMultiplier(currency, multiplier)
      await Promise.all([invalidate(), afterWrite()])
    },
    removeCurrency: async (currency: CurrencyDefinition) => {
      await provider.removeCurrency(currency)
      await invalidate()
    },
    // Every converted amount changes currency, so transactions are reloaded
    changeDefaultCurrency: async (code: string) => {
      await provider.changeDefaultCurrency(code)
      await Promise.all([invalidate(), afterWrite()])
    },
  }
}

// Not cached beyond the query: the earliest transaction is read from the sheet every time
function ratesStartQuery(provider: FinanceDataProvider) {
  return { queryKey: ['rates-start', provider.mode, provider.sourceId], queryFn: provider.getRatesStart }
}

export function useRatesStart(enabled = true) {
  const provider = useFinanceDataProvider()
  return useQuery<RatesStart | null>({ ...ratesStartQuery(provider), enabled })
}

// Fetches it on demand, e.g. right after a transaction is saved
export function useFetchRatesStart() {
  const provider = useFinanceDataProvider()
  const queryClient = useQueryClient()
  return () => queryClient.fetchQuery<RatesStart | null>(ratesStartQuery(provider))
}

// Converted amounts change with the start, so transactions are reloaded after either write
export function useRatesStartActions() {
  const provider = useFinanceDataProvider()
  const queryClient = useQueryClient()
  const afterWrite = useAfterWrite()
  const reload = () => Promise.all([queryClient.invalidateQueries({ queryKey: ['currencies', provider.mode] }), afterWrite()])

  return {
    extendRates: async (newStart: StartDate): Promise<ExtendResult> => {
      const result = await provider.extendRates(newStart)
      await reload()
      return result
    },
    revertRates: async (extendedStart: StartDate, previousStart: StartDate) => {
      await provider.revertRates(extendedStart, previousStart)
      await reload()
    },
  }
}

export function useRecurringPayments(enabled = true) {
  const provider = useFinanceDataProvider()

  return useQuery<RecurringPayment[] | null>({
    queryKey: ['recurring-payments', provider.mode, provider.sourceId],
    queryFn: provider.getRecurringPayments,
    staleTime: provider.mode === 'demo' ? Infinity : 10 * 60 * 1000,
    enabled,
  })
}

// Payments due today or earlier, waiting to be approved or removed
export function useRecurringDrafts(): RecurringDraft[] {
  const { data } = useRecurringPayments()
  const today = dayOf(new Date())
  const todayKey = `${today.year}-${today.month}-${today.day}`
  // eslint-disable-next-line react-hooks/exhaustive-deps -- recomputed when the day changes, not on every render
  return useMemo(() => dueDrafts(data ?? [], today), [data, todayKey])
}

export function useRecurringActions() {
  const provider = useFinanceDataProvider()
  const queryClient = useQueryClient()
  const afterWrite = useAfterWrite()
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['recurring-payments', provider.mode] })

  return {
    addRecurringPayment: async (input: RecurringPaymentInput, next?: StartDate) => {
      await provider.addRecurringPayment(input, next)
      await invalidate()
    },
    updateRecurringPayment: async (original: RecurringPayment, input: RecurringPaymentInput) => {
      await provider.updateRecurringPayment(original, input)
      await invalidate()
    },
    deleteRecurringPayment: async (original: RecurringPayment) => {
      await provider.deleteRecurringPayment(original)
      await invalidate()
    },
    // The new transaction shows once the transactions are refetched
    approveRecurringDraft: async (draft: RecurringDraft) => {
      await provider.approveRecurringDraft(draft)
      await Promise.all([invalidate(), afterWrite()])
    },
    skipRecurringDraft: async (draft: RecurringDraft) => {
      await provider.skipRecurringDraft(draft)
      await invalidate()
    },
  }
}
