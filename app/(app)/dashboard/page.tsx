'use client'

import { useMemo, useState } from 'react'
import { addMonths, endOfMonth, endOfDay, format, startOfDay, startOfMonth, subMonths } from 'date-fns'
import { useRecentTransactions, useDefaultCurrency, useRecurringDrafts, useTransactionsWithOutbox } from '@/hooks/use-transactions'
import { useSampleDataHint } from '@/hooks/use-sheet-config'
import { ClearSampleDataDialog } from '@/components/clear-sample-data-dialog'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { PieChart } from '@/components/charts/pie-chart'
import { LineChart } from '@/components/charts/line-chart'
import { TransactionsTable } from '@/components/transactions-table'
import { TransactionDetailModal } from '@/components/transaction-detail-modal'
import { MonthYearFilter, filterByMonthYear } from '@/components/month-year-filter'
import { CategoryFilter, filterByCategory } from '@/components/category-filter'
import { DateRangeFilter, filterByDateRange } from '@/components/date-range-filter'
import { RecentTransactionsCarousel } from '@/components/recent-transactions-carousel'
import { getCategoryTotals, getCumulativeSpending, type TimeSeriesGranularity } from '@/lib/analytics'
import { useFilters } from '@/contexts/filter-context'
import { useIsMobile } from '@/hooks/use-mobile'
import { AlertCircle, Info, Settings2, SlidersHorizontal, TrendingUp, Wallet } from 'lucide-react'
import { MobileFold } from '@/components/mobile-fold'
import type { Transaction } from '@/lib/types'
import { NoTransactions } from '@/components/no-transactions'

function getComparisonWindow(selectedDateRange: { start: string; end: string } | null, selectedMonths: string[], selectedYears: string[]) {
  if (selectedDateRange) {
    const start = subMonths(startOfDay(new Date(selectedDateRange.start)), 1)
    const end = subMonths(endOfDay(new Date(selectedDateRange.end)), 1)
    return { start, end }
  }

  if (selectedMonths.length === 1 && selectedYears.length === 1) {
    const monthIndex = Number(selectedMonths[0]) - 1
    const year = Number(selectedYears[0])

    if (!Number.isNaN(monthIndex) && !Number.isNaN(year)) {
      const selectedMonth = new Date(year, monthIndex, 1)
      const previousMonth = subMonths(selectedMonth, 1)
      return {
        start: startOfMonth(previousMonth),
        end: endOfMonth(previousMonth),
      }
    }
  }

  return null
}

function filterTransactionsByWindow(transactions: Transaction[], window: { start: Date; end: Date } | null) {
  if (!window) return []

  return transactions.filter(transaction => {
    const timestamp = transaction.timestamp.getTime()
    return timestamp >= window.start.getTime() && timestamp <= window.end.getTime()
  })
}


function buildAlignedSeriesData(
  labels: string[],
  points: Array<{ label: string; total: number; transactionName?: string; transactionNames?: string[] }>
) {
  const byLabel = new Map(points.map(point => [point.label, point]))

  return labels.map(label => {
    const point = byLabel.get(label)
    if (!point) {
      return null
    }

    if (point.transactionNames?.length || point.transactionName) {
      return {
        value: point.total,
        detail: point.transactionNames?.join(' • ') || point.transactionName,
      }
    }

    return point.total
  })
}

function sortLabelsChronologically(labelEntries: Array<{ label: string; timestamp: number }>) {
  const sortedEntries = [...labelEntries].sort((a, b) => a.timestamp - b.timestamp)
  const seen = new Set<string>()

  return sortedEntries.filter(entry => {
    if (seen.has(entry.label)) {
      return false
    }

    seen.add(entry.label)
    return true
  })
}


function formatChartLabel(date: Date, granularity: TimeSeriesGranularity) {
  return granularity === 'transaction'
    ? format(date, 'MMM d, HH:mm')
    : format(date, 'yyyy-MM-dd')
}

function shiftComparisonPoints(
  points: Array<{ label: string; total: number; timestamp: number; transactionName?: string; transactionNames?: string[] }>,
  granularity: TimeSeriesGranularity
) {
  return points.map(point => {
    const shiftedDate = addMonths(new Date(point.timestamp), 1)

    return {
      ...point,
      label: formatChartLabel(shiftedDate, granularity),
      timestamp: shiftedDate.getTime(),
    }
  })
}

