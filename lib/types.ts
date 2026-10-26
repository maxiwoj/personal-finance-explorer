export type Transaction = {
  timestamp: Date
  what: string
  category: string
  amountOriginal: number
  currency: string
  // Set when the Currency cell is empty: the row is in the default currency, which currency holds
  implicitCurrency?: boolean
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
}

// A pair of columns in the currencyDates tab. standard: a GOOGLEFINANCE rate against the default
// currency; custom: a fixed multiplier, e.g. 0.5 for a joint account's share
export type CurrencyDefinition = {
  code: string
  // 0-based index of the pair's first column
  column: number
  kind: 'standard' | 'custom'
  multiplier: number | null
  isDefault: boolean
}

export type CurrencyList = {
  // currencyDates!B1: every amount is converted to it
  defaultCurrency: string
  currencies: CurrencyDefinition[]
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
