import { describe, expect, it } from 'vitest'
import type { Transaction } from '../types'
import {
  DEFAULT_QUERY,
  activeFilterCount,
  categoryOptions,
  filterTransactions,
  isDefaultQuery,
  monthOptions,
  queryTransactions,
  sortTransactions,
  type TxQuery,
} from './transactionQuery'

const txs: Transaction[] = [
  {
    id: '1',
    date: '2026-10-01',
    type: 'income',
    amount: 85000,
    category: 'Salary',
    account: 'SBI Bank',
    note: 'Monthly salary',
  },
  {
    id: '2',
    date: '2026-10-05',
    type: 'expense',
    amount: 22000,
    category: 'Rent',
    account: 'HDFC Bank',
    note: 'House rent',
  },
  {
    id: '3',
    date: '2026-09-05',
    type: 'expense',
    amount: 649,
    category: 'Subscriptions',
    account: 'HDFC Bank',
    note: 'Streaming',
  },
  {
    id: '4',
    date: '2026-10-06',
    type: 'transfer',
    amount: 5000,
    account: 'SBI Bank',
    toAccount: 'HDFC Bank',
    note: 'Top up',
  },
]

const query = (patch: Partial<TxQuery> = {}): TxQuery => ({ ...DEFAULT_QUERY, ...patch })
const ids = (list: Transaction[]) => list.map((t) => t.id)

describe('filterTransactions', () => {
  it('filters by type', () => {
    expect(ids(filterTransactions(txs, query({ type: 'expense' })))).toEqual(['2', '3'])
    expect(ids(filterTransactions(txs, query({ type: 'transfer' })))).toEqual(['4'])
    expect(ids(filterTransactions(txs, query({ type: 'income' })))).toEqual(['1'])
  })

  it('filters by category', () => {
    expect(ids(filterTransactions(txs, query({ category: 'Rent' })))).toEqual(['2'])
    // Transfers have no category, so a category filter excludes them.
    expect(ids(filterTransactions(txs, query({ category: 'Salary' })))).toEqual(['1'])
  })

  it('filters by month', () => {
    expect(ids(filterTransactions(txs, query({ month: '2026-10' })))).toEqual(['1', '2', '4'])
    expect(ids(filterTransactions(txs, query({ month: '2026-09' })))).toEqual(['3'])
  })

  it('searches notes, categories, accounts, type and amount', () => {
    expect(ids(filterTransactions(txs, query({ search: 'rent' })))).toEqual(['2'])
    expect(ids(filterTransactions(txs, query({ search: 'subscript' })))).toEqual(['3'])
    expect(ids(filterTransactions(txs, query({ search: 'hdfc' })))).toEqual(['2', '3', '4'])
    expect(ids(filterTransactions(txs, query({ search: 'transfer' })))).toEqual(['4'])
    expect(ids(filterTransactions(txs, query({ search: '22000' })))).toEqual(['2'])
    expect(ids(filterTransactions(txs, query({ search: '5000' })))).toEqual(['1', '4']) // 85000 contains "5000" — amount search is substring-based
    expect(ids(filterTransactions(txs, query({ search: '85000' })))).toEqual(['1'])
  })

  it('is case-insensitive and ignores surrounding spaces', () => {
    expect(ids(filterTransactions(txs, query({ search: '  STREAMing  ' })))).toEqual(['3'])
  })

  it('combines filters', () => {
    expect(
      ids(filterTransactions(txs, query({ type: 'expense', month: '2026-10' }))),
    ).toEqual(['2'])
    expect(
      ids(filterTransactions(txs, query({ type: 'expense', search: 'hdfc', month: '2026-09' }))),
    ).toEqual(['3'])
  })

  it('returns nothing when filters cannot overlap', () => {
    expect(filterTransactions(txs, query({ type: 'income', month: '2026-09' }))).toEqual([])
  })

  it('returns everything for the default query', () => {
    expect(filterTransactions(txs, DEFAULT_QUERY)).toHaveLength(txs.length)
  })
})

describe('sortTransactions', () => {
  it('sorts newest and oldest first without mutating the input', () => {
    const original = ids(txs)
    expect(ids(sortTransactions(txs, 'date-desc'))).toEqual(['4', '2', '1', '3'])
    expect(ids(sortTransactions(txs, 'date-asc'))).toEqual(['3', '1', '2', '4'])
    expect(ids(txs)).toEqual(original)
  })

  it('sorts by amount in both directions', () => {
    expect(ids(sortTransactions(txs, 'amount-desc'))).toEqual(['1', '2', '4', '3'])
    expect(ids(sortTransactions(txs, 'amount-asc'))).toEqual(['3', '4', '2', '1'])
  })
})

describe('queryTransactions', () => {
  it('filters first, then sorts the filtered list', () => {
    expect(ids(queryTransactions(txs, query({ search: 'hdfc', sort: 'amount-desc' })))).toEqual([
      '2',
      '4',
      '3',
    ])
  })

  it('applies the default newest-first order', () => {
    expect(ids(queryTransactions(txs, DEFAULT_QUERY))).toEqual(['4', '2', '1', '3'])
  })
})

describe('query helpers', () => {
  it('knows when filters are untouched', () => {
    expect(isDefaultQuery(DEFAULT_QUERY)).toBe(true)
    expect(isDefaultQuery(query({ search: 'rent' }))).toBe(false)
    // Changing the sort keeps the "Clear all filters" button visible, so it
    // can reset the order too.
    expect(isDefaultQuery(query({ sort: 'amount-asc' }))).toBe(false)
  })

  it('counts active filters but not the sort choice', () => {
    expect(activeFilterCount(DEFAULT_QUERY)).toBe(0)
    expect(
      activeFilterCount(query({ search: 'rent', type: 'expense', category: 'Rent', month: '2026-10' })),
    ).toBe(4)
    expect(activeFilterCount(query({ sort: 'amount-asc' }))).toBe(0)
  })

  it('lists months present in the data, newest first', () => {
    expect(monthOptions(txs).map((m) => m.value)).toEqual(['2026-10', '2026-09'])
    expect(monthOptions([])).toEqual([])
  })

  it('lists categories in use, alphabetically and without duplicates', () => {
    expect(categoryOptions(txs)).toEqual(['Rent', 'Salary', 'Subscriptions'])
  })
})
