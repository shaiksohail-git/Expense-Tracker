import { describe, expect, it } from 'vitest'
import type { BudgetDef, CategoryDef, Transaction } from '../types'
import {
  budgetProgressForMonth,
  budgetStatus,
  budgetWarningForMonth,
  filterByDateRange,
  isISODate,
  lastDayOfMonth,
  monthsInRange,
  presetRange,
  savingsSummary,
  spendingByCategory,
  spendingByCategoryRange,
  summariseRange,
  sumOf,
  unbudgetedSpendingForMonth,
} from './finance'

const tx = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: 't',
  date: '2026-10-05',
  type: 'expense',
  amount: 100,
  category: 'Groceries',
  account: 'Bank',
  note: 'Test',
  ...overrides,
})

const budgets: BudgetDef[] = [
  { category: 'Groceries', monthlyLimit: 8000, month: '2026-10' },
  { category: 'Rent', monthlyLimit: 15000, month: '2026-10' },
]

function expectThrows(fn: () => unknown, pattern: RegExp) {
  let error: unknown
  try {
    fn()
  } catch (caught) {
    error = caught
  }
  expect(error).toBeDefined()
  expect(String((error as Error)?.message ?? '')).toMatch(pattern)
}

describe('ISO date helpers', () => {
  it('accepts real dates and rejects impossible ones', () => {
    expect(isISODate('2026-10-31')).toBe(true)
    expect(isISODate('2028-02-29')).toBe(true)
    expect(isISODate('2026-02-29')).toBe(false)
    expect(isISODate('2026-02-31')).toBe(false)
    expect(isISODate('2026-13-01')).toBe(false)
    expect(isISODate('26-10-01')).toBe(false)
  })

  it('finds the last day of a month, including leap years', () => {
    expect(lastDayOfMonth('2026-02')).toBe('2026-02-28')
    expect(lastDayOfMonth('2028-02')).toBe('2028-02-29')
    expect(lastDayOfMonth('2026-10')).toBe('2026-10-31')
    expectThrows(() => lastDayOfMonth('2026-13'), /valid month/i)
  })

  it('lists every month touched by a range', () => {
    expect(monthsInRange('2026-10-01', '2026-10-31')).toEqual(['2026-10'])
    expect(monthsInRange('2025-12-15', '2026-02-02')).toEqual([
      '2025-12',
      '2026-01',
      '2026-02',
    ])
    expectThrows(() => monthsInRange('2026-11-01', '2026-10-01'), /start.*before.*end/i)
  })
})

describe('presetRange', () => {
  const today = new Date(2026, 9, 26) // 26 October 2026, local time

  it('covers whole calendar months, not a rolling number of days', () => {
    expect(presetRange('this-month', today)).toEqual({
      from: '2026-10-01',
      to: '2026-10-31',
    })
    expect(presetRange('last-3-months', today)).toEqual({
      from: '2026-08-01',
      to: '2026-10-31',
    })
    expect(presetRange('last-6-months', today)).toEqual({
      from: '2026-05-01',
      to: '2026-10-31',
    })
  })

  it('handles the start of a year', () => {
    const january = new Date(2026, 0, 3)
    expect(presetRange('last-3-months', january)).toEqual({
      from: '2025-11-01',
      to: '2026-01-31',
    })
    expect(presetRange('this-year', january)).toEqual({
      from: '2026-01-01',
      to: '2026-12-31',
    })
  })
})

describe('filterByDateRange', () => {
  const rows = [
    tx({ id: 'before', date: '2026-09-30' }),
    tx({ id: 'first', date: '2026-10-01' }),
    tx({ id: 'middle', date: '2026-10-15' }),
    tx({ id: 'last', date: '2026-10-31' }),
    tx({ id: 'after', date: '2026-11-01' }),
  ]

  it('includes both ends of the range and excludes the days around it', () => {
    expect(filterByDateRange(rows, '2026-10-01', '2026-10-31').map((r) => r.id)).toEqual([
      'first',
      'middle',
      'last',
    ])
  })

  it('supports a single-day range', () => {
    expect(filterByDateRange(rows, '2026-10-15', '2026-10-15').map((r) => r.id)).toEqual([
      'middle',
    ])
  })

  it('refuses an invalid or backwards range instead of guessing', () => {
    expectThrows(() => filterByDateRange(rows, '2026-10-31', '2026-10-01'), /start.*before.*end/i)
    expectThrows(() => filterByDateRange(rows, '2026-02-30', '2026-03-01'), /valid date range/i)
  })
})

