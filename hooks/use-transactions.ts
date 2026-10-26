'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useFinanceDataProvider } from '@/contexts/data-provider-context'
import type { CategoryDefinition, Transaction, TransactionInput } from '@/lib/types'

export type FinanceDataScope = 'recent' | 'full' | 'all'

export function useRecentTransactions() {
  const provider = useFinanceDataProvider()

  return useQuery<Transaction[]>({
    queryKey: ['recent-transactions', provider.mode, provider.sourceId],
    queryFn: provider.getRecentTransactions,
    staleTime: provider.mode === 'demo' ? Infinity : 5 * 60 * 1000,
  })
}

export function useFullTransactions() {
  const provider = useFinanceDataProvider()

  return useQuery<Transaction[]>({
    queryKey: ['full-transactions', provider.mode, provider.sourceId],
    queryFn: provider.getFullTransactions,
    staleTime: provider.mode === 'demo' ? Infinity : 10 * 60 * 1000,
  })
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

// Writes go to the full tab; the recent tab is derived from it, so both caches are dropped.
// Demo reloadData regenerates the dataset, so demo writes only invalidate the queries.
export function useSaveTransaction() {
  const provider = useFinanceDataProvider()
  const queryClient = useQueryClient()

  return async (input: TransactionInput, original?: Transaction) => {
    if (original) {
      await provider.updateTransaction(original, input)
    } else {
      await provider.addTransaction(input)
    }

    if (provider.mode === 'google') {
      await provider.reloadData('all')
    }

    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['recent-transactions', provider.mode] }),
      queryClient.invalidateQueries({ queryKey: ['full-transactions', provider.mode] }),
    ])
  }
}

export function useCategories(enabled = true) {
  const provider = useFinanceDataProvider()

  return useQuery<CategoryDefinition[] | null>({
    queryKey: ['categories', provider.mode, provider.sourceId],
    queryFn: provider.getCategories,
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
  }
}
