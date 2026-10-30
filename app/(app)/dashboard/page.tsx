'use client'

import { useMemo, useState } from 'react'
import { addMonths, endOfMonth, endOfDay, format, startOfDay, startOfMonth, subMonths } from 'date-fns'
import { useRecentTransactions, useDefaultCurrency, useRecurringDrafts, useTransactionsWithOutbox } from '@/hooks/use-transactions'
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
import { AlertCircle, TrendingUp, Wallet } from 'lucide-react'
import type { Transaction } from '@/lib/types'

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
  const [showPreviousMonth, setShowPreviousMonth] = useState(false)
  const [limitComparisonToCurrentProgress, setLimitComparisonToCurrentProgress] = useState(false)
  const [showTransactionTimes, setShowTransactionTimes] = useState(false)
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null)

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
      <div className="text-center py-20">
        <p className="text-muted-foreground">No transactions found in your spreadsheet.</p>
      </div>
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

  const canComparePreviousMonth = Boolean(comparisonWindow)
  const chartHelpText = showTransactionTimes
    ? 'Granular mode plots every transaction timestamp. Hovering a point also shows the transaction name when available.'
    : 'Daily mode keeps one cumulative point per day for a cleaner monthly view.'

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">Your spending overview</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CategoryFilter transactions={transactions} />
          <DateRangeFilter />
          <MonthYearFilter transactions={transactions} />
        </div>
      </div>

      <RecentTransactionsCarousel 
        transactions={transactions || []} 
        limit={5} 
        drafts={drafts}
        className="pb-2" 
        onTransactionClick={setSelectedTransaction}
      />

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Spending</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {totalSpending.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} {defaultCurrency}
            </div>
            <p className="text-xs text-muted-foreground">
              {filterLabel.trim() || 'Selected period'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Transactions</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{filteredTransactions.length}</div>
            <p className="text-xs text-muted-foreground">
              Transactions in selected period
            </p>
          </CardContent>
        </Card>

        <Card className="md:col-span-2 lg:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Categories</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{categoryTotals.length}</div>
            <p className="text-xs text-muted-foreground">
              Different spending categories
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Spending by Category</CardTitle>
            <CardDescription>Click a slice to filter by category</CardDescription>
          </CardHeader>
          <CardContent>
            {pieData.length > 0 ? (
              <PieChart unit={defaultCurrency} data={pieData} onSliceClick={handlePieSliceClick} height={350} />
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
          <TransactionsTable transactions={filteredTransactions} limit={20} />
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