export default function DashboardPage() {
  const defaultCurrency = useDefaultCurrency()
  const { data, dataUpdatedAt, isLoading, error } = useRecentTransactions()
  // Transactions saved on this device and not yet in the sheet are included too
  const transactions = useTransactionsWithOutbox(data, dataUpdatedAt)
  // Due recurring payments, shown first among the recent transactions until approved or removed
  const drafts = useRecurringDrafts()
  const { filters, setSelectedCategories, setSelectedDateRange } = useFilters()
  const { selectedMonths, selectedYears, selectedCategories, selectedDateRange } = filters
  const isMobile = useIsMobile()
  const [showPreviousMonth, setShowPreviousMonth] = useState(false)
  const [limitComparisonToCurrentProgress, setLimitComparisonToCurrentProgress] = useState(false)
  const [showTransactionTimes, setShowTransactionTimes] = useState(false)
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null)
  // A copy of the template still showing its sample data: offer to clear it
  const offerSampleClear = useSampleDataHint()
  const [isClearingSample, setIsClearingSample] = useState(false)

  const filteredTransactions = useMemo(() => {
    if (!transactions) return []

    let filtered = transactions

    if (selectedDateRange) {
      filtered = filterByDateRange(filtered, selectedDateRange)
    } else {
      filtered = filterByMonthYear(filtered, selectedMonths, selectedYears)
    }

    filtered = filterByCategory(filtered, selectedCategories)
    return filtered
  }, [transactions, selectedMonths, selectedYears, selectedCategories, selectedDateRange])

  const comparisonWindow = useMemo(
    () => getComparisonWindow(selectedDateRange, selectedMonths, selectedYears),
    [selectedDateRange, selectedMonths, selectedYears]
  )

  const previousMonthTransactions = useMemo(() => {
    if (!transactions || !comparisonWindow) return []

    let filtered = filterTransactionsByWindow(transactions, comparisonWindow)
    filtered = filterByCategory(filtered, selectedCategories)

    return filtered
  }, [transactions, comparisonWindow, selectedCategories])

  const granularity: TimeSeriesGranularity = showTransactionTimes ? 'transaction' : 'day'

  const lineChartConfig = useMemo(() => {
    const currentSeries = getCumulativeSpending(filteredTransactions, granularity)
    const currentSeriesEndTimestamp = currentSeries.at(-1)?.timestamp
    const shiftedPreviousSeries = showPreviousMonth
      ? shiftComparisonPoints(getCumulativeSpending(previousMonthTransactions, granularity), granularity)
      : []
    const previousSeries = limitComparisonToCurrentProgress && currentSeriesEndTimestamp !== undefined
      ? shiftedPreviousSeries.filter(point => point.timestamp <= currentSeriesEndTimestamp)
      : shiftedPreviousSeries
    const currentPeriodLabel = selectedDateRange
      ? 'Selected period'
      : selectedMonths.length === 1 && selectedYears.length === 1
        ? format(new Date(Number(selectedYears[0]), Number(selectedMonths[0]) - 1, 1), 'MMMM yyyy')
        : 'Current selection'
    const sortedLabels = sortLabelsChronologically([
      ...currentSeries.map(point => ({ label: point.label, timestamp: point.timestamp })),
      ...previousSeries.map(point => ({ label: point.label, timestamp: point.timestamp })),
    ])
    const labels = sortedLabels.map(entry => entry.label)
    const labelTimestamps = Object.fromEntries(sortedLabels.map(entry => [entry.label, entry.timestamp]))

    return {
      labels,
      labelTimestamps,
      series: [
        {
          name: currentPeriodLabel,
          data: buildAlignedSeriesData(labels, currentSeries),
          color: '#60a5fa',
          areaFill: true,
        },
        ...(showPreviousMonth && previousSeries.length > 0
          ? [{
              name: selectedDateRange ? 'Previous month window' : 'Previous month',
              data: buildAlignedSeriesData(labels, previousSeries),
              color: '#94a3b8',
              lineStyle: 'dashed' as const,
              opacity: 0.95,
            }]
          : []),
      ],
      description: `Running spend for ${currentPeriodLabel.toLowerCase()}`,
    }
  }, [filteredTransactions, granularity, limitComparisonToCurrentProgress, previousMonthTransactions, selectedDateRange, selectedMonths, selectedYears, showPreviousMonth])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center space-y-4">
          <Spinner className="h-8 w-8 mx-auto" />
          <p className="text-muted-foreground">Loading your transactions...</p>
        </div>
      </div>
    )
  }

  if (error && !transactions) {
    return (
      <Alert variant="destructive" className="max-w-lg mx-auto mt-10">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          {error instanceof Error ? error.message : 'Failed to load transactions. Please try again.'}
        </AlertDescription>
      </Alert>
    )
  }

  if (!transactions || transactions.length === 0) {
    return (
      <NoTransactions />
    )
  }

  const totalSpending = filteredTransactions.reduce((sum, t) => sum + t.amountPLN, 0)
  const categoryTotals = getCategoryTotals(filteredTransactions)

  const pieData = categoryTotals.map(c => ({
    name: c.category,
    value: c.total,
    color: c.color,
  }))

  const handlePieSliceClick = (categoryName: string) => {
    if (selectedCategories.includes(categoryName)) {
      setSelectedCategories(selectedCategories.filter(c => c !== categoryName))
    } else {
      setSelectedCategories([...selectedCategories, categoryName])
    }
  }

  const filterLabel = selectedDateRange
    ? `${new Date(selectedDateRange.start).toLocaleDateString()} - ${new Date(selectedDateRange.end).toLocaleDateString()}`
    : selectedMonths.length === 0 && selectedYears.length === 0
      ? 'All time'
      : `${selectedMonths.length === 0 ? 'All months' : ''} ${selectedYears.length === 1 ? selectedYears[0] : ''}`

  const periodLabel = !selectedDateRange && selectedMonths.length === 1 && selectedYears.length === 1
    ? format(new Date(Number(selectedYears[0]), Number(selectedMonths[0]) - 1, 1), 'MMM yyyy')
    : filterLabel.trim() || 'Selected period'
  const filterSummary = selectedCategories.length > 0
    ? `${periodLabel} · ${selectedCategories.length} ${selectedCategories.length === 1 ? 'category' : 'categories'}`
    : periodLabel
  const totalSpendingLabel = `${totalSpending.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} ${defaultCurrency}`

  const canComparePreviousMonth = Boolean(comparisonWindow)
  const chartHelpText = showTransactionTimes
    ? 'Granular mode plots every transaction timestamp. Hovering a point also shows the transaction name when available.'
    : 'Daily mode keeps one cumulative point per day for a cleaner monthly view.'

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="hidden md:block">
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">Your spending overview</p>
        </div>
        <MobileFold
          label="Filters"
          icon={SlidersHorizontal}
          summary={filterSummary}
          className="md:w-auto"
          contentClassName="flex flex-wrap items-center gap-2"
        >
          <CategoryFilter transactions={transactions} />
          <DateRangeFilter />
          <MonthYearFilter transactions={transactions} />
        </MobileFold>
      </div>

      {offerSampleClear && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            <p>
              This is the template&apos;s sample data.{' '}
              <button type="button" className="underline underline-offset-2" onClick={() => setIsClearingSample(true)}>
                Clear it
              </button>{' '}
              to start with your own.
            </p>
          </AlertDescription>
        </Alert>
      )}
      <ClearSampleDataDialog open={isClearingSample} onOpenChange={setIsClearingSample} />

      <RecentTransactionsCarousel 
        transactions={transactions || []} 
        limit={5} 
        drafts={drafts}
        className="md:pb-2"
        onTransactionClick={setSelectedTransaction}
      />

      {/* Mobile: one compact line instead of three cards */}
      <div className="md:hidden flex items-baseline justify-between gap-3 rounded-lg border px-4 py-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Total spending</p>
          <p className="text-xl font-bold">{totalSpendingLabel}</p>
        </div>
        <p className="shrink-0 text-right text-xs text-muted-foreground">
          {filteredTransactions.length} transactions
          <br />
          {categoryTotals.length} categories
        </p>
      </div>

      <div className="hidden md:grid gap-4 md:grid-cols-3">
        <Card className="gap-1 py-4">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 px-4">
            <CardTitle className="text-sm font-medium">Total Spending</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="px-4">
            <div className="text-2xl font-bold">{totalSpendingLabel}</div>
            <p className="text-xs text-muted-foreground">{periodLabel}</p>
          </CardContent>
        </Card>

        <Card className="gap-1 py-4">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 px-4">
            <CardTitle className="text-sm font-medium">Transactions</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="px-4">
            <div className="text-2xl font-bold">{filteredTransactions.length}</div>
            <p className="text-xs text-muted-foreground">
              Transactions in selected period
            </p>
          </CardContent>
        </Card>

        <Card className="gap-1 py-4">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 px-4">
            <CardTitle className="text-sm font-medium">Categories</CardTitle>
          </CardHeader>
          <CardContent className="px-4">
            <div className="text-2xl font-bold">{categoryTotals.length}</div>
            <p className="text-xs text-muted-foreground">
              Different spending categories
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:gap-6 lg:grid-cols-2">
        <Card className="max-md:gap-2">
          <CardHeader>
            <CardTitle>Spending by Category</CardTitle>
            <CardDescription className="hidden md:block">Click a slice to filter by category</CardDescription>
          </CardHeader>
          <CardContent>
            {pieData.length > 0 ? (
              <PieChart
                unit={defaultCurrency}
                data={pieData}
                onSliceClick={handlePieSliceClick}
                // A shorter canvas on phones: the ring is sized by the narrow width, extra height is empty space
                height={isMobile ? 220 : 350}
                compact={isMobile}
                centerValue={`${totalSpending.toLocaleString('pl-PL', { maximumFractionDigits: 0 })} ${defaultCurrency}`}
                centerCaption="Total"
              />
            ) : (
              <div className="flex items-center justify-center h-[350px] text-muted-foreground">
                No transactions in selected period
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="space-y-4">
            <div>
              <CardTitle>Cumulative Spending</CardTitle>
              <CardDescription>
                {lineChartConfig.description}. Use the brush tool to select a smaller time window.
              </CardDescription>
            </div>
            <MobileFold label="Chart options" icon={Settings2} contentClassName="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                  <div className="space-y-1">
                    <Label htmlFor="compare-previous-month">Previous month</Label>
                    <p className="text-xs text-muted-foreground">Overlay the prior month as a dashed series.</p>
                  </div>
                  <Switch
                    id="compare-previous-month"
                    checked={showPreviousMonth}
                    onCheckedChange={checked => {
                      setShowPreviousMonth(checked)
                      if (!checked) {
                        setLimitComparisonToCurrentProgress(false)
                      }
                    }}
                    disabled={!canComparePreviousMonth}
                  />
                </div>
                <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                  <div className="space-y-1">
                    <Label htmlFor="limit-comparison-progress">Trim comparison</Label>
                    <p className="text-xs text-muted-foreground">Hide prior-month points after the current month stops.</p>
                  </div>
                  <Switch
                    id="limit-comparison-progress"
                    checked={limitComparisonToCurrentProgress}
                    onCheckedChange={setLimitComparisonToCurrentProgress}
                    disabled={!showPreviousMonth}
                  />
                </div>
                <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                  <div className="space-y-1">
                    <Label htmlFor="show-transaction-times">Transaction times</Label>
                    <p className="text-xs text-muted-foreground">Plot each transaction instead of daily rollups.</p>
                  </div>
                  <Switch
                    id="show-transaction-times"
                    checked={showTransactionTimes}
                    onCheckedChange={setShowTransactionTimes}
                  />
                </div>
              </div>
              {!canComparePreviousMonth && (
                <p className="text-xs text-muted-foreground">
                  Previous-month comparison is available when you select a single month/year or a custom date range.
                </p>
              )}
              <p className="text-xs text-muted-foreground">{chartHelpText}</p>
            </MobileFold>
          </CardHeader>
          <CardContent>
            {lineChartConfig.labels.length > 0 ? (
              <LineChart
                yAxisLabel={defaultCurrency}
                labels={lineChartConfig.labels}
                series={lineChartConfig.series}
                height={350}
                onBrushSelect={(start: string, end: string) => {
                  const startTimestamp = lineChartConfig.labelTimestamps[start]
                  const endTimestamp = lineChartConfig.labelTimestamps[end]

                  if (startTimestamp === undefined || endTimestamp === undefined) {
                    return
                  }

                  const startDate = startOfDay(new Date(startTimestamp))
                  const endDate = endOfDay(new Date(endTimestamp))

                  setSelectedDateRange({
                    start: startDate.toISOString(),
                    end: endDate.toISOString(),
                  })
                }}
              />
            ) : (
              <div className="flex items-center justify-center h-[350px] text-muted-foreground">
                No transactions in selected period
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card id="recent-transactions" className="scroll-mt-20">
        <CardHeader>
          <CardTitle>Recent Transactions</CardTitle>
          <CardDescription>Last 20 transactions in selected period</CardDescription>
        </CardHeader>
        <CardContent>
          <TransactionsTable transactions={filteredTransactions} limit={20} drafts={drafts} />
        </CardContent>
      </Card>

      <TransactionDetailModal
        transaction={selectedTransaction}
        open={selectedTransaction !== null}
        onClose={() => setSelectedTransaction(null)}
      />
    </div>
  )
}
