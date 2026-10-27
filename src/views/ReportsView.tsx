import { useMemo, useState } from 'react'
import type { BudgetDef, CategoryDef, Transaction } from '../types'
import { CategoryChart } from '../components/CategoryChart'
import { MonthlyChart } from '../components/MonthlyChart'
import {
  budgetProgressForMonth,
  filterByDateRange,
  isISODate,
  lastDayOfMonth,
  monthTitle,
  presetRange,
  roundMoney,
  sortNewestFirst,
  spendingByCategory,
  summariseRange,
  sumMoney,
  unbudgetedSpendingForMonth,
  type DateRange,
  type PresetRangeKey,
} from '../lib/finance'
import { downloadText, reportCsvFilename, transactionsToCsv } from '../lib/exportData'
import { formatINR } from '../lib/format'
import { IconAlert, IconChevronRight, IconReport } from '../components/Icons'

interface Props {
  transactions: Transaction[]
  categories: CategoryDef[]
  budgets: BudgetDef[]
  onNotify: (message: string, tone?: 'success' | 'error' | 'warning') => void
  /** Switch to the Budgets page to edit the monthly limits. */
  onOpenBudgets: () => void
}

type PresetKey = PresetRangeKey | 'custom'

const PRESETS: Array<{ key: PresetKey; label: string }> = [
  { key: 'this-month', label: 'This month' },
  { key: 'last-3-months', label: 'Last 3 months' },
  { key: 'last-6-months', label: 'Last 6 months' },
  { key: 'this-year', label: 'This year' },
  { key: 'custom', label: 'Custom' },
]

const MIN_REPORT_DATE = '1970-01-01'
const MAX_REPORT_DATE = '2100-12-31'

const TONE_STYLES = {
  ok: { bar: 'bg-emerald-500', chip: 'bg-emerald-100 text-emerald-800' },
  warn: { bar: 'bg-amber-500', chip: 'bg-amber-100 text-amber-800' },
  over: { bar: 'bg-rose-600', chip: 'bg-rose-100 text-rose-800' },
} as const

