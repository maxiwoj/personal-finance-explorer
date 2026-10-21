'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useFinanceDataProvider } from '@/contexts/data-provider-context'
import type { Transaction } from '@/lib/types'

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
