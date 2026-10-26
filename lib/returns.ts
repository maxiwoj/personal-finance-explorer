import type { Transaction } from './types'

function round(value: number) {
  return Math.round(value * 100) / 100
}

// The purchase's amounts as stored in its row, before any returns are subtracted
export function recordedAmount(transaction: Transaction) {
  return transaction.recorded ?? { amountOriginal: transaction.amountOriginal, amountPLN: transaction.amountPLN }
}

// How much of the purchase, in its own currency, can still be returned
export function returnableAmount(transaction: Transaction) {
  return transaction.returnOf ? 0 : Math.max(0, round(transaction.amountOriginal))
}

// Folds each return into the purchase it links to, so the purchase counts at its net amount in its own
// month and category, and the return rows drop out of lists and totals. A return whose purchase is
// not in the list (e.g. older than the recent tab) stays a row of its own.
export function linkReturns(transactions: Transaction[]): Transaction[] {
  const purchaseIds = new Set(transactions.filter(t => !t.returnOf).map(t => t.transactionId))
  const returnsByPurchase = new Map<string, Transaction[]>()

  transactions.forEach(t => {
    if (t.returnOf && purchaseIds.has(t.returnOf)) {
      returnsByPurchase.set(t.returnOf, [...(returnsByPurchase.get(t.returnOf) ?? []), t])
    }
  })

  if (returnsByPurchase.size === 0) return transactions

  return transactions.flatMap(t => {
    if (t.returnOf && purchaseIds.has(t.returnOf)) return []

    const returns = returnsByPurchase.get(t.transactionId)
    if (!returns) return [t]

    return [{
      ...t,
      // Returns are recorded in the purchase's currency, so their original amounts add up
      amountOriginal: round(returns.reduce((sum, r) => sum + r.amountOriginal, t.amountOriginal)),
      amountPLN: round(returns.reduce((sum, r) => sum + r.amountPLN, t.amountPLN)),
      returns: [...returns].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime()),
      recorded: { amountOriginal: t.amountOriginal, amountPLN: t.amountPLN },
    }]
  })
}