function formatDay(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/** "October 2026" for whole months, otherwise "1 Apr 2026 – 26 Oct 2026". */
function describeRange(from: string, to: string): string {
  if (!isISODate(from) || !isISODate(to)) return 'the selected dates'
  if (from === to) return formatDay(from)
  if (from.endsWith('-01') && to === lastDayOfMonth(from.slice(0, 7))) {
    return monthTitle(from.slice(0, 7))
  }
  return `${formatDay(from)} – ${formatDay(to)}`
}

function pctOf(part: number, whole: number): number {
  return whole > 0 ? (part / whole) * 100 : 0
}

/**
 * Reports built only from the signed-in user's saved transactions.
 *
 * Every figure comes from `summariseRange`, which filters the same rows once
 * and derives the totals, monthly chart and category breakdown from them. The
 * budgets section uses `budgetProgressForMonth`, the same function as the
 * Budgets page, so the two screens cannot disagree about a limit.
 */
export function ReportsView({
  transactions,
  categories,
  budgets,
  onNotify,
  onOpenBudgets,
}: Props) {
  const [initialRange] = useState(() => presetRange('last-6-months'))
  const [preset, setPreset] = useState<PresetKey>('last-6-months')
  const [customFrom, setCustomFrom] = useState(initialRange.from)
  const [customTo, setCustomTo] = useState(initialRange.to)
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null)

  const range: DateRange =
    preset === 'custom' ? { from: customFrom, to: customTo } : presetRange(preset)

  const rangeError = !isISODate(range.from)
    ? 'Enter a valid start date.'
    : !isISODate(range.to)
      ? 'Enter a valid end date.'
      : range.from > range.to
        ? 'The start date must be on or before the end date.'
        : null

  const summary = useMemo(
    () => (rangeError ? null : summariseRange(transactions, range.from, range.to)),
    [transactions, range.from, range.to, rangeError],
  )

  const activeMonth =
    selectedMonth && summary?.months.some((month) => month.key === selectedMonth)
      ? selectedMonth
      : null

  const rangeLabel = describeRange(range.from, range.to)

  const colorOf = useMemo(
    () => new Map(categories.map((category) => [category.name, category.color] as const)),
    [categories],
  )

  /** Category spending for the whole range, or for the selected month. */
  const scopeCategorySpend = useMemo(() => {
    if (!summary) return []
    if (!activeMonth) return summary.categorySpend
    const inRange = filterByDateRange(transactions, range.from, range.to)
    return Object.entries(spendingByCategory(inRange, activeMonth))
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))
  }, [summary, activeMonth, transactions, range.from, range.to])

  const selectedMonthPoint = activeMonth
    ? summary?.months.find((month) => month.key === activeMonth)
    : undefined
  const scopeExpense = activeMonth
    ? (selectedMonthPoint?.expense ?? 0)
    : (summary?.expense ?? 0)
  const scopeLabel = activeMonth ? monthTitle(activeMonth) : rangeLabel

  const slices = scopeCategorySpend.map((slice) => ({
    ...slice,
    color: colorOf.get(slice.name),
  }))

  // Budgets are monthly. Compare a month when one is selected, or when the
  // range is exactly one calendar month; a multi-month range cannot be
  // compared with limits that belong to individual months without inventing
  // a figure, so the page asks for a month instead.
  const budgetMonth =
    activeMonth ?? (summary?.months.length === 1 ? summary.months[0].key : null)
  const budgetRows = budgetMonth
    ? budgetProgressForMonth(budgets, transactions, budgetMonth)
    : []
  const budgetTotal = sumMoney(budgetRows.map((row) => row.monthlyLimit))
  const budgetSpent = sumMoney(budgetRows.map((row) => row.spent))
  const budgetRemaining = roundMoney(budgetTotal - budgetSpent)
  const overRows = budgetRows.filter((row) => row.overBy > 0)
  const atLimitRows = budgetRows.filter(
    (row) => row.tone === 'over' && row.overBy === 0,
  )
  const unbudgeted =
    budgetMonth !== null
      ? unbudgetedSpendingForMonth(categories, budgets, transactions, budgetMonth)
      : { total: 0, items: [] as Array<{ category: string; spent: number }> }

  const budgetRangeIsPartial =
    budgetMonth !== null &&
    (range.from > `${budgetMonth}-01` ||
      range.to < lastDayOfMonth(budgetMonth))

  const exportRows = useMemo(() => {
    if (!summary) return []
    const inRange = filterByDateRange(transactions, range.from, range.to)
    const scoped = activeMonth
      ? inRange.filter((transaction) => transaction.date.startsWith(activeMonth))
      : inRange
    return sortNewestFirst(scoped)
  }, [summary, transactions, range.from, range.to, activeMonth])

  const choosePreset = (next: PresetKey) => {
    setPreset(next)
    setSelectedMonth(null)
  }

  const changeCustom = (which: 'from' | 'to', value: string) => {
    if (which === 'from') setCustomFrom(value)
    else setCustomTo(value)
    setSelectedMonth(null)
  }

  const exportCsv = () => {
    try {
      downloadText(
        reportCsvFilename(range.from, range.to, activeMonth),
        'text/csv',
        transactionsToCsv(exportRows),
      )
      onNotify(
        `Downloaded ${exportRows.length} transaction${exportRows.length === 1 ? '' : 's'} as CSV.`,
        'success',
      )
    } catch {
      onNotify('Could not create the CSV download. Your data is still safe in Supabase.', 'error')
    }
  }

  return (
    <div className="space-y-4">
      <section
        aria-labelledby="report-range-title"
        className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 id="report-range-title" className="text-base font-semibold tracking-tight">
              Date range
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Figures are calculated from your saved transactions only. Transfers move money
              between your own accounts, so they are excluded from income, expenses and savings.
            </p>
          </div>
          <div
            role="group"
            aria-label="Report period"
            className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1"
          >
            {PRESETS.map((option) => (
              <button
                key={option.key}
                type="button"
                aria-pressed={preset === option.key}
                onClick={() => choosePreset(option.key)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-none ${
                  preset === option.key
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {preset === 'custom' && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <label
                htmlFor="report-from"
                className="mb-1.5 block text-sm font-medium text-slate-700"
              >
                From
              </label>
              <input
                id="report-from"
                type="date"
                value={customFrom}
                min={MIN_REPORT_DATE}
                max={MAX_REPORT_DATE}
                aria-invalid={Boolean(rangeError)}
                aria-describedby={rangeError ? 'report-range-error' : undefined}
                onChange={(event) => changeCustom('from', event.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/40 focus:outline-none"
              />
            </div>
            <div>
              <label
                htmlFor="report-to"
                className="mb-1.5 block text-sm font-medium text-slate-700"
              >
                To
              </label>
              <input
                id="report-to"
                type="date"
                value={customTo}
                min={MIN_REPORT_DATE}
                max={MAX_REPORT_DATE}
                aria-invalid={Boolean(rangeError)}
                aria-describedby={rangeError ? 'report-range-error' : undefined}
                onChange={(event) => changeCustom('to', event.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/40 focus:outline-none"
              />
            </div>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          {rangeError ? (
            <p
              id="report-range-error"
              role="alert"
              className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700"
            >
              {rangeError}
            </p>
          ) : (
            <p className="text-sm text-slate-600">
              Showing <strong className="font-semibold text-slate-900">{rangeLabel}</strong>.
            </p>
          )}
          <button
            type="button"
            onClick={exportCsv}
            disabled={summary === null}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
          >
            Export CSV ({exportRows.length})
          </button>
        </div>
      </section>

      {summary === null ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6">
          <h2 className="text-sm font-semibold text-rose-900">Choose a valid range</h2>
          <p className="mt-1 text-sm text-rose-800">
            No report is shown until the start and end dates are valid. Nothing has been
            guessed or filled in.
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: 'Income', value: summary.income, tone: 'text-emerald-700' },
              { label: 'Expenses', value: summary.expense, tone: 'text-rose-700' },
              {
                label: 'Savings',
                value: summary.savings,
                tone: summary.savings >= 0 ? 'text-emerald-700' : 'text-rose-700',
              },
              {
                label: 'Average monthly savings',
                value: summary.averageMonthlySavings,
                tone: summary.averageMonthlySavings >= 0 ? 'text-emerald-700' : 'text-rose-700',
              },
            ].map((card) => (
              <div
                key={card.label}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <p className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
                  {card.label}
                </p>
                <p className={`mt-1 text-xl font-bold tabular-nums ${card.tone}`}>
                  {formatINR(card.value)}
                </p>
              </div>
            ))}
          </div>

          <p className="text-xs text-slate-500">
            {summary.transactionCount} transaction
            {summary.transactionCount === 1 ? '' : 's'} in this range
            {summary.transferCount > 0
              ? ` · ${summary.transferCount} transfer${summary.transferCount === 1 ? '' : 's'} (${formatINR(summary.transfers)}) excluded from the totals`
              : ''}
            . Average monthly savings includes every month in the range, even months with no
            activity.
          </p>

          {summary.transactionCount === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-5">
              <p className="text-sm font-medium text-slate-700">
                No transactions in {rangeLabel}
              </p>
              <p className="mt-1 text-sm text-slate-500">
                The totals are zero because nothing was saved in this period, not because data
                is missing. Choose another range or add a transaction.
              </p>
            </div>
          )}

          <section
            aria-labelledby="report-chart-title"
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2
                  id="report-chart-title"
                  className="text-base font-semibold tracking-tight"
                >
                  Income vs expenses
                </h2>
                <p className="text-xs text-slate-500">{rangeLabel}, in ₹</p>
              </div>
              {activeMonth && (
                <button
                  type="button"
                  onClick={() => setSelectedMonth(null)}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-none"
                >
                  Show the whole range
                </button>
              )}
            </div>

            <div className="mt-3">
              <MonthlyChart
                data={summary.months}
                selectedKey={activeMonth}
                onSelectMonth={(key) =>
                  setSelectedMonth((current) => (current === key ? null : key))
                }
                emptyMessage={`No transactions between ${rangeLabel}. Add one and the monthly bars appear here.`}
              />
            </div>

            <div
              role="group"
              aria-label="Drill into a month"
              className="mt-3 flex flex-wrap gap-1.5"
            >
              {summary.months.map((month) => {
                const selected = activeMonth === month.key
                return (
                  <button
                    key={month.key}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setSelectedMonth(selected ? null : month.key)}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-none ${
                      selected
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {month.label}
                  </button>
                )
              })}
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Click a bar or a month to focus the category and budget sections.
            </p>
          </section>

          <section
            aria-labelledby="report-category-title"
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <h2
                  id="report-category-title"
                  className="text-base font-semibold tracking-tight"
                >
                  Spending by category
                </h2>
                <p className="text-xs text-slate-500">{scopeLabel}, in ₹</p>
              </div>
              <p className="text-sm font-semibold text-slate-800">
                {formatINR(scopeExpense)} total spending
              </p>
            </div>

            <div className="mt-3 grid gap-4 lg:grid-cols-2">
              <CategoryChart
                data={slices}
                emptyMessage={`No expenses recorded for ${scopeLabel}.`}
              />

              {slices.length === 0 ? (
                <p className="self-center rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                  There is nothing to break down yet. Income and transfers are never treated
                  as spending.
                </p>
              ) : (
                <ul className="space-y-3 self-center">
                  {slices.map((slice) => (
                    <li key={slice.name}>
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="flex min-w-0 items-center gap-2 font-medium text-slate-700">
                          <span
                            aria-hidden="true"
                            className="size-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: slice.color ?? '#94a3b8' }}
                          />
                          <span className="truncate">{slice.name}</span>
                        </span>
                        <span className="shrink-0 tabular-nums text-slate-700">
                          {formatINR(slice.value)}{' '}
                          <span className="text-xs text-slate-500">
                            ({Math.round(pctOf(slice.value, scopeExpense))}%)
                          </span>
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.min(pctOf(slice.value, scopeExpense), 100)}%`,
                            backgroundColor: slice.color ?? '#94a3b8',
                          }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section
            aria-labelledby="report-budget-title"
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2
                  id="report-budget-title"
                  className="text-base font-semibold tracking-tight"
                >
                  Budget performance
                </h2>
                <p className="text-xs text-slate-500">
                  {budgetMonth
                    ? `${monthTitle(budgetMonth)} · limits from your saved budgets`
                    : 'Monthly budgets are compared one month at a time'}
                </p>
              </div>
              <button
                type="button"
                onClick={onOpenBudgets}
                className="flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-none"
              >
                Manage budgets
                <IconChevronRight className="size-3.5" />
              </button>
            </div>

            {budgetMonth === null ? (
              <div className="mt-3 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-4">
                <p className="text-sm text-slate-600">
                  Pick a single month to compare budgets with actual spending. A range
                  covering several months has no single limit to compare against, so nothing
                  is combined or estimated here.
                </p>
              </div>
            ) : budgetRows.length === 0 ? (
              <div className="mt-3 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-4">
                <p className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <IconReport className="size-4" />
                  No budgets set for {monthTitle(budgetMonth)}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  Set a monthly limit for a category to see its spending progress, remaining
                  amount and overspending here.
                </p>
                <button
                  type="button"
                  onClick={onOpenBudgets}
                  className="mt-3 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:outline-none"
                >
                  Set a budget
                </button>
              </div>
            ) : (
              <>
                {overRows.length > 0 && (
                  <div role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3">
                    <p className="flex items-center gap-2 text-sm font-semibold text-rose-900">
                      <IconAlert className="size-4 shrink-0" />
                      Over budget in {monthTitle(budgetMonth)}
                    </p>
                    <ul className="mt-1 space-y-0.5 text-sm text-rose-800">
                      {overRows.map((row) => (
                        <li key={row.category}>
                          <strong className="font-semibold">{row.category}</strong> —{' '}
                          {formatINR(row.spent)} spent of {formatINR(row.monthlyLimit)},{' '}
                          <strong className="font-semibold">
                            {formatINR(row.overBy)} over
                          </strong>
                          .
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {atLimitRows.length > 0 && (
                  <div
                    role="status"
                    className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
                  >
                    <strong className="font-semibold">At the limit:</strong>{' '}
                    {atLimitRows
                      .map((row) => `${row.category} (${formatINR(row.monthlyLimit)})`)
                      .join(', ')}
                    . Nothing is left, but nothing is over yet.
                  </div>
                )}

                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  {[
                    { label: 'Total budget', value: formatINR(budgetTotal) },
                    { label: 'Spent', value: formatINR(budgetSpent) },
                    {
                      label: budgetRemaining < 0 ? 'Over by' : 'Remaining',
                      value: formatINR(Math.abs(budgetRemaining)),
                      tone: budgetRemaining < 0 ? 'text-rose-700' : 'text-emerald-700',
                    },
                  ].map((stat) => (
                    <div key={stat.label} className="rounded-xl bg-slate-50 p-3">
                      <p className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
                        {stat.label}
                      </p>
                      <p
                        className={`mt-0.5 text-base font-bold tabular-nums ${
                          stat.tone ?? 'text-slate-900'
                        }`}
                      >
                        {stat.value}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full min-w-[620px] text-left text-sm">
                    <caption className="sr-only">
                      Budget, spending and remaining amount for {monthTitle(budgetMonth)}
                    </caption>
                    <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold tracking-wide text-slate-500 uppercase">
                      <tr>
                        <th scope="col" className="px-3 py-2">Category</th>
                        <th scope="col" className="px-3 py-2 text-right">Budget</th>
                        <th scope="col" className="px-3 py-2 text-right">Spent</th>
                        <th scope="col" className="px-3 py-2 text-right">Left</th>
                        <th scope="col" className="px-3 py-2">Progress</th>
                        <th scope="col" className="px-3 py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {budgetRows.map((row) => {
                        const style = TONE_STYLES[row.tone]
                        return (
                          <tr key={row.category}>
                            <td className="px-3 py-2 font-medium text-slate-800">
                              {row.category}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                              {formatINR(row.monthlyLimit)}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                              {formatINR(row.spent)}
                            </td>
                            <td
                              className={`px-3 py-2 text-right font-medium tabular-nums ${
                                row.remaining < 0 ? 'text-rose-700' : 'text-slate-600'
                              }`}
                            >
                              {row.remaining < 0 ? '−' : ''}
                              {formatINR(Math.abs(row.remaining))}
                            </td>
                            <td className="px-3 py-2">
                              <div
                                className="h-2 w-full overflow-hidden rounded-full bg-slate-100"
                                role="progressbar"
                                aria-valuenow={Math.round(row.pct)}
                                aria-valuemin={0}
                                aria-valuemax={100}
                                aria-label={`${row.category}: ${Math.round(row.rawPct)}% of budget used`}
                              >
                                <div
                                  className={`h-full rounded-full ${style.bar}`}
                                  style={{ width: `${row.pct}%` }}
                                />
                              </div>
                              <span className="mt-0.5 block text-[11px] text-slate-500">
                                {Math.round(row.rawPct)}% used
                              </span>
                            </td>
                            <td className="px-3 py-2">
                              <span
                                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${style.chip}`}
                              >
                                {row.label}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {budgetRangeIsPartial && (
                  <p className="mt-2 text-xs leading-relaxed text-slate-500">
                    Budgets cover the whole month, so this section compares all of{' '}
                    {monthTitle(budgetMonth)} even though the selected dates cover only part
                    of it.
                  </p>
                )}

                {unbudgeted.total > 0 && (
                  <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
                    A further {formatINR(unbudgeted.total)} was spent in categories without a
                    budget for this month ({unbudgeted.items.map((item) => item.category).join(', ')}).
                    It is not part of the budgeted totals above.
                  </p>
                )}
              </>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold tracking-tight">Export this report</h2>
            <p className="mt-1 text-sm text-slate-500">
              Downloads {exportRows.length} transaction{exportRows.length === 1 ? '' : 's'} for{' '}
              {activeMonth ? monthTitle(activeMonth) : rangeLabel} as CSV: UTF-8 with two-decimal
              rupee amounts, quoted text and formula-safe cells, so a note beginning with
              &ldquo;=&rdquo; cannot run as a spreadsheet formula.
            </p>
            <button
              type="button"
              onClick={exportCsv}
              className="mt-3 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              Download CSV
            </button>
          </section>
        </>
      )}
    </div>
  )
}
