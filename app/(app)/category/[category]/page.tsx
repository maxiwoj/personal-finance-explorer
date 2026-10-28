'use client'

import { use, useMemo } from 'react'
import Link from 'next/link'
import { useFullTransactions, useDefaultCurrency } from '@/hooks/use-transactions'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { PieChart } from '@/components/charts/pie-chart'
import { LineChart } from '@/components/charts/line-chart'
import { TransactionsTable } from '@/components/transactions-table'
import { MonthYearFilter, filterByMonthYear } from '@/components/month-year-filter'
import { DateRangeFilter, filterByDateRange } from '@/components/date-range-filter'
import { filterTransactionsByCategory, getDescriptionTotals, getMonthlyTotals } from '@/lib/analytics'
import { getCategoryColor, paletteColor } from '@/lib/colors'
import { useFilters } from '@/contexts/filter-context'
import { AlertCircle, ArrowLeft } from 'lucide-react'

interface CategoryPageProps {
  params: Promise<{ category: string }>
}

export default function CategoryPage({ params }: CategoryPageProps) {
  const defaultCurrency = useDefaultCurrency()
  const { category: encodedCategory } = use(params)
  const category = decodeURIComponent(encodedCategory)
  const { data: transactions, isLoading, error } = useFullTransactions()
  const { filters } = useFilters()
  const { selectedMonths, selectedYears, selectedDateRange } = filters

  // First filter by category, then by month/year or date range
  const categoryTransactions = useMemo(() => {
    if (!transactions) return []
    return filterTransactionsByCategory(transactions, category)
  }, [transactions, category])

  const filteredTransactions = useMemo(() => {
    let filtered = categoryTransactions
    if (selectedDateRange) {
      filtered = filterByDateRange(filtered, selectedDateRange)
    } else {
      filtered = filterByMonthYear(filtered, selectedMonths, selectedYears)
    }
    return filtered
  }, [categoryTransactions, selectedMonths, selectedYears, selectedDateRange])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center space-y-4">
          <Spinner className="h-8 w-8 mx-auto" />
          <p className="text-muted-foreground">Loading category data...</p>
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
        <p className="text-muted-foreground">No transactions found.</p>
      </div>
    )
  }

  if (categoryTransactions.length === 0) {
    return (
      <div className="space-y-6">
        <Link href="/categories">
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to Categories
          </Button>
        </Link>
        <div className="text-center py-20">
          <p className="text-muted-foreground">No transactions found for category: {category}</p>
        </div>
      </div>
    )
  }

  const totalSpent = filteredTransactions.reduce((sum, t) => sum + t.amountPLN, 0)
  const descriptionTotals = getDescriptionTotals(filteredTransactions)
  const monthlyTotals = getMonthlyTotals(filteredTransactions)
  const categoryColor = getCategoryColor(category)

  // Pie chart data for top descriptions
  const topDescriptions = descriptionTotals.slice(0, 10)
  const otherTotal = descriptionTotals.slice(10).reduce((sum, d) => sum + d.total, 0)
  
  // Each description gets its own palette color; without one every slice was the chart's default blue
  const pieData = [
    ...topDescriptions.map(d => ({
      name: d.what,
      value: d.total,
    })),
    ...(otherTotal > 0 ? [{ name: 'Other', value: otherTotal }] : [])
  ].map((slice, index) => ({ ...slice, color: paletteColor(index) }))

  const lineData = monthlyTotals.map(m => ({
    label: m.monthName,
    value: m.total,
  }))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <Link href="/categories">
            <Button variant="ghost" size="sm" className="gap-2 w-fit">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          </Link>
          <div className="flex items-center gap-3">
            <div 
              className="w-4 h-4 rounded-full" 
              style={{ backgroundColor: categoryColor }}
            />
            <div>
              <h1 className="text-3xl font-bold capitalize">{category}</h1>
              <p className="text-muted-foreground">
                {totalSpent > 0 
                  ? `${totalSpent.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} ${defaultCurrency} across ${filteredTransactions.length} transactions`
                  : 'No transactions in selected period'
                }
              </p>
            </div>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-4">
          <DateRangeFilter />
          <MonthYearFilter transactions={categoryTransactions} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Description Pie Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Spending by Description</CardTitle>
            <CardDescription>Top items in this category</CardDescription>
          </CardHeader>
          <CardContent>
            {pieData.length > 0 ? (
              <PieChart unit={defaultCurrency} data={pieData} height={350} />
            ) : (
              <div className="flex items-center justify-center h-[350px] text-muted-foreground">
                No transactions in selected period
              </div>
            )}
          </CardContent>
        </Card>

        {/* Monthly Time Series */}
        <Card>
          <CardHeader>
            <CardTitle>Monthly Spending</CardTitle>
            <CardDescription>Spending over time in this category</CardDescription>
          </CardHeader>
          <CardContent>
            {lineData.length > 0 ? (
              <LineChart
                yAxisLabel={defaultCurrency}
                labels={lineData.map(point => point.label)}
                series={[{
                  name: category,
                  data: lineData.map(point => point.value),
                  color: categoryColor,
                  areaFill: true,
                }]}
                height={350}
              />
            ) : (
              <div className="flex items-center justify-center h-[350px] text-muted-foreground">
                No transactions in selected period
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Transactions List */}
      <Card>
        <CardHeader>
          <CardTitle>All Transactions</CardTitle>
          <CardDescription>{filteredTransactions.length} transactions in selected period</CardDescription>
        </CardHeader>
        <CardContent>
          <TransactionsTable transactions={filteredTransactions} showCategory={false} />
        </CardContent>
      </Card>
    </div>
  )
}
