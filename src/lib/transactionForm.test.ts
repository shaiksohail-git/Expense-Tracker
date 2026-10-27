import { describe, expect, it } from 'vitest'
import type { AccountDef, CategoryDef, Transaction } from '../types'
import {
  NOTE_MAX,
  validateDraft,
  type TransactionDraft,
  type ValidationContext,
} from './transactionForm'

// Small helpers keep the assertions readable.
const draftOf = (fields: TransactionDraft): TransactionDraft => fields
const amountOf = (values: Omit<Transaction, 'id'> | null): number => values?.amount ?? NaN
const categoryOf = (values: Omit<Transaction, 'id'> | null): string | undefined =>
  values?.category
const makeContext = (context: ValidationContext): ValidationContext => context

const accounts: AccountDef[] = [
  { name: 'SBI Bank', openingBalance: 10000 },
  { name: 'Cash', openingBalance: 500 },
]

const categories: CategoryDef[] = [
  { name: 'Salary', type: 'income', color: '#0ea5e9' },
  { name: 'Groceries', type: 'expense', color: '#10b981' },
]

const today = new Date(2026, 9, 23) // 23 Oct 2026, local time

function ctx(transactions: Transaction[] = []) {
  return makeContext({ categories, accounts, transactions, today })
}

function draft(overrides: Partial<TransactionDraft> = {}): TransactionDraft {
  return draftOf({
    type: 'expense',
    amount: '250',
    date: '2026-10-01',
    category: 'Groceries',
    account: 'SBI Bank',
    toAccount: '',
    note: '',
    ...overrides,
  })
}

describe('validateDraft — amounts', () => {
  it('accepts a plain positive amount and normalises the record', () => {
    const result = validateDraft(draft({ amount: '1200.50' }), ctx())
    expect(result.errors).toEqual({})
    expect(result.values).not.toBeNull()
    expect(amountOf(result.values)).toBe(1200.5)
  })

  it('rejects an empty amount', () => {
    expect(validateDraft(draft({ amount: '   ' }), ctx()).errors.amount).toBe('Enter an amount.')
  })

  it('rejects zero and negative amounts', () => {
    expect(validateDraft(draft({ amount: '0' }), ctx()).errors.amount).toBe(
      'Amount must be more than ₹0.',
    )
    expect(validateDraft(draft({ amount: '0.00' }), ctx()).errors.amount).toBe(
      'Amount must be more than ₹0.',
    )
    expect(validateDraft(draft({ amount: '-500' }), ctx()).errors.amount).toMatch(/digits only/)
  })

  it('rejects text, separators and more than two decimals', () => {
    for (const bad of ['abc', '1,200', '12.345', '1e5', '₹500', '12.']) {
      expect(validateDraft(draft({ amount: bad }), ctx()).errors.amount).toMatch(/digits only/)
    }
  })

  it('rejects absurdly large amounts', () => {
    expect(validateDraft(draft({ amount: '100000001' }), ctx()).errors.amount).toMatch(
      /₹10,00,00,000/,
    )
  })

  it('keeps the entered amount when the note is blank', () => {
    const result = validateDraft(draft({ note: '   ' }), ctx())
    expect(result.values?.note).toBe('Groceries')
  })
})

describe('validateDraft — dates', () => {
  it('rejects an empty date', () => {
    expect(validateDraft(draft({ date: '' }), ctx()).errors.date).toBe('Pick a date.')
  })

  it('rejects impossible calendar dates', () => {
    expect(validateDraft(draft({ date: '2026-02-31' }), ctx()).errors.date).toMatch(
      /real date/,
    )
    expect(validateDraft(draft({ date: 'yesterday' }), ctx()).errors.date).toMatch(/real date/)
  })

  it('accepts today and rejects dates more than a year ahead', () => {
    expect(validateDraft(draft({ date: '2026-10-23' }), ctx()).errors.date).toBeUndefined()
    expect(validateDraft(draft({ date: '2099-01-01' }), ctx()).errors.date).toMatch(
      /too far in the future/,
    )
  })
})

describe('validateDraft — categories and accounts', () => {
  it('requires a category for expenses', () => {
    expect(validateDraft(draft({ category: '' }), ctx()).errors.category).toBe(
      'Choose a category.',
    )
  })

  it('rejects a category that belongs to the other type', () => {
    // "Salary" is an income category; an expense cannot use it.
    expect(validateDraft(draft({ category: 'Salary' }), ctx()).errors.category).toBe(
      'Pick a category that matches this transaction type.',
    )
  })

  it('requires an account that still exists', () => {
    expect(validateDraft(draft({ account: 'Closed Bank' }), ctx()).errors.account).toBe(
      'That account is no longer available. Pick another one.',
    )
    expect(validateDraft(draft({ account: '' }), ctx()).errors.account).toBe('Choose an account.')
  })

  it('allows an expense larger than the account balance (tracking reality)', () => {
    const result = validateDraft(draft({ amount: '99999' }), ctx())
    expect(result.errors).toEqual({})
    expect(result.values).not.toBeNull()
  })
})

describe('validateDraft — transfers', () => {
  const transfer = (overrides: Partial<TransactionDraft> = {}) =>
    draft({
      type: 'transfer',
      amount: '100',
      category: '',
      account: 'SBI Bank',
      toAccount: 'Cash',
      ...overrides,
    })

  it('accepts a valid transfer and drops the category', () => {
    const result = validateDraft(transfer(), ctx())
    expect(result.errors).toEqual({})
    expect(categoryOf(result.values)).toBeUndefined()
    expect(result.values?.toAccount).toBe('Cash')
    expect(result.values?.note).toBe('Transfer')
  })

  it('rejects sending money to the same account', () => {
    expect(validateDraft(transfer({ toAccount: 'SBI Bank' }), ctx()).errors.toAccount).toMatch(
      /two different accounts/,
    )
  })

  it('requires a destination account', () => {
    expect(validateDraft(transfer({ toAccount: '' }), ctx()).errors.toAccount).toBe(
      'Choose the account receiving the money.',
    )
  })

  it('rejects a transfer larger than the money available', () => {
    // SBI Bank opening balance is ₹10,000.
    const result = validateDraft(transfer({ amount: '10001' }), ctx())
    expect(result.errors.amount).toBe('Not enough in SBI Bank: ₹10,000.00 available.')
    expect(result.values).toBeNull()
  })

  it('accepts a transfer for exactly the available balance', () => {
    expect(validateDraft(transfer({ amount: '10000' }), ctx()).errors.amount).toBeUndefined()
  })

  it('counts existing spending when checking availability', () => {
    const spent: Transaction[] = [
      {
        id: 'spent-1',
        date: '2026-10-02',
        type: 'expense',
        amount: 9500,
        category: 'Groceries',
        account: 'SBI Bank',
        note: 'Bulk groceries',
      },
    ]
    const result = validateDraft(transfer({ amount: '600' }), ctx(spent))
    expect(result.errors.amount).toMatch(/Not enough in SBI Bank/)
  })
})

describe('validateDraft — notes', () => {
  it('rejects notes that are too long', () => {
    const result = validateDraft(draft({ note: 'a'.repeat(NOTE_MAX + 1) }), ctx())
    expect(result.errors.note).toMatch(new RegExp(`under ${NOTE_MAX} characters`))
  })

  it('accepts a note at the limit and trims padding', () => {
    const result = validateDraft(draft({ note: `  ${'a'.repeat(NOTE_MAX)}  ` }), ctx())
    expect(result.errors.note).toBeUndefined()
    expect(result.values?.note).toHaveLength(NOTE_MAX)
  })
})
