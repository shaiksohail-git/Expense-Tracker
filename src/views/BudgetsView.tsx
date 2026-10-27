import { useState } from 'react'
import type { BudgetDef, CategoryDef, Transaction } from '../types'
import {
  budgetProgressForMonth,
  monthTitle,
  roundMoney,
  shiftMonthKey,
  sumMoney,
  unbudgetedSpendingForMonth,
} from '../lib/finance'
import { formatINR } from '../lib/format'
import { BudgetFormModal } from '../components/BudgetFormModal'
import { ConfirmDialog } from '../components/ConfirmDialog'
import {
  IconAlert,
  IconChevronLeft,
  IconChevronRight,
  IconEdit,
  IconPlus,
  IconTrash,
} from '../components/Icons'

interface Props {
  /** Every budget the user has, across all months. */
  budgets: BudgetDef[]
  categories: CategoryDef[]
  transactions: Transaction[]
  currentMonthKey: string
  /** Rejects with a user-facing message when the database write fails. */
  onSaveBudget: (
    category: string,
    monthlyLimit: number,
    monthKey: string,
  ) => Promise<unknown>
  onDeleteBudget: (category: string, monthKey: string) => Promise<void>
  onNotify: (message: string, tone?: 'success' | 'error' | 'warning') => void
}

const TONE_STYLES = {
  ok: { bar: 'bg-emerald-500', chip: 'bg-emerald-100 text-emerald-800', text: 'text-emerald-700' },
  warn: { bar: 'bg-amber-500', chip: 'bg-amber-100 text-amber-800', text: 'text-amber-700' },
  over: { bar: 'bg-rose-600', chip: 'bg-rose-100 text-rose-800', text: 'text-rose-700' },
} as const

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback

/**
 * Per-month limits, one per expense category.
 *
 * The month picker is the heart of the page: everything below it — totals,
 * warnings, rows and actions — refers to exactly the month shown. Budgets in
 * other months are never read or changed from here.
 */
