import type {
  AccountDef,
  BudgetDef,
  CategoryDef,
  MonthPoint,
  Transaction,
  TxType,
} from '../types'
import { formatINR } from './format'

/**
 * All money math lives here, and nowhere else.
 *
 * Rules (documented in full in docs/finance-rules.md):
 *   - amounts are INR, stored positive with at most 2 decimals (paise)
 *   - the transaction *type* decides direction, never the sign
 *   - transfers move money between the user's own accounts: they affect each
 *     account's balance but are never income, expenses or savings
 *   - opening balances belong to an account but are not income
 *   - totals are accumulated in integer paise, then converted back once, so
 *     0.1 + 0.2 is ₹0.30 rather than a floating-point artefact
 */

/** Round a rupee value to a whole number of paise, halves away from zero. */
export function toPaise(rupees: number): number {
  if (!Number.isFinite(rupees)) return 0
  const sign = rupees < 0 ? -1 : 1
  return sign * Math.round(Number(`${Math.abs(rupees)}e2`))
}

/** Convert whole paise back to rupees. */
export function fromPaise(paise: number): number {
  return paise / 100
}

/** Round any rupee amount to two decimals (the nearest paise). */
export function roundMoney(rupees: number): number {
  return fromPaise(toPaise(rupees))
}

/** Sum rupee values without floating-point drift. */
export function sumMoney(values: number[]): number {
  return fromPaise(values.reduce((paise, value) => paise + toPaise(value), 0))
}

/** Sum the amounts of one transaction type. Transfers are their own type. */
export function sumOf(txs: Array<Pick<Transaction, 'amount' | 'type'>>, type: TxType): number {
  const paise = txs
    .filter((t) => t.type === type)
    .reduce((total, t) => total + toPaise(t.amount), 0)
  return fromPaise(paise)
}

/** Last `count` month keys as ["2026-05", ...,"2026-10"], oldest first. */
export function lastMonthKeys(count: number, today = new Date()): string[] {
  const keys: string[] = []
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1)
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return keys
}

export function monthLabel(key: string): string {
  const d = new Date(`${key}-01T00:00:00`)
  return d.toLocaleString('en-IN', { month: 'short' })
}

/** "2026-10" -> "October 2026" */
export function monthTitle(key: string): string {
  const d = new Date(`${key}-01T00:00:00`)
  return d.toLocaleString('en-IN', { month: 'long', year: 'numeric' })
}

/** Step a month key forwards or backwards, crossing year boundaries. */
export function shiftMonthKey(key: string, delta: number): string {
  const [year, month] = key.split('-').map(Number)
  const d = new Date(year, month - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// ---------------------------------------------------------------------------
// Date ranges (reports)
// ---------------------------------------------------------------------------

const MONTH_KEY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

const pad2 = (n: number) => String(n).padStart(2, '0')

/** "2026-10" is a real calendar month. */
export function isMonthKey(value: string): boolean {
  return MONTH_KEY_PATTERN.test(value)
}

/** Strict "YYYY-MM-DD": rejects 2026-02-31 and other impossible dates. */
export function isISODate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  )
}

