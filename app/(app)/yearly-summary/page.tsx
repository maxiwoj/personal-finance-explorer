'use client'

import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PieChart } from '@/components/charts/pie-chart'
import { StackedBarChart } from '@/components/charts/stacked-bar-chart'
import { TransactionsTable } from '@/components/transactions-table'
import { useFullTransactions, useDefaultCurrency } from '@/hooks/use-transactions'
import {
  getAvailableYears,
  getYearlyMonthlyBreakdown,
  getYearlyStackedCategorySeries,
  filterTransactionsByCategory,
  roundCurrency,
} from '@/lib/analytics'
import { AlertCircle, Wallet, TrendingUp, TrendingDown } from 'lucide-react'

function getElapsedMonthCount(year: number): number {
  const now = new Date()
  if (year < now.getFullYear()) return 12
  if (year > now.getFullYear()) return 0
  return now.getMonth() + 1
}

export default function YearlySummaryPage() {
  const defaultCurrency = useDefaultCurrency()
  const { data: transactions, isLoading, error } = useFullTransactions()

  const [selectedYear, setSelectedYear] = useState<number | null>(null)
  const [compareToPreviousYear, setCompareToPreviousYear] = useState(false)
  const [selectedMonthIndex, setSelectedMonthIndex] = useState<number | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)

  const availableYears = useMemo(() => (transactions ? getAvailableYears(transactions) : []), [transactions])

  useEffect(() => {
    if (selectedYear === null && availableYears.length > 0) {
      setSelectedYear(availableYears[0])
    }
  }, [availableYears, selectedYear])

  const breakdown = useMemo(
    () => (transactions && selectedYear !== null ? getYearlyMonthlyBreakdown(transactions, selectedYear) : []),
    [transactions, selectedYear]
  )

  const previousYearBreakdown = useMemo(
    () => (transactions && selectedYear !== null ? getYearlyMonthlyBreakdown(transactions, selectedYear - 1) : []),
    [transactions, selectedYear]
  )

  const hasPreviousYearData = previousYearBreakdown.some(m => m.total > 0)

  const stackedSeries = useMemo(() => getYearlyStackedCategorySeries(breakdown), [breakdown])

  useEffect(() => {
    if (breakdown.length === 0) return
    const lastWithData = [...breakdown].reverse().find(m => m.transactions.length > 0)
    setSelectedMonthIndex(lastWithData ? lastWithData.monthIndex : null)
    setSelectedCategory(null)
  }, [breakdown])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center space-y-4">
          <Spinner className="h-8 w-8 mx-auto" />
          <p className="text-muted-foreground">Loading yearly summary...</p>
        </div>
      </div>
    )
  }

  if (error) {
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

  if (selectedYear === null) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner className="h-8 w-8 mx-auto" />
      </div>
    )
  }

  const totalSpending = roundCurrency(breakdown.reduce((sum, m) => sum + m.total, 0))
  const elapsedMonths = Math.max(1, getElapsedMonthCount(selectedYear))
  const avgMonthly = roundCurrency(totalSpending / elapsedMonths)

  const currentElapsedTotal = roundCurrency(breakdown.slice(0, elapsedMonths).reduce((sum, m) => sum + m.total, 0))
  const previousElapsedTotal = roundCurrency(previousYearBreakdown.slice(0, elapsedMonths).reduce((sum, m) => sum + m.total, 0))
  const yoyChangePercent = previousElapsedTotal === 0
    ? null
    : roundCurrency(((currentElapsedTotal - previousElapsedTotal) / previousElapsedTotal) * 100)

  const showComparisonLine = compareToPreviousYear && hasPreviousYearData
  const showYoyKpi = compareToPreviousYear && hasPreviousYearData

  const selectedMonth = selectedMonthIndex !== null ? breakdown[selectedMonthIndex] : null

  const monthDetailTransactions = selectedMonth
    ? (selectedCategory ? filterTransactionsByCategory(selectedMonth.transactions, selectedCategory) : selectedMonth.transactions)
    : []

  const monthsWithTransactions = breakdown
    .map((m, i) => ({ ...m, i }))
    .filter(m => m.transactions.length > 0)

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Yearly Summary</h1>
          <p className="text-muted-foreground">Monthly spending for {selectedYear}, broken down by category</p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-3 rounded-lg border px-3 py-2">
            <Label htmlFor="compare-previous-year" className="text-sm">Compare to previous year</Label>
            <Switch
              id="compare-previous-year"
              checked={compareToPreviousYear}
              onCheckedChange={setCompareToPreviousYear}
              disabled={!hasPreviousYearData}
            />
          </div>
          <Select value={String(selectedYear)} onValueChange={(value) => setSelectedYear(Number(value))}>
            <SelectTrigger className="w-[110px] h-9">
              <SelectValue placeholder="Year" />
            </SelectTrigger>
            <SelectContent>
              {availableYears.map(year => (
                <SelectItem key={year} value={String(year)}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Spending</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {totalSpending.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} {defaultCurrency}
            </div>
            <p className="text-xs text-muted-foreground">In {selectedYear}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Monthly Spending</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {avgMonthly.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} {defaultCurrency}
            </div>
            <p className="text-xs text-muted-foreground">Across {elapsedMonths} month{elapsedMonths === 1 ? '' : 's'}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">YoY Change</CardTitle>
            {showYoyKpi && yoyChangePercent !== null ? (
              yoyChangePercent > 0 ? (
                <TrendingUp className="h-4 w-4 text-red-600" />
              ) : (
                <TrendingDown className="h-4 w-4 text-emerald-600" />
              )
            ) : (
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            )}
          </CardHeader>
          <CardContent>
            {showYoyKpi ? (
              yoyChangePercent === null ? (
                <div className="text-2xl font-bold">N/A</div>
              ) : (
                <div className={`text-2xl font-bold ${yoyChangePercent > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                  {yoyChangePercent > 0 ? '+' : ''}{yoyChangePercent.toFixed(1)}%
                </div>
              )
            ) : (
              <div className="text-2xl font-bold text-muted-foreground">—</div>
            )}
            <p className="text-xs text-muted-foreground">
              {showYoyKpi ? `vs ${selectedYear - 1}, same ${elapsedMonths}-month period` : 'Enable comparison to see YoY change'}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Monthly Spending by Category</CardTitle>
          <CardDescription>
            Click a bar to see that month&apos;s details{showComparisonLine ? ` · dashed line shows ${selectedYear - 1} totals` : ''}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <StackedBarChart
            yAxisLabel={defaultCurrency}
            labels={breakdown.map(m => m.label)}
            series={stackedSeries}
            comparisonSeries={showComparisonLine ? {
              name: `${selectedYear - 1} total`,
              data: previousYearBreakdown.map(m => m.total),
            } : undefined}
            height={380}
            onBarClick={(index) => {
              setSelectedMonthIndex(index)
              setSelectedCategory(null)
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle>
                {selectedMonth ? `${selectedMonth.label} ${selectedYear}` : 'Select a month'}
              </CardTitle>
              <CardDescription>
                {selectedMonth
                  ? `${selectedMonth.total.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} ${defaultCurrency} across ${selectedMonth.transactions.length} transactions`
                  : 'Click a bar above or pick a month to see the biggest expenses'}
              </CardDescription>
            </div>
            {monthsWithTransactions.length > 0 && (
              <Select
                value={selectedMonthIndex !== null ? String(selectedMonthIndex) : undefined}
                onValueChange={(value) => {
                  setSelectedMonthIndex(Number(value))
                  setSelectedCategory(null)
                }}
              >
                <SelectTrigger className="w-[140px] h-9">
                  <SelectValue placeholder="Jump to month" />
                </SelectTrigger>
                <SelectContent>
                  {monthsWithTransactions.map(m => (
                    <SelectItem key={m.i} value={String(m.i)}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {!selectedMonth ? (
            <div className="text-center py-12 text-muted-foreground">No transactions in {selectedYear}</div>
          ) : selectedMonth.transactions.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No transactions in {selectedMonth.label} {selectedYear}
            </div>
          ) : (
            <div className="grid gap-6 lg:grid-cols-2">
              <div>
                <PieChart
                  unit={defaultCurrency}
                  data={selectedMonth.categoryTotals.map(c => ({ name: c.category, value: c.total, color: c.color }))}
                  onSliceClick={(name) => setSelectedCategory(prev => prev === name ? null : name)}
                  height={280}
                />
              </div>
              <div className="space-y-2">
                {selectedCategory && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                      Filtered by: <strong className="text-foreground">{selectedCategory}</strong>
                    </span>
                    <Button variant="ghost" size="sm" onClick={() => setSelectedCategory(null)}>
                      Clear
                    </Button>
                  </div>
                )}
                <TransactionsTable transactions={monthDetailTransactions} sortBy="amount" limit={15} />
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