export function BudgetsView({
  budgets,
  categories,
  transactions,
  currentMonthKey,
  onSaveBudget,
  onDeleteBudget,
  onNotify,
}: Props) {
  const [monthKey, setMonthKey] = useState(currentMonthKey)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<BudgetDef | null>(null)
  const [pendingDelete, setPendingDelete] = useState<BudgetDef | null>(null)
  const [deleting, setDeleting] = useState(false)

  const monthBudgets = budgets.filter((b) => b.month === monthKey)

  const rows = budgetProgressForMonth(budgets, transactions, monthKey)

  const over = rows.filter((r) => r.overBy > 0)
  const atLimit = rows.filter((r) => r.tone === 'over' && r.overBy === 0)
  const almost = rows.filter((r) => r.tone === 'warn')

  const totalLimit = sumMoney(rows.map((r) => r.monthlyLimit))
  const totalSpent = sumMoney(rows.map((r) => r.spent))
  const totalRemaining = roundMoney(totalLimit - totalSpent)
  const overallPct = totalLimit > 0 ? Math.min((totalSpent / totalLimit) * 100, 100) : 0
  const overallOver = totalRemaining < 0

  const unbudgeted = unbudgetedSpendingForMonth(categories, budgets, transactions, monthKey)

  const expenseCategories = categories.filter((c) => c.type === 'expense')
  const categoriesWithoutBudget = expenseCategories.filter(
    (c) => !monthBudgets.some((b) => b.category === c.name),
  )
  const canCreate = categoriesWithoutBudget.length > 0
  const isCurrentMonth = monthKey === currentMonthKey

  const changeMonth = (next: string) => {
    if (!next) return
    setMonthKey(next)
  }

  const openCreate = () => {
    // The button is disabled when every category already has a budget for
    // this month, but keep the empty-state CTA honest if that changes.
    if (!canCreate) {
      onNotify(
        `Every expense category already has a budget in ${monthTitle(monthKey)}. Edit one instead.`,
        'warning',
      )
      return
    }
    setEditing(null)
    setFormOpen(true)
  }

  const openEdit = (budget: BudgetDef) => {
    setEditing(budget)
    setFormOpen(true)
  }

  const handleSave = async (category: string, monthlyLimit: number) => {
    const month = editing?.month ?? monthKey
    const wasEditing = editing !== null
    await onSaveBudget(category, monthlyLimit, month)
    onNotify(
      wasEditing
        ? `Budget for ${category} in ${monthTitle(month)} updated to ${formatINR(monthlyLimit)}.`
        : `Budget for ${category} in ${monthTitle(month)} set at ${formatINR(monthlyLimit)}.`,
    )
  }

  const confirmDelete = async () => {
    const target = pendingDelete
    if (!target) return
    setDeleting(true)
    try {
      await onDeleteBudget(target.category, target.month)
      setPendingDelete(null)
      onNotify(
        `Budget for ${target.category} in ${monthTitle(target.month)} removed. Your transactions are untouched.`,
      )
    } catch (err) {
      onNotify(errorMessage(err, 'Could not remove that budget.'), 'error')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold tracking-tight">Monthly limits</h2>
          <p className="text-xs text-slate-500">
            One limit per category per month · warnings at 80% and when you go over
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
            <button
              type="button"
              onClick={() => changeMonth(shiftMonthKey(monthKey, -1))}
              aria-label="Previous month"
              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-none"
            >
              <IconChevronLeft className="size-4" />
            </button>
            <label htmlFor="budget-month" className="sr-only">
              Budget month
            </label>
            <input
              id="budget-month"
              type="month"
              value={monthKey}
              onChange={(e) => changeMonth(e.target.value)}
              className="w-[8.6rem] rounded-md px-1 py-1 text-sm font-semibold text-slate-800 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => changeMonth(shiftMonthKey(monthKey, 1))}
              aria-label="Next month"
              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-none"
            >
              <IconChevronRight className="size-4" />
            </button>
          </div>

          {!isCurrentMonth && (
            <button
              type="button"
              onClick={() => setMonthKey(currentMonthKey)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-none"
            >
              Back to this month
            </button>
          )}

          <button
            type="button"
            onClick={openCreate}
            disabled={!canCreate}
            title={
              canCreate
                ? undefined
                : `Every expense category already has a budget in ${monthTitle(monthKey)}. Edit one instead.`
            }
            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            <IconPlus className="size-4" />
            New budget
          </button>
        </div>
      </div>

      <p className="text-xs text-slate-500">
        Showing <strong className="font-semibold text-slate-700">{monthTitle(monthKey)}</strong>.
        Switching months shows that month&apos;s limits; nothing is copied between them.
      </p>

      {over.length > 0 && (
        <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-rose-900">
            <IconAlert className="size-4 shrink-0" />
            Over budget in {monthTitle(monthKey)}
          </h2>
          <ul className="mt-1.5 space-y-1 text-sm text-rose-800">
            {over.map((r) => (
              <li key={r.category}>
                <strong className="font-semibold">{r.category}</strong> —{' '}
                {formatINR(r.spent)} spent of {formatINR(r.monthlyLimit)},{' '}
                <strong className="font-semibold">{formatINR(r.overBy)} over</strong>.
              </li>
            ))}
          </ul>
        </div>
      )}

      {atLimit.length > 0 && (
        <div role="status" className="rounded-2xl border border-rose-200 bg-white p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-rose-900">
            <IconAlert className="size-4 shrink-0" />
            At the limit in {monthTitle(monthKey)}
          </h2>
          <ul className="mt-1.5 space-y-1 text-sm text-rose-800">
            {atLimit.map((r) => (
              <li key={r.category}>
                <strong className="font-semibold">{r.category}</strong> — exactly{' '}
                {formatINR(r.monthlyLimit)} spent. Nothing is left, but nothing is over yet.
              </li>
            ))}
          </ul>
        </div>
      )}

      {almost.length > 0 && (
        <div role="status" className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-amber-900">
            <IconAlert className="size-4 shrink-0" />
            Approaching a limit in {monthTitle(monthKey)}
          </h2>
          <ul className="mt-1.5 space-y-1 text-sm text-amber-800">
            {almost.map((r) => (
              <li key={r.category}>
                <strong className="font-semibold">{r.category}</strong> —{' '}
                {Math.round(r.rawPct)}% used ({formatINR(r.remaining)} left that month).
              </li>
            ))}
          </ul>
        </div>
      )}

      {rows.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { label: 'Total budget', value: formatINR(totalLimit), tone: 'text-slate-900' },
            {
              label: 'Spent in budgeted categories',
              value: formatINR(totalSpent),
              tone: 'text-slate-900',
            },
            {
              label: totalRemaining < 0 ? 'Over by' : 'Remaining',
              value: formatINR(Math.abs(totalRemaining)),
              tone: totalRemaining < 0 ? 'text-rose-700' : 'text-emerald-700',
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <p className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
                {stat.label}
              </p>
              <p className={`mt-1 text-lg font-bold tabular-nums ${stat.tone}`}>{stat.value}</p>
            </div>
          ))}
        </div>
      )}

      {rows.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold tracking-tight">
              Overall budget used in {monthTitle(monthKey)}
            </h2>
            <p
              className={`text-sm font-semibold tabular-nums ${
                overallOver ? 'text-rose-700' : 'text-slate-700'
              }`}
            >
              {Math.round((totalLimit > 0 ? totalSpent / totalLimit : 0) * 100)}%
            </p>
          </div>
          <div
            className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-slate-100"
            role="progressbar"
            aria-valuenow={Math.round(overallPct)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Overall budget used"
          >
            <div
              className={`h-full rounded-full ${
                overallOver ? 'bg-rose-600' : overallPct >= 80 ? 'bg-amber-500' : 'bg-emerald-500'
              }`}
              style={{ width: `${overallPct}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-slate-500">
            {formatINR(totalSpent)} spent against {formatINR(totalLimit)} budgeted.{' '}
            {overallOver
              ? `${formatINR(Math.abs(totalRemaining))} over across these categories.`
              : `${formatINR(totalRemaining)} still available.`}
          </p>
        </div>
      )}

      {unbudgeted.total > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <h2 className="text-sm font-semibold text-amber-900">
            {formatINR(unbudgeted.total)} of spending is not covered by a budget
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-amber-800">
            These categories have no limit in {monthTitle(monthKey)}, so they are outside the
            figures above: {unbudgeted.items.map((item) => item.category).join(', ')}. Add a
            budget for them if you want them tracked.
          </p>
        </div>
      )}

      {monthBudgets.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <p className="font-medium text-slate-700">
            No budget for {monthTitle(monthKey)} yet
          </p>
          <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-slate-500">
            Each month has its own limits. Set one for {monthTitle(monthKey)} and this page
            tracks that month&apos;s spending, with warnings at 80% and when you cross it.
          </p>
          <button
            type="button"
            onClick={openCreate}
            disabled={!canCreate}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            <IconPlus className="size-4" />
            Set a budget for {monthTitle(monthKey)}
          </button>
          {!canCreate && (
            <p className="mt-2 text-xs text-slate-500">
              Add an expense category before setting a budget.
            </p>
          )}
          {budgets.length > 0 && (
            <p className="mt-3 text-xs text-slate-500">
              You already have budgets in other months — use the month picker above to see
              them.
            </p>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[760px] text-left text-sm">
            <caption className="sr-only">
              Monthly budgets for {monthTitle(monthKey)} and progress
            </caption>
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold tracking-wide text-slate-500 uppercase">
              <tr>
                <th scope="col" className="px-4 py-3">Category</th>
                <th scope="col" className="px-4 py-3 text-right">Budget</th>
                <th scope="col" className="px-4 py-3 text-right">Spent</th>
                <th scope="col" className="px-4 py-3 text-right">Left</th>
                <th scope="col" className="px-4 py-3">Progress</th>
                <th scope="col" className="px-4 py-3">Status</th>
                <th scope="col" className="px-4 py-3 text-right">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((b) => {
                const style = TONE_STYLES[b.tone]
                return (
                  <tr key={`${b.month}:${b.category}`} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-medium text-slate-800">{b.category}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                      {formatINR(b.monthlyLimit)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                      {formatINR(b.spent)}
                    </td>
                    <td
                      className={`px-4 py-3 text-right tabular-nums font-medium ${
                        b.remaining < 0 ? 'text-rose-700' : 'text-slate-600'
                      }`}
                    >
                      {b.remaining < 0 ? '−' : ''}
                      {formatINR(Math.abs(b.remaining))}
                    </td>
                    <td className="px-4 py-3" style={{ minWidth: 160 }}>
                      <div
                        className="h-2 w-full overflow-hidden rounded-full bg-slate-100"
                        role="progressbar"
                        aria-valuenow={Math.round(b.pct)}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuetext={`${Math.round(b.rawPct)}% of budget used`}
                        aria-label={`${b.category}: ${Math.round(b.rawPct)}% of budget used`}
                      >
                        <div
                          className={`h-full rounded-full ${style.bar}`}
                          style={{ width: `${b.pct}%` }}
                        />
                      </div>
                      <span className="mt-1 block text-[11px] text-slate-500">
                        {Math.round(b.rawPct)}% used
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${style.chip}`}
                      >
                        {b.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => openEdit(b)}
                          aria-label={`Edit budget for ${b.category} in ${monthTitle(b.month)}`}
                          title="Edit budget"
                          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-none"
                        >
                          <IconEdit className="size-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingDelete(b)}
                          aria-label={`Delete budget for ${b.category} in ${monthTitle(b.month)}`}
                          title="Delete budget"
                          className="rounded-lg p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-700 focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:outline-none"
                        >
                          <IconTrash className="size-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {rows.length > 0 && !canCreate && expenseCategories.length > 0 && (
        <p className="text-xs text-slate-500">
          Every expense category has a budget in {monthTitle(monthKey)}. Edit a limit above to
          change it.
        </p>
      )}

      <BudgetFormModal
        open={formOpen}
        initial={editing}
        categories={categories}
        budgets={budgets}
        transactions={transactions}
        monthKey={editing?.month ?? monthKey}
        onClose={() => setFormOpen(false)}
        onSave={handleSave}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this budget?"
        description={
          pendingDelete && (
            <>
              <p className="font-medium text-slate-800">
                {pendingDelete.category} · {formatINR(pendingDelete.monthlyLimit)} for{' '}
                {monthTitle(pendingDelete.month)}
              </p>
              <p className="mt-1">
                Only this month&apos;s limit is removed. Transactions stay exactly where they
                are, and budgets for other months are untouched.
              </p>
            </>
          )
        }
        confirmLabel={deleting ? 'Removing…' : 'Delete budget'}
        busy={deleting}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}