/** Local-date ISO string, never UTC (so a date never slips a day). */
export function isoDate(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

/** "2026-02" -> "2026-02-28"; "2028-02" -> "2028-02-29". */
export function lastDayOfMonth(monthKey: string): string {
  if (!isMonthKey(monthKey)) {
    throw new Error(`“${monthKey}” is not a valid month.`)
  }
  const [year, month] = monthKey.split('-').map(Number)
  // Day 0 of the next month is the last day of this one.
  const day = new Date(year, month, 0).getDate()
  return `${year}-${pad2(month)}-${pad2(day)}`
}

/** Every month key touched by an inclusive date range, oldest first. */
export function monthsInRange(from: string, to: string): string[] {
  if (!isISODate(from) || !isISODate(to) || from > to) {
    throw new Error('Choose a valid date range: the start must be on or before the end.')
  }
  const [startYear, startMonth] = from.split('-').map(Number)
  const [endYear, endMonth] = to.split('-').map(Number)

  const keys: string[] = []
  let year = startYear
  let month = startMonth
  while (year < endYear || (year === endYear && month <= endMonth)) {
    keys.push(`${year}-${pad2(month)}`)
    month += 1
    if (month > 12) {
      month = 1
      year += 1
    }
  }
  return keys
}

/** Inclusive calendar-date range. */
export interface DateRange {
  from: string
  to: string
}

export type PresetRangeKey =
  | 'this-month'
  | 'last-3-months'
  | 'last-6-months'
  | 'this-year'

/**
 * Full-month ranges for the report presets, in local time. "Last 3 months"
 * includes the current month and the two before it, not the last 90 days.
 */
export function presetRange(preset: PresetRangeKey, today = new Date()): DateRange {
  const year = today.getFullYear()
  const month = today.getMonth()

  if (preset === 'this-month') {
    return {
      from: isoDate(new Date(year, month, 1)),
      to: isoDate(new Date(year, month + 1, 0)),
    }
  }
  if (preset === 'this-year') {
    return {
      from: isoDate(new Date(year, 0, 1)),
      to: isoDate(new Date(year, 11, 31)),
    }
  }

  const span = preset === 'last-3-months' ? 3 : 6
  return {
    from: isoDate(new Date(year, month - (span - 1), 1)),
    to: isoDate(new Date(year, month + 1, 0)),
  }
}

/** Transactions whose ISO date falls inside the inclusive range. */
export function filterByDateRange(
  txs: Transaction[],
  from: string,
  to: string,
): Transaction[] {
  if (!isISODate(from) || !isISODate(to) || from > to) {
    throw new Error('Choose a valid date range: the start must be on or before the end.')
  }
  return txs.filter((t) => t.date >= from && t.date <= to)
}

/**
 * Income, expenses and savings per calendar month.
 * Transfers are excluded: moving money between your own accounts is not
 * earning or spending. Opening balances are excluded too — they are the
 * starting point, not income for the month.
 */
export function monthlyTotals(txs: Transaction[], keys: string[]): MonthPoint[] {
  return keys.map((key) => {
    const inMonth = txs.filter((t) => t.date.startsWith(key))
    const income = sumOf(inMonth, 'income')
    const expense = sumOf(inMonth, 'expense')
    return {
      key,
      label: monthLabel(key),
      income,
      expense,
      savings: fromPaise(toPaise(income) - toPaise(expense)),
    }
  })
}

/**
 * Expense total per category for one month, in paise-exact rupees.
 * Transfers and income never appear here.
 */
export function spendingByCategory(
  txs: Transaction[],
  monthKey: string,
): Record<string, number> {
  if (!isMonthKey(monthKey)) return {}
  return spendingByCategoryRange(txs, `${monthKey}-01`, lastDayOfMonth(monthKey))
}

/** Expense total per category over an inclusive date range. */
export function spendingByCategoryRange(
  txs: Transaction[],
  from: string,
  to: string,
): Record<string, number> {
  const paise: Record<string, number> = {}
  for (const t of filterByDateRange(txs, from, to)) {
    if (t.type !== 'expense' || !t.category) continue
    paise[t.category] = (paise[t.category] ?? 0) + toPaise(t.amount)
  }
  return Object.fromEntries(
    Object.entries(paise).map(([name, value]) => [name, fromPaise(value)]),
  )
}

export interface RangeSummary {
  from: string
  to: string
  /** One point per calendar month touched by the range, oldest first. */
  months: MonthPoint[]
  income: number
  expense: number
  /** income − expense; transfers and opening balances never count. */
  savings: number
  /** Transfer total, shown only as context — never part of income or expense. */
  transfers: number
  transactionCount: number
  incomeCount: number
  expenseCount: number
  transferCount: number
  averageMonthlySavings: number
  /** Expenses per category in the range, biggest first. */
  categorySpend: Array<{ name: string; value: number }>
}

/**
 * One pass over the saved transactions produces every report figure:
 * the monthly chart, the totals and the category breakdown. Because they all
 * come from the same filtered rows and the same paise arithmetic, the chart
 * and the totals cannot disagree.
 *
 * Transfers move money between the user's own accounts: they affect account
 * balances, but never income, expenses, savings or category spending.
 */
export function summariseRange(
  txs: Transaction[],
  from: string,
  to: string,
): RangeSummary {
  const keys = monthsInRange(from, to)
  const years = new Set(keys.map((key) => key.slice(0, 4)))
  const labelWithYear = years.size > 1

  const buckets = new Map(
    keys.map((key) => [key, { incomePaise: 0, expensePaise: 0 }]),
  )
  const categoryPaise = new Map<string, number>()
  let incomePaise = 0
  let expensePaise = 0
  let transferPaise = 0
  let incomeCount = 0
  let expenseCount = 0
  let transferCount = 0
  let transactionCount = 0

  for (const t of txs) {
    if (t.date < from || t.date > to) continue
    const bucket = buckets.get(t.date.slice(0, 7))
    if (!bucket) continue
    transactionCount += 1

    const paise = toPaise(t.amount)
    if (t.type === 'income') {
      incomePaise += paise
      bucket.incomePaise += paise
      incomeCount += 1
    } else if (t.type === 'expense') {
      expensePaise += paise
      bucket.expensePaise += paise
      expenseCount += 1
      if (t.category) {
        categoryPaise.set(t.category, (categoryPaise.get(t.category) ?? 0) + paise)
      }
    } else {
      transferPaise += paise
      transferCount += 1
    }
  }

  const savingsPaise = incomePaise - expensePaise
  const months: MonthPoint[] = keys.map((key) => {
    const bucket = buckets.get(key) ?? { incomePaise: 0, expensePaise: 0 }
    const label = labelWithYear
      ? `${monthLabel(key)} '${key.slice(2, 4)}`
      : monthLabel(key)
    return {
      key,
      label,
      income: fromPaise(bucket.incomePaise),
      expense: fromPaise(bucket.expensePaise),
      savings: fromPaise(bucket.incomePaise - bucket.expensePaise),
    }
  })

  const categorySpend = [...categoryPaise.entries()]
    .map(([name, value]) => ({ name, value: fromPaise(value) }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))

  return {
    from,
    to,
    months,
    income: fromPaise(incomePaise),
    expense: fromPaise(expensePaise),
    savings: fromPaise(savingsPaise),
    transfers: fromPaise(transferPaise),
    transactionCount,
    incomeCount,
    expenseCount,
    transferCount,
    averageMonthlySavings:
      keys.length > 0 ? roundMoney(fromPaise(savingsPaise) / keys.length) : 0,
    categorySpend,
  }
}

/**
 * Spending per category for one month, biggest first.
 * Transfers are excluded — they are not spending.
 */
export function categorySpend(txs: Transaction[], key: string) {
  return Object.entries(spendingByCategory(txs, key))
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))
}

