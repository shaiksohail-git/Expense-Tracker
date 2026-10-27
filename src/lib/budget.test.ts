import { describe, expect, it } from 'vitest'
import type { BudgetDef, Transaction } from '../types'
import { budgetWarningForMonth, monthTitle, shiftMonthKey } from './finance'

const budgets: BudgetDef[] = [{ category: 'Groceries', monthlyLimit: 8000, month: '2026-10' }]

const tx = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: 't1',
  date: '2026-10-05',
  type: 'expense',
  amount: 1000,
  category: 'Groceries',
  account: 'Bank',
  note: 'Shop',
  ...overrides,
})

describe('monthTitle', () => {
  it('turns a month key into a readable month and year', () => {
    expect(monthTitle('2026-10')).toBe('October 2026')
    expect(monthTitle('2027-01')).toBe('January 2027')
  })
})

describe('shiftMonthKey', () => {
  it('moves one month at a time', () => {
    expect(shiftMonthKey('2026-10', 1)).toBe('2026-11')
    expect(shiftMonthKey('2026-10', -1)).toBe('2026-09')
  })

  it('crosses year boundaries in both directions', () => {
    expect(shiftMonthKey('2026-12', 1)).toBe('2027-01')
    expect(shiftMonthKey('2027-01', -1)).toBe('2026-12')
  })

  it('accepts larger jumps', () => {
    expect(shiftMonthKey('2026-01', 13)).toBe('2027-02')
    expect(shiftMonthKey('2026-01', -13)).toBe('2024-12')
  })
})

describe('budgetWarningForMonth', () => {
  it('stays quiet while spending is comfortable', () => {
    expect(budgetWarningForMonth('Groceries', '2026-10', budgets, [tx({ amount: 5000 })])).toBeNull()
  })

  it('warns at exactly 80%', () => {
    const warning = budgetWarningForMonth('Groceries', '2026-10', budgets, [
      tx({ amount: 6400 }),
    ])
    expect(warning?.tone).toBe('warn')
    expect(warning?.message).toContain('80%')
    expect(warning?.message).toContain('₹6,400.00')
    expect(warning?.message).toContain('October 2026')
  })

  it('reports the excess once over the limit', () => {
    const warning = budgetWarningForMonth('Groceries', '2026-10', budgets, [
      tx({ amount: 8500 }),
    ])
    expect(warning?.tone).toBe('over')
    expect(warning?.message).toBe(
      'Groceries is ₹500.00 over its ₹8,000.00 budget for October 2026.',
    )
  })

  it('only counts expenses in that category and month', () => {
    const warning = budgetWarningForMonth('Groceries', '2026-10', budgets, [
      tx({ amount: 1000 }),
      tx({ amount: 5000, type: 'income', category: 'Salary' }),
      tx({ amount: 5000, date: '2026-09-30' }),
      tx({ amount: 5000, category: 'Dining Out' }),
      tx({ amount: 5000, type: 'transfer', category: undefined }),
    ])
    expect(warning).toBeNull()
  })

  it('does nothing for categories without a budget', () => {
    expect(budgetWarningForMonth('Dining Out', '2026-10', budgets, [tx({ amount: 9999 })])).toBeNull()
    expect(budgetWarningForMonth(undefined, '2026-10', budgets, [tx()])).toBeNull()
  })

  it('only uses the budget set for that exact month', () => {
    const november: BudgetDef[] = [
      { category: 'Groceries', monthlyLimit: 8000, month: '2026-11' },
    ]
    expect(
      budgetWarningForMonth('Groceries', '2026-10', november, [tx({ amount: 9000 })]),
    ).toBeNull()

    const warning = budgetWarningForMonth('Groceries', '2026-11', november, [
      tx({ amount: 9000, date: '2026-11-03' }),
      tx({ amount: 9000, date: '2026-10-03' }),
    ])
    expect(warning?.tone).toBe('over')
    expect(warning?.message).toContain('November 2026')
    expect(warning?.message).toContain('₹1,000.00 over')
  })
})
