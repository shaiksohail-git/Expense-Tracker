import type { Transaction } from '../types'

/**
 * The only place transaction records are created, changed or removed.
 * All four helpers return a new array (never mutate), which keeps React state
 * predictable and makes them trivial to unit test.
 */

let fallbackSeq = 0

/**
 * Unique id for a user-created transaction.
 * `crypto.randomUUID` needs a secure context (https or localhost); the
 * fallback keeps this working on plain http LAN addresses too.
 */
export function newTransactionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  fallbackSeq += 1
  return `tx-${Date.now()}-${fallbackSeq}`
}

/** Insert a validated transaction at the top of the list. */
export function addTransaction(
  transactions: Transaction[],
  values: Omit<Transaction, 'id'>,
): Transaction[] {
  return [{ ...values, id: newTransactionId() }, ...transactions]
}

/** Replace one transaction's fields, keeping its id (and list position). */
export function editTransaction(
  transactions: Transaction[],
  id: string,
  values: Omit<Transaction, 'id'>,
): Transaction[] {
  return transactions.map((tx) => (tx.id === id ? { ...values, id } : tx))
}

/** Remove one transaction. Returns the same list if the id is unknown. */
export function removeTransaction(transactions: Transaction[], id: string): Transaction[] {
  return transactions.filter((tx) => tx.id !== id)
}

/** Put a deleted transaction back (used by the Undo action). */
export function restoreTransaction(
  transactions: Transaction[],
  tx: Transaction,
): Transaction[] {
  if (transactions.some((t) => t.id === tx.id)) return transactions
  return [tx, ...transactions]
}