describe('summariseRange', () => {
  const rows = [
    tx({ id: 'before', date: '2026-09-30', amount: 50 }),
    tx({ id: 'first', date: '2026-10-01', amount: 100.1 }),
    tx({ id: 'income', date: '2026-10-15', type: 'income', amount: 1000, category: 'Salary' }),
    tx({ id: 'transfer', date: '2026-10-20', type: 'transfer', amount: 500, category: undefined }),
    tx({ id: 'last', date: '2026-10-31', amount: 200 }),
    tx({ id: 'after', date: '2026-11-01', amount: 300 }),
  ]
  const summary = summariseRange(rows, '2026-10-01', '2026-10-31')

  it('uses the same totals as the individual finance functions', () => {
    const filtered = filterByDateRange(rows, '2026-10-01', '2026-10-31')
    expect(summary.income).toBe(sumOf(filtered, 'income'))
    expect(summary.expense).toBe(sumOf(filtered, 'expense'))
    expect(summary.savings).toBe(699.9)
    expect(summary.transfers).toBe(500)
    expect(summary.transactionCount).toBe(4)
    expect(summary.incomeCount).toBe(1)
    expect(summary.expenseCount).toBe(2)
    expect(summary.transferCount).toBe(1)
  })

  it('derives monthly points from the same filtered rows', () => {
    expect(summary.months).toEqual([
      { key: '2026-10', label: 'Oct', income: 1000, expense: 300.1, savings: 699.9 },
    ])
    const totalsFromMonths = savingsSummary(summary.months)
    expect(totalsFromMonths.totalIncome).toBe(summary.income)
    expect(totalsFromMonths.totalExpense).toBe(summary.expense)
    expect(totalsFromMonths.totalSavings).toBe(summary.savings)
    expect(totalsFromMonths.averageMonthlySavings).toBe(summary.averageMonthlySavings)
  })

  it('excludes transfers from income, expenses, savings and category spending', () => {
    expect(summary.categorySpend).toEqual([{ name: 'Groceries', value: 300.1 }])
    expect(summary.categorySpend.some((row) => row.name === 'Salary')).toBe(false)
  })

  it('returns honest zeroes for an empty range', () => {
    const empty = summariseRange([], '2026-10-01', '2026-10-31')
    expect(empty).toMatchObject({
      income: 0,
      expense: 0,
      savings: 0,
      transfers: 0,
      transactionCount: 0,
      averageMonthlySavings: 0,
      categorySpend: [],
    })
    expect(empty.months).toEqual([
      { key: '2026-10', label: 'Oct', income: 0, expense: 0, savings: 0 },
    ])
  })

  it('respects partial months at both ends of a custom range', () => {
    const partial = summariseRange(rows, '2026-10-15', '2026-11-05')
    expect(partial.months).toEqual([
      { key: '2026-10', label: 'Oct', income: 1000, expense: 200, savings: 800 },
      { key: '2026-11', label: 'Nov', income: 0, expense: 300, savings: -300 },
    ])
    expect(partial.transactionCount).toBe(4) // income, transfer and two expenses
    expect(partial.categorySpend).toEqual([{ name: 'Groceries', value: 500 }])
  })

  it('adds a year to labels when a range crosses New Year', () => {
    const crossYear = summariseRange(
      [
        tx({ date: '2025-12-20', amount: 10 }),
        tx({ date: '2026-01-10', amount: 20 }),
      ],
      '2025-12-01',
      '2026-01-31',
    )
    expect(crossYear.months.map((month) => month.label)).toEqual(["Dec '25", "Jan '26"])
  })

  it('handles a leap day inside the range', () => {
    const leap = summariseRange(
      [tx({ date: '2028-02-29', amount: 42.5 })],
      '2028-02-01',
      '2028-02-29',
    )
    expect(leap.expense).toBe(42.5)
    expect(leap.transactionCount).toBe(1)
  })

  it('totals a large transaction list exactly', () => {
    const many: Transaction[] = Array.from({ length: 20_000 }, (_, index) =>
      tx({
        id: `bulk-${index}`,
        date: '2026-10-15',
        type: index % 2 === 0 ? 'expense' : 'income',
        amount: index % 2 === 0 ? 0.01 : 0.02,
        category: index % 2 === 0 ? 'Groceries' : 'Salary',
      }),
    )
    const summaryLarge = summariseRange(many, '2026-10-01', '2026-10-31')
    expect(summaryLarge.expense).toBe(100)
    expect(summaryLarge.income).toBe(200)
    expect(summaryLarge.savings).toBe(100)
    expect(summaryLarge.transactionCount).toBe(20_000)
    expect(summaryLarge.categorySpend).toEqual([{ name: 'Groceries', value: 100 }])
  })
})

