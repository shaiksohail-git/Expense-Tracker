import type { Transaction, TxType } from '../types'

/**
 * Search / filter / sort as plain functions.
 * The view only renders what these return, and they are unit-tested.
 */

export type TypeFilter = 'all' | TxType
export type SortKey = 'date-desc' | 'date-asc' | 'amount-desc' | 'amount-asc'

export interface TxQuery {
  search: string
  type: TypeFilter
  /** Category name, or 'all' */
  category: string
  /** 'YYYY-MM', or 'all' */
  month: string
  sort: SortKey
}

export const DEFAULT_QUERY: TxQuery = {
  search: '',
  type: 'all',
  category: 'all',
  month: 'all',
  sort: 'date-desc',
}

export const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: 'date-desc', label: 'Newest first' },
  { value: 'date-asc', label: 'Oldest first' },
  { value: 'amount-desc', label: 'Amount: high to low' },
  { value: 'amount-asc', label: 'Amount: low to high' },
]

const TYPE_WORDS: Record<TxType, string> = {
  income: 'income credit received',
  expense: 'expense spending paid',
  transfer: 'transfer moved',
}

/**
 * Free-text search across the fields a person would type:
 * note, category, account names, type and the amount itself.
 */
export function matchesSearch(tx: Transaction, term: string): boolean {
  const haystack = [
    tx.note,
    tx.category ?? '',
    tx.account,
    tx.toAccount ?? '',
    tx.type,
    TYPE_WORDS[tx.type],
    tx.date,
    String(tx.amount),
  ]
    .join(' ')
    .toLowerCase()
  return haystack.includes(term)
}

export function filterTransactions(txs: Transaction[], query: TxQuery): Transaction[] {
  const term = query.search.trim().toLowerCase()
  return txs.filter((tx) => {
    if (query.type !== 'all' && tx.type !== query.type) return false
    if (query.category !== 'all' && tx.category !== query.category) return false
    if (query.month !== 'all' && !tx.date.startsWith(query.month)) return false
    if (term && !matchesSearch(tx, term)) return false
    return true
  })
}

export function sortTransactions(txs: Transaction[], sort: SortKey): Transaction[] {
  // `sort` is stable in modern JS, so equal items keep their existing order.
  const copy = [...txs]
  switch (sort) {
    case 'date-asc':
      return copy.sort((a, b) => a.date.localeCompare(b.date))
    case 'amount-desc':
      return copy.sort((a, b) => b.amount - a.amount)
    case 'amount-asc':
      return copy.sort((a, b) => a.amount - b.amount)
    case 'date-desc':
    default:
      return copy.sort((a, b) => b.date.localeCompare(a.date))
  }
}

export function queryTransactions(txs: Transaction[], query: TxQuery): Transaction[] {
  return sortTransactions(filterTransactions(txs, query), query.sort)
}

export function isDefaultQuery(query: TxQuery): boolean {
  return (
    query.search === '' &&
    query.type === 'all' &&
    query.category === 'all' &&
    query.month === 'all' &&
    query.sort === DEFAULT_QUERY.sort
  )
}

/** How many filters (not counting sort) are narrowing the list. */
export function activeFilterCount(query: TxQuery): number {
  let n = 0
  if (query.search.trim()) n += 1
  if (query.type !== 'all') n += 1
  if (query.category !== 'all') n += 1
  if (query.month !== 'all') n += 1
  return n
}

export interface MonthOption {
  value: string
  label: string
}

/** Distinct months present in the data, newest first, e.g. "October 2026". */
export function monthOptions(txs: Transaction[]): MonthOption[] {
  const keys = [...new Set(txs.map((t) => t.date.slice(0, 7)))].sort().reverse()
  return keys.map((key) => ({
    value: key,
    label: new Date(`${key}-01T00:00:00`).toLocaleString('en-IN', {
      month: 'long',
      year: 'numeric',
    }),
  }))
}

/** Categories actually used by the data, for the category filter. */
export function categoryOptions(txs: Transaction[]): string[] {
  return [...new Set(txs.map((t) => t.category).filter((c): c is string => Boolean(c)))].sort(
    (a, b) => a.localeCompare(b),
  )
}