/**
 * Money in one account:
 *   opening balance + income arriving in it
 *   - expenses paid from it - transfers sent out + transfers received.
 * A transfer into and out of the same account nets to zero (the database
 * forbids that shape anyway).
 */
export function accountBalance(
  accountName: string,
  accounts: AccountDef[],
  txs: Transaction[],
): number {
  const opening = accounts.find((a) => a.name === accountName)?.openingBalance ?? 0
  let paise = toPaise(opening)

  for (const t of txs) {
    if (t.account === accountName) {
      if (t.type === 'income') paise += toPaise(t.amount)
      else paise -= toPaise(t.amount)
    }
    if (t.type === 'transfer' && t.toAccount === accountName) {
      paise += toPaise(t.amount)
    }
  }

  return fromPaise(paise)
}

/**
 * Sum of every account's balance.
 *
 * Transfers cancel out across accounts, so they are intentionally left out of
 * this shortcut. `totalBalance` therefore always equals the sum of
 * `accountBalance` over each account (covered by tests).
 */
export function totalBalance(accounts: AccountDef[], txs: Transaction[]): number {
  const openingPaise = accounts.reduce((total, a) => total + toPaise(a.openingBalance), 0)
  const incomePaise = txs
    .filter((t) => t.type === 'income')
    .reduce((total, t) => total + toPaise(t.amount), 0)
  const expensePaise = txs
    .filter((t) => t.type === 'expense')
    .reduce((total, t) => total + toPaise(t.amount), 0)
  return fromPaise(openingPaise + incomePaise - expensePaise)
}

/** Newest transactions first (date desc, then created order as tiebreaker). */
export function sortNewestFirst(txs: Transaction[]): Transaction[] {
  return [...txs].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
}

export function recentTransactions(txs: Transaction[], count: number): Transaction[] {
  return sortNewestFirst(txs).slice(0, count)
}

export interface SavingsSummary {
  months: number
  totalIncome: number
  totalExpense: number
  /** total income - total expenses; transfers never count */
  totalSavings: number
  /** total savings divided by the number of months shown, rounded to paise */
  averageMonthlySavings: number
}

/**
 * Reporting totals for a list of months. An average includes every month in
 * the range, including months with no activity.
 */
export function savingsSummary(months: MonthPoint[]): SavingsSummary {
  const incomePaise = months.reduce((total, m) => total + toPaise(m.income), 0)
  const expensePaise = months.reduce((total, m) => total + toPaise(m.expense), 0)
  const savingsPaise = incomePaise - expensePaise
  const totalSavings = fromPaise(savingsPaise)

  return {
    months: months.length,
    totalIncome: fromPaise(incomePaise),
    totalExpense: fromPaise(expensePaise),
    totalSavings,
    averageMonthlySavings:
      months.length > 0 ? roundMoney(totalSavings / months.length) : 0,
  }
}

export type BudgetTone = 'ok' | 'warn' | 'over'

