import { useEffect, useRef, useState } from 'react'
import type { BudgetDef, CategoryDef, Transaction } from '../types'
import { AMOUNT_MAX } from '../lib/transactionForm'
import { formatINR, formatINRCompact } from '../lib/format'
import { monthTitle, roundMoney, spendingByCategory } from '../lib/finance'
import { IconX } from './Icons'

interface Props {
  open: boolean
  /** `null` = set a new budget; a budget = change that category's limit. */
  initial: BudgetDef | null
  categories: CategoryDef[]
  budgets: BudgetDef[]
  transactions: Transaction[]
  /** The month this budget belongs to, "YYYY-MM". */
  monthKey: string
  onClose: () => void
  /** Rejects with a user-facing message when the database write fails. */
  onSave: (category: string, monthlyLimit: number) => Promise<void>
}

const BASE_INPUT =
  'w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition focus:ring-2 focus:outline-none'

const LIMIT_PATTERN = /^\d{1,9}(\.\d{1,2})?$/

const labelCls = 'mb-1.5 block text-sm font-medium text-slate-700'

/**
 * One budget, one category, one month.
 * - the category is fixed once a budget exists (changing it would silently
 *   move the limit to another category, so delete and re-create instead)
 * - the month comes from the page's month picker; other months are separate
 * - limit rules match the transaction amount rules: positive rupees, at most
 *   two decimals, ₹10 crore ceiling
 * - Escape and the backdrop close without saving
 */
export function BudgetFormModal(props: Props) {
  if (!props.open) return null
  return <BudgetForm key={props.initial?.category ?? 'new-budget'} {...props} />
}

function BudgetForm({
  initial,
  categories,
  budgets,
  transactions,
  monthKey,
  onClose,
  onSave,
}: Omit<Props, 'open'>) {
  const isEdit = initial !== null
  const limitRef = useRef<HTMLInputElement>(null)
  const categoryRef = useRef<HTMLSelectElement>(null)

  const taken = new Set(
    budgets.filter((b) => b.month === monthKey).map((b) => b.category),
  )
  const options = categories.filter(
    (c) =>
      c.type === 'expense' &&
      (initial ? c.name === initial.category : !taken.has(c.name)),
  )

  const [category, setCategory] = useState(initial?.category ?? options[0]?.name ?? '')
  const [limit, setLimit] = useState(initial ? String(initial.monthlyLimit) : '')
  const [categoryError, setCategoryError] = useState<string | null>(null)
  const [limitError, setLimitError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (isEdit) limitRef.current?.focus()
    else categoryRef.current?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isEdit, onClose, saving])

  const spent = category ? (spendingByCategory(transactions, monthKey)[category] ?? 0) : 0

  const typedLimit = Number(limit)
  const hasTypedLimit = LIMIT_PATTERN.test(limit.trim()) && typedLimit > 0
  const difference = hasTypedLimit ? roundMoney(typedLimit - spent) : null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (saving) return

    let valid = true
    if (!category) {
      setCategoryError('Choose the category this budget is for.')
      valid = false
    }
    if (options.length === 0) {
      setFormError(
        'Every expense category already has a budget for this month. Edit one below, or switch to another month.',
      )
      return
    }

    const text = limit.trim()
    if (!text) {
      setLimitError('Enter a monthly limit.')
      valid = false
    } else if (!LIMIT_PATTERN.test(text)) {
      setLimitError('Use digits only, with up to 2 decimals (for example 8000 or 8000.50).')
      valid = false
    } else if (Number(text) <= 0) {
      setLimitError('The limit must be more than ₹0.')
      valid = false
    } else if (Number(text) > AMOUNT_MAX) {
      setLimitError(`The limit must be at most ${formatINRCompact(AMOUNT_MAX)}.`)
      valid = false
    }

    setFormError(null)
    if (!valid) {
      if (!category) categoryRef.current?.focus()
      else limitRef.current?.focus()
      return
    }

    setSaving(true)
    try {
      await onSave(category, Math.round(Number(text) * 100) / 100)
      onClose()
    } catch (err) {
      setFormError(
        err instanceof Error && err.message
          ? err.message
          : 'Could not save the budget. Please try again.',
      )
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div
        className="absolute inset-0 bg-slate-900/50"
        aria-hidden="true"
        onClick={saving ? undefined : onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="budget-form-title"
        className="relative max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-6 shadow-2xl sm:max-w-lg sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="budget-form-title" className="text-lg font-semibold tracking-tight">
              {isEdit ? 'Edit budget' : 'Set a budget'}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              One limit per expense category · {monthTitle(monthKey)} only
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Close dialog"
            className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-none disabled:opacity-50"
          >
            <IconX className="size-4" />
          </button>
        </div>

        <form className="mt-4 space-y-4" onSubmit={handleSubmit} noValidate>
          <div>
            <label htmlFor="budget-category" className={labelCls}>
              Category
            </label>
            <select
              ref={categoryRef}
              id="budget-category"
              aria-required="true"
              aria-invalid={Boolean(categoryError)}
              aria-describedby={categoryError ? 'budget-category-error' : 'budget-category-help'}
              value={category}
              disabled={isEdit || saving}
              onChange={(e) => {
                setCategory(e.target.value)
                setCategoryError(null)
                setFormError(null)
              }}
              className={`${BASE_INPUT} ${
                categoryError
                  ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/30'
                  : 'border-slate-300 focus:border-emerald-500 focus:ring-emerald-500/40'
              } disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500`}
            >
              <option value="" disabled>
                Choose a category…
              </option>
              {options.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
            <p id="budget-category-help" className="mt-1 text-xs text-slate-500">
              {isEdit
                ? 'The category is fixed. Delete this budget to move it elsewhere.'
                : 'Only expense categories without a budget for this month are listed.'}
            </p>
            {categoryError && (
              <p id="budget-category-error" className="mt-1 text-xs font-medium text-rose-600">
                {categoryError}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="budget-limit" className={labelCls}>
              Monthly limit (₹)
            </label>
            <input
              ref={limitRef}
              id="budget-limit"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="e.g. 8000"
              aria-required="true"
              aria-invalid={Boolean(limitError)}
              aria-describedby={limitError ? 'budget-limit-error' : 'budget-limit-help'}
              value={limit}
              onChange={(e) => {
                setLimit(e.target.value)
                setLimitError(null)
                setFormError(null)
              }}
              className={`${BASE_INPUT} ${
                limitError
                  ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/30'
                  : 'border-slate-300 focus:border-emerald-500 focus:ring-emerald-500/40'
              }`}
            />
            <p id="budget-limit-help" className="mt-1 text-xs text-slate-500">
              How much you plan to spend in {category || 'this category'} during{' '}
              {monthTitle(monthKey)}. Other months have their own limits.
            </p>
            {limitError && (
              <p id="budget-limit-error" className="mt-1 text-xs font-medium text-rose-600">
                {limitError}
              </p>
            )}
          </div>

          {category && (
            <div className="rounded-xl bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
              <p>
                Spent in {monthTitle(monthKey)}: <strong>{formatINR(spent)}</strong>
              </p>
              {difference !== null && (
                <p className={`mt-0.5 font-medium ${difference < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                  {difference < 0
                    ? `${formatINR(Math.abs(difference))} over that limit already`
                    : `${formatINR(difference)} would be left`}
                </p>
              )}
            </div>
          )}

          <div aria-live="polite" className="min-h-5">
            {formError && (
              <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
                {formError}
              </p>
            )}
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || options.length === 0}
              className="flex-1 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:bg-emerald-400"
            >
              {saving ? 'Saving…' : isEdit ? 'Save budget' : 'Set budget'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
