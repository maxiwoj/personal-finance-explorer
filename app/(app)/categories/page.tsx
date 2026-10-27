'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useFullTransactions, useDefaultCurrency } from '@/hooks/use-transactions'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Spinner } from '@/components/ui/spinner'
import { PieChart } from '@/components/charts/pie-chart'
import { MonthYearFilter, filterByMonthYear } from '@/components/month-year-filter'
import { CategoryFilter, filterByCategory } from '@/components/category-filter'
import { DateRangeFilter, filterByDateRange } from '@/components/date-range-filter'
import { getCategoryTotals, filterTransactionsByCategory, getDescriptionTotals } from '@/lib/analytics'
import { useFilters } from '@/contexts/filter-context'
import { AlertCircle, Wallet, TrendingUp, Tags } from 'lucide-react'

export default function CategoriesPage() {
  const defaultCurrency = useDefaultCurrency()
  const { data: transactions, isLoading, error } = useFullTransactions()
  const router = useRouter()
  const { filters } = useFilters()
  const { selectedMonths, selectedYears, selectedCategories, selectedDateRange } = filters

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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center space-y-4">
          <Spinner className="h-8 w-8 mx-auto" />
          <p className="text-muted-foreground">Loading full transaction history...</p>
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

  const categoryTotals = getCategoryTotals(filteredTransactions)
  const totalSpending = categoryTotals.reduce((sum, c) => sum + c.total, 0)

  const pieData = categoryTotals.map(c => ({
    name: c.category,
    value: c.total,
    color: c.color,
  }))

  const handleCategoryClick = (category: string) => {
    router.push(`/category/${encodeURIComponent(category)}`)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Categories</h1>
          <p className="text-muted-foreground">
            {totalSpending > 0 
              ? `${totalSpending.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} ${defaultCurrency} across ${categoryTotals.length} categories`
              : 'No spending in selected period'
            }
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CategoryFilter transactions={transactions} />
          <DateRangeFilter />
          <MonthYearFilter transactions={transactions} />
        </div>
      </div>

      {/* Summary Widgets */}
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
            <p className="text-xs text-muted-foreground">
              In selected period
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
              Total transactions
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Categories</CardTitle>
            <Tags className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{categoryTotals.length}</div>
            <p className="text-xs text-muted-foreground">
              Different spending categories
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Pie Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Spending Distribution</CardTitle>
          <CardDescription>Click a slice to explore category details</CardDescription>
        </CardHeader>
        <CardContent>
          {pieData.length > 0 ? (
            <PieChart unit={defaultCurrency} data={pieData} onSliceClick={handleCategoryClick} height={400} />
          ) : (
            <div className="flex items-center justify-center h-[400px] text-muted-foreground">
              No transactions in selected period
            </div>
          )}
        </CardContent>
      </Card>

      {/* Category Cards Grid */}
      {categoryTotals.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {categoryTotals.map(category => {
            const categoryTransactions = filterTransactionsByCategory(filteredTransactions, category.category)
            const topExpenses = getDescriptionTotals(categoryTransactions).slice(0, 3)
            const percentage = ((category.total / totalSpending) * 100).toFixed(1)

            return (
              <Link 
                key={category.category} 
                href={`/category/${encodeURIComponent(category.category)}`}
              >
                <Card className="h-full hover:bg-accent/50 transition-colors cursor-pointer">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-3 h-3 rounded-full" 
                          style={{ backgroundColor: category.color }}
                        />
                        <CardTitle className="text-lg capitalize">{category.category}</CardTitle>
                      </div>
                      <span className="text-sm text-muted-foreground">{percentage}%</span>
                    </div>
                    <CardDescription className="text-xl font-bold text-foreground">
                      {category.total.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} {defaultCurrency}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {topExpenses.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground font-medium">Top expenses:</p>
                        <ul className="text-sm space-y-0.5">
                          {topExpenses.map((expense, i) => (
                            <li key={i} className="flex justify-between text-muted-foreground">
                              <span className="truncate max-w-[60%]">{expense.what}</span>
                              <span>{expense.total.toLocaleString('pl-PL')} {defaultCurrency}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
