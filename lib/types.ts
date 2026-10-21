export type Transaction = {
  timestamp: Date
  what: string
  category: string
  amountOriginal: number
  currency: string
  amountPLN: number
  monthYear: string
  monthName: string
  transactionId: string
}

// Fields a user enters when adding or editing a transaction
export type TransactionInput = {
  timestamp: Date
  what: string
  category: string
  amount: number
  currency: string
}

export type CategoryTotal = {
  category: string
  total: number
  color: string
}

export type MonthlyTotal = {
  monthYear: string
  monthName: string
  total: number
}

export type DescriptionTotal = {
  what: string
  total: number
}

export type CacheData = {
  recent_transactions: Transaction[]
  full_transactions: Transaction[]
  last_sync_timestamp: number
}
