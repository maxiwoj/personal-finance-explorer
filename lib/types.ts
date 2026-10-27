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
  // Free-form note from column I; empty when there is none
  notes?: string
  // Column J: on a return, the TransactionID of the purchase it (partly) returns; empty otherwise
  returnOf?: string
  // Set by linkReturns on a purchase with returns: amountOriginal and amountPLN are then net of
  // them, and recorded holds the purchase's own amounts as in the sheet
  returns?: Transaction[]
  recorded?: { amountOriginal: number; amountPLN: number }
}

// A row of the optional categories tab; its order is the order shown when adding
export type CategoryDefinition = {
  name: string
  color: string | null
  // Column C: kept in the list (and its color) but not offered when adding a transaction
  hidden?: boolean
}

// Fields a user enters when adding or editing a transaction
export type TransactionInput = {
  timestamp: Date
  what: string
  category: string
  amount: number
  currency: string
  // Only edits set it; undefined leaves the sheet's note untouched
  notes?: string
  // Only set when recording a return: the TransactionID of the purchase
  returnOf?: string
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
