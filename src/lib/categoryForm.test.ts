import { describe, expect, it } from 'vitest'
import type { BudgetDef, CategoryDef, Transaction } from '../types'
import {
  CATEGORY_NAME_MAX,
  categoryUsage,
  deleteBlockReason,
  kindChangeBlockReason,
  usageHint,
  usageLabel,
  validateCategoryDraft,
} from './categoryForm'

/**
 * Known example workspace:
 *   Groceries — 1 expense + 1 budget
 *   Rent      — 1 expense, no budget
 *   Salary    — 1 income
 *   Pets      — brand new, nothing points at it
 */
const categories: CategoryDef[] = [
  { name: 'Groceries', type: 'expense', color: '#10b981' },
  { name: 'Rent', type: 'expense', color: '#f59e0b' },
  { name: 'Salary', type: 'income', color: '#0ea5e9' },
]

const transactions: Transaction[] = [
  {
    id: 't1',
    date: '2026-10-05',
    type: 'expense',
    amount: 2500.75,
    category: 'Groceries',
    account: 'Bank',
    note: 'Weekly shop',
  },
  {
    id: 't2',
    date: '2026-10-01',
    type: 'expense',
    amount: 15000,
    category: 'Rent',
    account: 'Bank',
    note: 'October rent',
  },
  {
    id: 't3',
    date: '2026-10-01',
    type: 'income',
    amount: 50000,
    category: 'Salary',
    account: 'Bank',
    note: 'Salary',
  },
]

const budgets: BudgetDef[] = [
  { category: 'Groceries', monthlyLimit: 3000, month: '2026-10' },
]

const draft = (overrides: Partial<Parameters<typeof validateCategoryDraft>[0]> = {}) => ({
  name: 'Pet care',
  kind: 'expense' as const,
  color: '#64748B',
  ...overrides,
})

describe('validateCategoryDraft', () => {
  it('accepts a new category, trims the name and normalises the colour', () => {
    const result = validateCategoryDraft(draft({ name: '  Pet care  ' }), { categories })
    expect(result.errors).toEqual({})
    expect(result.values).toEqual({ name: 'Pet care', kind: 'expense', color: '#64748b' })
  })

  it('requires a name', () => {
    expect(validateCategoryDraft(draft({ name: '   ' }), { categories }).errors.name).toMatch(
      /Enter a name/,
    )
  })

  it('enforces the same 1–60 character limit as the database', () => {
    const ok = 'x'.repeat(CATEGORY_NAME_MAX)
    expect(validateCategoryDraft(draft({ name: ok }), { categories }).errors.name).toBeUndefined()
    expect(
      validateCategoryDraft(draft({ name: `${ok}x` }), { categories }).errors.name,
    ).toMatch(/60 characters/)
  })

  it('refuses a name another category already uses, ignoring case', () => {
    const result = validateCategoryDraft(draft({ name: 'groceries' }), { categories })
    expect(result.errors.name).toMatch(/already have a category called “Groceries”/)
    expect(result.values).toBeNull()
  })

  it('lets a category keep its own name, including a case change', () => {
    expect(
      validateCategoryDraft(draft({ name: 'Rent' }), { categories, editing: 'Rent' }).errors,
    ).toEqual({})
    expect(
      validateCategoryDraft(draft({ name: 'rent' }), { categories, editing: 'Rent' }).errors,
    ).toEqual({})
  })

  it('rejects an unknown type and a colour that is not hex', () => {
    const bad = validateCategoryDraft(draft({ kind: 'transfer' as never }), { categories })
    expect(bad.errors.kind).toMatch(/income or expense/)
    expect(validateCategoryDraft(draft({ color: 'red' }), { categories }).errors.color).toMatch(
      /palette/,
    )
  })
})

describe('categoryUsage', () => {
  it('counts the transactions and budgets pointing at a category', () => {
    expect(categoryUsage('Groceries', transactions, budgets)).toEqual({
      transactions: 1,
      budgets: 1,
    })
    expect(categoryUsage('Rent', transactions, budgets)).toEqual({ transactions: 1, budgets: 0 })
    expect(categoryUsage('Salary', transactions, budgets)).toEqual({ transactions: 1, budgets: 0 })
    expect(categoryUsage('Pets', transactions, budgets)).toEqual({ transactions: 0, budgets: 0 })
  })

  it('describes usage with correct plurals, or says it is unused', () => {
    expect(usageLabel(categoryUsage('Groceries', transactions, budgets))).toBe(
      '1 transaction · 1 budget',
    )
    expect(usageLabel(categoryUsage('Rent', transactions, budgets))).toBe('1 transaction')
    expect(usageLabel(categoryUsage('Pets', transactions, budgets))).toBe('Not used yet')
    expect(usageLabel({ transactions: 4, budgets: 2 })).toBe('4 transactions · 2 budgets')
  })
})

describe('deleteBlockReason', () => {
  it('is null when nothing references the category', () => {
    expect(deleteBlockReason('Pets', categoryUsage('Pets', transactions, budgets))).toBeNull()
  })

  it('explains exactly what is in the way', () => {
    expect(deleteBlockReason('Rent', categoryUsage('Rent', transactions, budgets))).toMatch(
      /“Rent” is used by 1 transaction/,
    )
    expect(deleteBlockReason('Groceries', categoryUsage('Groceries', transactions, budgets))).toBe(
      '“Groceries” is used by 1 transaction and 1 budget. Remove those first, then delete the category.',
    )
  })
})

describe('kindChangeBlockReason / usageHint', () => {
  it('allows re-typing an unused category', () => {
    expect(kindChangeBlockReason('Pets', categoryUsage('Pets', transactions, budgets))).toBeNull()
    expect(usageHint(categoryUsage('Pets', transactions, budgets))).toMatch(/can still change/)
  })

  it('locks the type while history points at the category', () => {
    expect(kindChangeBlockReason('Groceries', categoryUsage('Groceries', transactions, budgets))).toBe(
      '“Groceries” is used by 1 transaction and 1 budget, so its type can’t change.',
    )
    expect(usageHint(categoryUsage('Rent', transactions, budgets))).toMatch(
      /Locked while 1 transaction/,
    )
    expect(usageHint(categoryUsage('Rent', transactions, budgets))).toMatch(
      /1 transaction points at it/,
    )
  })
})