describe('spendingByCategoryRange', () => {
  it('matches the single-month function for exactly that month', () => {
    const rows = [
      tx({ date: '2026-10-01', amount: 10.25 }),
      tx({ date: '2026-10-31', amount: 20.75 }),
      tx({ date: '2026-11-01', amount: 99 }),
      tx({ date: '2026-10-10', type: 'income', amount: 500, category: 'Salary' }),
    ]
    expect(spendingByCategoryRange(rows, '2026-10-01', '2026-10-31')).toEqual(
      spendingByCategory(rows, '2026-10'),
    )
    expect(spendingByCategory(rows, '2026-10')).toEqual({ Groceries: 31 })
  })
})

describe('budgetProgressForMonth', () => {
  const rows = [
    tx({ id: 'g1', date: '2026-10-02', amount: 6400 }),
    tx({ id: 'g2', date: '2026-10-03', amount: 100 }),
    tx({ id: 'r1', date: '2026-10-04', amount: 15000, category: 'Rent' }),
    tx({ id: 'income', date: '2026-10-05', type: 'income', amount: 50000, category: 'Salary' }),
    tx({ id: 'transfer', date: '2026-10-06', type: 'transfer', amount: 1000, category: undefined }),
    tx({ id: 'sept', date: '2026-09-30', amount: 9999 }),
  ]
  const progress = budgetProgressForMonth(budgets, rows, '2026-10')

  it('shows spending, remaining and status per budgeted category', () => {
    expect(progress).toHaveLength(2)
    expect(progress[0]).toMatchObject({
      category: 'Groceries',
      monthlyLimit: 8000,
      spent: 6500,
      remaining: 1500,
      rawPct: 81.25,
      tone: 'warn',
      label: 'Almost there',
      overBy: 0,
    })
    expect(progress[1]).toMatchObject({
      category: 'Rent',
      spent: 15000,
      remaining: 0,
      rawPct: 100,
      tone: 'over',
      label: 'At limit',
      overBy: 0,
    })
  })

  it('keeps the percentage text real when spending is well over the limit', () => {
    const over = budgetProgressForMonth(budgets, [
      tx({ date: '2026-10-02', amount: 9500 }),
    ], '2026-10')[0]
    expect(over).toMatchObject({
      spent: 9500,
      remaining: -1500,
      rawPct: 118.75,
      pct: 100,
      tone: 'over',
      label: 'Over budget',
      overBy: 1500,
    })
  })

  it('ignores income, transfers, other months and unbudgeted categories', () => {
    expect(progress.map((row) => row.category)).toEqual(['Groceries', 'Rent'])
  })

  it('returns no rows when the month has no budgets', () => {
    expect(budgetProgressForMonth(budgets, rows, '2026-11')).toEqual([])
  })

  it('reports unbudgeted spending separately', () => {
    const categories: CategoryDef[] = [
      { name: 'Groceries', type: 'expense', color: '#10b981' },
      { name: 'Rent', type: 'expense', color: '#f59e0b' },
      { name: 'Dining Out', type: 'expense', color: '#ef4444' },
      { name: 'Salary', type: 'income', color: '#0ea5e9' },
    ]
    const result = unbudgetedSpendingForMonth(
      categories,
      budgets,
      [...rows, tx({ date: '2026-10-07', amount: 250, category: 'Dining Out' })],
      '2026-10',
    )
    expect(result).toEqual({
      total: 250,
      items: [{ category: 'Dining Out', spent: 250 }],
    })
  })
})

describe('budget limits', () => {
  it('marks 80% as a warning and just under as on track', () => {
    expect(budgetStatus(6399.99, 8000).tone).toBe('ok')
    expect(budgetStatus(6400, 8000).tone).toBe('warn')
    expect(budgetStatus(8000, 8000)).toMatchObject({
      tone: 'over',
      label: 'At limit',
      rawPct: 100,
      pct: 100,
    })
    expect(budgetStatus(8000.01, 8000.01)).toMatchObject({
      tone: 'over',
      label: 'At limit',
    })
    expect(budgetStatus(8001, 8000)).toMatchObject({
      tone: 'over',
      label: 'Over budget',
    })
  })

  it('does not claim ₹0 is overspent when the limit is reached exactly', () => {
    const warning = budgetWarningForMonth('Groceries', '2026-10', budgets, [
      tx({ amount: 8000 }),
    ])
    expect(warning?.tone).toBe('warn')
    expect(warning?.message).toContain('has reached its ₹8,000.00 budget')
    expect(warning?.message).not.toContain('over')
  })

  it('still reports the real excess above the limit', () => {
    const warning = budgetWarningForMonth('Groceries', '2026-10', budgets, [
      tx({ amount: 9000 }),
    ])
    expect(warning?.tone).toBe('over')
    expect(warning?.message).toContain('₹1,000.00 over')
  })
})