/**
 * Budget thresholds: green < 80%, amber 80–99%, red at 100% or more.
 * `pct` is capped at 100 because it drives a progress bar; `rawPct` keeps the
 * real figure (for example 120) so the page can say how far over it is.
 */
export function budgetStatus(spent: number, limit: number): {
  pct: number
  rawPct: number
  tone: BudgetTone
  label: string
} {
  if (!(limit > 0)) return { pct: 0, rawPct: 0, tone: 'ok', label: 'No limit' }

  const rawPct = (spent / limit) * 100
  const pct = Math.min(rawPct, 100)
  if (rawPct >= 100) {
    return {
      pct,
      rawPct,
      tone: 'over',
      label: spent > limit ? 'Over budget' : 'At limit',
    }
  }
  if (rawPct >= 80) return { pct, rawPct, tone: 'warn', label: 'Almost there' }
  return { pct, rawPct, tone: 'ok', label: 'On track' }
}

export interface BudgetProgress {
  category: string
  month: string
  monthlyLimit: number
  spent: number
  /** limit − spent; negative means overspent. */
  remaining: number
  /** Capped at 100 for progress bars. */
  pct: number
  /** The real percentage, which can exceed 100. */
  rawPct: number
  tone: BudgetTone
  label: string
  /** 0 unless spent is above the limit. */
  overBy: number
}

/**
 * The budget rows for one month, with spending derived from that month's
 * saved expense transactions. This is the only implementation used by both
 * the Budgets page and the Reports page, so their figures always agree.
 */
export function budgetProgressForMonth(
  budgets: BudgetDef[],
  txs: Transaction[],
  monthKey: string,
): BudgetProgress[] {
  const spentByCategory = spendingByCategory(txs, monthKey)
  return budgets
    .filter((b) => b.month === monthKey)
    .map((b) => {
      const spent = spentByCategory[b.category] ?? 0
      const status = budgetStatus(spent, b.monthlyLimit)
      return {
        category: b.category,
        month: b.month,
        monthlyLimit: b.monthlyLimit,
        spent,
        remaining: roundMoney(b.monthlyLimit - spent),
        ...status,
        overBy: roundMoney(Math.max(0, spent - b.monthlyLimit)),
      }
    })
    .sort((a, b) => a.category.localeCompare(b.category))
}

/**
 * Expenses in the month whose category has no budget. They are real spending
 * but cannot be compared with a limit, so they are reported separately rather
 * than being folded into “total budget” figures.
 */
export function unbudgetedSpendingForMonth(
  categories: CategoryDef[],
  budgets: BudgetDef[],
  txs: Transaction[],
  monthKey: string,
): { total: number; items: Array<{ category: string; spent: number }> } {
  const budgeted = new Set(
    budgets.filter((b) => b.month === monthKey).map((b) => b.category),
  )
  const spentByCategory = spendingByCategory(txs, monthKey)
  const items = categories
    .filter((c) => c.type === 'expense' && !budgeted.has(c.name))
    .map((c) => ({ category: c.name, spent: spentByCategory[c.name] ?? 0 }))
    .filter((row) => row.spent > 0)
    .sort((a, b) => b.spent - a.spent || a.category.localeCompare(b.category))

  return { total: sumMoney(items.map((row) => row.spent)), items }
}

/**
 * The one-line warning shown after saving a transaction that pushes its
 * category close to (80%+) or past the budget set for that month. Returns
 * null when that month has no budget for the category, or spending is still
 * comfortable.
 */
export function budgetWarningForMonth(
  category: string | undefined,
  monthKey: string,
  budgets: BudgetDef[],
  txs: Transaction[],
): { tone: 'warn' | 'over'; message: string } | null {
  if (!category) return null
  const budget = budgets.find((b) => b.category === category && b.month === monthKey)
  if (!budget) return null

  const spent = spendingByCategory(txs, monthKey)[category] ?? 0

  const { rawPct, tone } = budgetStatus(spent, budget.monthlyLimit)
  const limit = formatINR(budget.monthlyLimit)
  const month = monthTitle(monthKey)

  if (spent > budget.monthlyLimit) {
    return {
      tone: 'over',
      message: `${category} is ${formatINR(roundMoney(spent - budget.monthlyLimit))} over its ${limit} budget for ${month}.`,
    }
  }
  if (tone === 'over') {
    // Spending exactly the limit is not overspending; say so without “₹0.00 over”.
    return {
      tone: 'warn',
      message: `${category} has reached its ${limit} budget for ${month} (${formatINR(spent)} spent).`,
    }
  }
  if (tone === 'warn') {
    return {
      tone,
      message: `${category} has used ${Math.round(rawPct)}% of its ${limit} budget for ${month} (${formatINR(spent)} spent).`,
    }
  }
  return null
}
