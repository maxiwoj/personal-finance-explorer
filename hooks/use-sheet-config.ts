'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/auth-context'
import { useFinanceDataProvider } from '@/contexts/data-provider-context'
import { useRecentTransactions } from '@/hooks/use-transactions'
import { isSampleId, isTemplateSample, type SheetConfig } from '@/lib/sheet-config'

// The config tab's settings. Saved with the other cached queries, so a launch has them at once,
// also offline, and refreshes them in the background like categories.
export function useSheetConfig(enabled = true) {
  const provider = useFinanceDataProvider()

  return useQuery<SheetConfig>({
    queryKey: ['sheet-config', provider.mode, provider.sourceId],
    queryFn: provider.getSheetConfig,
    staleTime: provider.mode === 'demo' ? Infinity : 10 * 60 * 1000,
    enabled,
  })
}

// Whether to offer clearing the template's sample data: the sheet is still marked as the
// template's sample. The dialog reads the sheet to show what would go, or why it can't.
export function useSampleDataOffer() {
  const { mode, isOffline } = useAuth()
  const isGoogle = mode === 'google'
  const { data: config } = useSheetConfig(isGoogle)

  return isGoogle && !isOffline && isTemplateSample(config)
}

// The dashboard hint: offered, and sample transactions are among the recent ones shown
export function useSampleDataHint() {
  const offered = useSampleDataOffer()
  const { data: recent } = useRecentTransactions()

  return offered && !!recent?.some(t => isSampleId(t.transactionId))
}

export function useSampleDataActions() {
  const provider = useFinanceDataProvider()
  const queryClient = useQueryClient()

  return {
    checkSampleData: provider.checkSampleData,
    clearSampleData: provider.clearSampleData,
    // After a clear nothing cached may keep showing the sample rows: every query starts over from
    // the sheet. Queries without data aren't saved, so the saved cache loses them too. Called when
    // the result is dismissed: pages showing the dialog unmount while their data reloads.
    reloadAfterClear: () => queryClient.resetQueries(),
  }
}
