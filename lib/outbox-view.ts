// How queued transactions (lib/outbox-sync.ts) show in the UI before they are in the sheet. Kept
// free of runtime imports so `node --test` can load it.
import type { OutboxEntry } from './outbox-sync'
import type { CurrencyList, Transaction } from './types'

function round(value: number) {
  return Math.round(value * 100) / 100
}

// As in its row, before returns are subtracted (lib/returns.ts, not imported to stay loadable by tests)
function recordedAmount(transaction: Transaction) {
  return transaction.recorded ?? { amountOriginal: transaction.amountOriginal, amountPLN: transaction.amountPLN }
}

// The sheet converts amounts with its rate formulas once the row is added. Until then: the
// default currency as is, a custom currency by its multiplier, others at the rate of the latest
// row in that currency; 0 when there is none.
export function estimateAmountPLN(entry: OutboxEntry, transactions: Transaction[], defaultCurrency: string, currencies: CurrencyList | null): number {
  const { amount, currency } = entry.input
  if (!currency || currency === defaultCurrency) return amount

  const custom = currencies?.currencies.find((c) => c.code === currency && c.kind === 'custom' && c.multiplier !== null)
  if (custom?.multiplier != null) return round(amount * custom.multiplier)

  let latest: Transaction | null = null
  for (const t of transactions) {
    if (t.currency !== currency || t.unsynced || recordedAmount(t).amountOriginal === 0) continue
    if (!latest || t.timestamp.getTime() > latest.timestamp.getTime()) latest = t
  }
  if (!latest) return 0
  const recorded = recordedAmount(latest)
  return round(amount * recorded.amountPLN / recorded.amountOriginal)
}

// unsynced: false for an entry that has just synced and shows until the transactions refetch
export function outboxTransaction(entry: OutboxEntry, amountPLN: number, unsynced = true): Transaction {
  const { timestamp, what, category, amount, currency } = entry.input
  return {
    timestamp,
    what,
    category: category.toLowerCase(),
    amountOriginal: amount,
    currency,
    amountPLN,
    monthYear: `${timestamp.getMonth() + 1}_${timestamp.getFullYear()}`,
    monthName: '',
    transactionId: entry.id,
    notes: entry.input.notes ?? '',
    returnOf: '',
    ...(unsynced ? { unsynced: { status: entry.status, error: entry.lastError } } : {}),
  }
}

// Adds the queued entries, and the ones that just synced, to the transactions. An entry whose
// TransactionID is already in them is the row itself, so it isn't added twice.
export function mergeOutbox(
  transactions: Transaction[],
  queued: OutboxEntry[],
  synced: OutboxEntry[],
  defaultCurrency: string,
  currencies: CurrencyList | null
): Transaction[] {
  const ids = new Set(transactions.map((t) => t.transactionId))
  const extra: Transaction[] = []
  const add = (entry: OutboxEntry, unsynced: boolean) => {
    if (ids.has(entry.id)) return
    ids.add(entry.id)
    extra.push(outboxTransaction(entry, estimateAmountPLN(entry, transactions, defaultCurrency, currencies), unsynced))
  }
  queued.forEach((entry) => add(entry, true))
  synced.forEach((entry) => add(entry, false))
  return extra.length === 0 ? transactions : [...transactions, ...extra]
}

// Entries gone from the queue since the last read that the sync sent. A failed entry only leaves
// it when the user deletes it.
export function leftQueue(previous: OutboxEntry[], next: OutboxEntry[]): OutboxEntry[] {
  const remaining = new Set(next.map((entry) => entry.id))
  return previous.filter((entry) => !remaining.has(entry.id) && entry.status !== 'failed')
}

// Worth telling the user about: it can't sync now, or an attempt failed. A new entry that syncs
// right away online isn't.
export function isStalled(entry: OutboxEntry, online: boolean): boolean {
  return !online || entry.status === 'failed' || entry.lastError !== null
}
