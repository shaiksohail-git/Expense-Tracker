import { describe, expect, it } from 'vitest'
import type { Transaction } from '../../types'
import {
  budgetToRow,
  buildRefs,
  friendlyDbError,
  mapAccounts,
  mapBudgets,
  mapCategories,
  mapTransactionRow,
  toNumber,
  transactionToRow,
  type AccountRow,
  type CategoryRow,
} from './rows'

const accountRows: AccountRow[] = [
  { id: 'a1', name: 'Bank', opening_balance: '0.00' },
  { id: 'a2', name: 'Cash', opening_balance: 250.5 },
  { id: 'a3', name: 'Wallet', opening_balance: '1000' },
]

const categoryRows: CategoryRow[] = [
  { id: 'c1', name: 'Salary', kind: 'income', color: '#0ea5e9' },
  { id: 'c2', name: 'Groceries', kind: 'expense', color: '#10b981' },
]

const refs = buildRefs(accountRows, categoryRows)

const expense = (overrides: Partial<Omit<Transaction, 'id'>> = {}): Omit<Transaction, 'id'> => ({
  date: '2026-10-05',
  type: 'expense',
  amount: 1250.75,
  category: 'Groceries',
  account: 'Bank',
  note: 'Weekly shop',
  ...overrides,
})

describe('toNumber', () => {
  it('accepts PostgREST numeric strings and numbers', () => {
    expect(toNumber('1250.75')).toBe(1250.75)
    expect(toNumber(42)).toBe(42)
  })

  it('never returns NaN', () => {
    expect(toNumber('not-a-number')).toBe(0)
  })
})

describe('mapAccounts / mapCategories', () => {
  it('converts opening balances and sorts by name', () => {
    expect(mapAccounts(accountRows)).toEqual([
      { name: 'Bank', openingBalance: 0 },
      { name: 'Cash', openingBalance: 250.5 },
      { name: 'Wallet', openingBalance: 1000 },
    ])
  })

  it('maps the database kind to the app type', () => {
    expect(mapCategories(categoryRows)).toEqual([
      { name: 'Groceries', type: 'expense', color: '#10b981' },
      { name: 'Salary', type: 'income', color: '#0ea5e9' },
    ])
  })
})

describe('mapTransactionRow', () => {
  it('resolves category and account names', () => {
    const mapped = mapTransactionRow(
      {
        id: 't1',
        occurred_on: '2026-10-05',
        type: 'expense',
        amount: '1250.75',
        category_id: 'c2',
        account_id: 'a1',
        to_account_id: null,
        note: 'Weekly shop',
      },
      refs,
    )

    expect(mapped).toEqual({
      id: 't1',
      date: '2026-10-05',
      type: 'expense',
      amount: 1250.75,
      category: 'Groceries',
      account: 'Bank',
      toAccount: undefined,
      note: 'Weekly shop',
    })
  })

  it('keeps both accounts on a transfer and omits the category', () => {
    const mapped = mapTransactionRow(
      {
        id: 't2',
        occurred_on: '2026-10-06',
        type: 'transfer',
        amount: 5000,
        category_id: null,
        account_id: 'a1',
        to_account_id: 'a2',
        note: 'Top up',
      },
      refs,
    )
    expect(mapped.category).toBeUndefined()
    expect(mapped.account).toBe('Bank')
    expect(mapped.toAccount).toBe('Cash')
  })
})

describe('mapBudgets', () => {
  it('turns category ids into names and date months into keys', () => {
    expect(
      mapBudgets([{ category_id: 'c2', monthly_limit: '8000.00', month: '2026-10-01' }], refs),
    ).toEqual([{ category: 'Groceries', monthlyLimit: 8000, month: '2026-10' }])
  })

  it('keeps months apart and orders them oldest first', () => {
    expect(
      mapBudgets(
        [
          { category_id: 'c2', monthly_limit: 9000, month: '2026-11-01' },
          { category_id: 'c2', monthly_limit: 8000, month: '2026-10-01' },
        ],
        refs,
      ),
    ).toEqual([
      { category: 'Groceries', monthlyLimit: 8000, month: '2026-10' },
      { category: 'Groceries', monthlyLimit: 9000, month: '2026-11' },
    ])
  })
})

describe('budgetToRow', () => {
  it('resolves the category and turns the month into a date', () => {
    expect(budgetToRow('Groceries', 8000, '2026-10', refs)).toEqual({
      category_id: 'c2',
      monthly_limit: 8000,
      month: '2026-10-01',
    })
  })

  it('refuses a category that no longer exists', () => {
    expect(() => budgetToRow('Deleted', 8000, '2026-10', refs)).toThrow(
      /“Deleted” no longer exists/,
    )
  })

  it('refuses a malformed month instead of writing a bad date', () => {
    expect(() => budgetToRow('Groceries', 8000, '2026-13', refs)).toThrow(/month is not valid/)
    expect(() => budgetToRow('Groceries', 8000, 'October', refs)).toThrow(/month is not valid/)
  })
})

describe('transactionToRow', () => {
  it('writes an expense with ids and no destination account', () => {
    expect(transactionToRow(expense(), refs)).toEqual({
      occurred_on: '2026-10-05',
      type: 'expense',
      amount: 1250.75,
      category_id: 'c2',
      account_id: 'a1',
      to_account_id: null,
      note: 'Weekly shop',
    })
  })

  it('writes a transfer with two accounts and no category', () => {
    const row = transactionToRow(
      expense({ type: 'transfer', category: undefined, account: 'Bank', toAccount: 'Cash' }),
      refs,
    )
    expect(row.category_id).toBeNull()
    expect(row.account_id).toBe('a1')
    expect(row.to_account_id).toBe('a2')
  })

  it('refuses a name that no longer exists instead of writing nulls', () => {
    expect(() => transactionToRow(expense({ account: 'Closed Bank' }), refs)).toThrow(
      /“Closed Bank” no longer exists/,
    )
    expect(() => transactionToRow(expense({ category: 'Deleted' }), refs)).toThrow(
      /“Deleted” no longer exists/,
    )
    expect(() =>
      transactionToRow(expense({ type: 'transfer', toAccount: undefined }), refs),
    ).toThrow(/no longer exists/)
  })
})

describe('friendlyDbError', () => {
  it('explains each important Postgres failure', () => {
    expect(friendlyDbError({ code: '23505' })).toMatch(/already exists/)
    expect(friendlyDbError({ code: '23503' })).toMatch(/no longer exists/)
    expect(friendlyDbError({ code: '23514' })).toMatch(/not allowed/)
    expect(friendlyDbError({ code: '42501' })).toMatch(/permission/)
    expect(friendlyDbError({ code: 'PGRST301' })).toMatch(/session expired/)
    expect(friendlyDbError({ message: 'Category type must match the transaction type' })).toMatch(
      /does not match/,
    )
    expect(friendlyDbError({ message: 'Failed to fetch' })).toMatch(/Could not reach the server/)
  })

  it('falls back to a safe generic sentence', () => {
    expect(friendlyDbError({ message: 'something unexpected', code: 'XX000' })).toBe(
      'Something went wrong saving to the database. Please try again.',
    )
    expect(friendlyDbError(null)).toMatch(/Something went wrong/)
  })
})
