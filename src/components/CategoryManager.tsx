import { useEffect, useRef, useState } from 'react'
import type { BudgetDef, CategoryDef, Transaction } from '../types'
import {
  CATEGORY_NAME_MAX,
  categoryUsage,
  deleteBlockReason,
  kindChangeBlockReason,
  usageHint,
  usageLabel,
  validateCategoryDraft,
  type CategoryDraft,
  type CategoryErrors,
  type CategoryField,
  type CategoryKind,
} from '../lib/categoryForm'
import { ConfirmDialog } from './ConfirmDialog'
import { IconEdit, IconPlus, IconTrash, IconX } from './Icons'

interface Props {
  categories: CategoryDef[]
  transactions: Transaction[]
  budgets: BudgetDef[]
  /** Create (current = null) or change one category, then refresh the app. */
  onSave: (current: CategoryDef | null, values: CategoryDraft) => Promise<void>
  onDelete: (name: string) => Promise<void>
  onNotify: (message: string, tone?: 'success' | 'error' | 'warning') => void
}

const BASE_INPUT =
  'w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition focus:ring-2 focus:outline-none'
const labelCls = 'mb-1.5 block text-sm font-medium text-slate-700'

const messageOf = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback

/**
 * Settings → Categories: create, rename, recolour and delete categories.
 *
 * Rules come from `lib/categoryForm` so this component only decides layout:
 *   - renaming and recolouring are always allowed (records point at the
 *     category by id, so history follows it)
 *   - changing income/expense and deleting are refused while transactions or
 *     budgets still reference the category
 */
export function CategoryManager({
  categories,
  transactions,
  budgets,
  onSave,
  onDelete,
  onNotify,
}: Props) {
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<CategoryDef | null>(null)
  const [pendingDelete, setPendingDelete] = useState<CategoryDef | null>(null)
  const [deleting, setDeleting] = useState(false)

  const openCreate = () => {
    setEditing(null)
    setFormOpen(true)
  }

  const openEdit = (category: CategoryDef) => {
    setEditing(category)
    setFormOpen(true)
  }

  const confirmDelete = async () => {
    const target = pendingDelete
    if (!target) return

    const reason = deleteBlockReason(
      target.name,
      categoryUsage(target.name, transactions, budgets),
    )
    if (reason) {
      onNotify(reason, 'error')
      setPendingDelete(null)
      return
    }

    setDeleting(true)
    try {
      await onDelete(target.name)
      setPendingDelete(null)
      onNotify(`Deleted the category “${target.name}”.`, 'success')
    } catch (err) {
      onNotify(messageOf(err, `Could not delete “${target.name}”.`), 'error')
    } finally {
      setDeleting(false)
    }
  }

  const groups: Array<{ kind: CategoryKind; title: string; blurb: string }> = [
    { kind: 'income', title: 'Income', blurb: 'Where money comes from.' },
    { kind: 'expense', title: 'Expense', blurb: 'What you spend money on.' },
  ]

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold tracking-tight">Categories</h2>
          <p className="mt-1 text-sm text-slate-500">
            Name, colour and type for every category you can pick in a transaction. Editing one
            never changes the transactions already filed under it.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          <IconPlus className="mr-1 inline h-4 w-4" aria-hidden="true" />
          Add category
        </button>
      </div>

      <div className="mt-6 space-y-6">
        {groups.map((group) => {
          const rows = categories.filter((c) => c.type === group.kind)
          return (
            <section key={group.kind} aria-labelledby={`cat-group-${group.kind}`}>
              <h3
                id={`cat-group-${group.kind}`}
                className="text-xs font-semibold tracking-wide text-slate-500 uppercase"
              >
                {group.title} · {rows.length}
              </h3>
              <p className="mt-0.5 text-xs text-slate-400">{group.blurb}</p>

              {rows.length === 0 ? (
                <p className="mt-2 rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-3 py-3 text-sm text-slate-500">
                  No {group.title.toLowerCase()} categories yet.
                </p>
              ) : (
                <ul className="mt-2 divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200">
                  {rows.map((category) => {
                    const usage = categoryUsage(category.name, transactions, budgets)
                    const block = deleteBlockReason(category.name, usage)
                    return (
                      <li
                        key={category.name}
                        className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5"
                      >
                        <span
                          aria-hidden="true"
                          className="h-4 w-4 shrink-0 rounded-full ring-1 ring-black/10"
                          style={{ backgroundColor: category.color }}
                        />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">
                          {category.name}
                        </span>
                        <span
                          className={`text-xs ${usage.transactions + usage.budgets > 0 ? 'text-slate-500' : 'text-slate-400'}`}
                        >
                          {usageLabel(usage)}
                        </span>
                        <span className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => openEdit(category)}
                            aria-label={`Edit ${category.name}`}
                            className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-none"
                          >
                            <IconEdit className="h-4 w-4" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setPendingDelete(category)}
                            aria-label={`Delete ${category.name}`}
                            title={block ?? `Delete ${category.name}`}
                            disabled={Boolean(block)}
                            className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-slate-200 disabled:hover:bg-transparent disabled:hover:text-slate-500"
                          >
                            <IconTrash className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          )
        })}
      </div>

      {formOpen && (
        <CategoryForm
          key={editing?.name ?? 'new-category'}
          initial={editing}
          categories={categories}
          transactions={transactions}
          budgets={budgets}
          onClose={() => setFormOpen(false)}
          onSaved={() => setFormOpen(false)}
          notify={onNotify}
          onSave={onSave}
        />
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this category?"
        description={
          pendingDelete && (
            <>
              <p className="font-medium text-slate-800">“{pendingDelete.name}”</p>
              <p className="mt-1">
                {deleteBlockReason(
                  pendingDelete.name,
                  categoryUsage(pendingDelete.name, transactions, budgets),
                ) ??
                  'Transactions already filed under it keep their history only if you re-file them first — right now nothing uses it, so it is safe to delete.'}
              </p>
            </>
          )
        }
        confirmLabel={deleting ? 'Deleting…' : 'Delete'}
        busy={deleting}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}

interface FormProps {
  /** null = creating a new category. */
  initial: CategoryDef | null
  categories: CategoryDef[]
  transactions: Transaction[]
  budgets: BudgetDef[]
  onClose: () => void
  onSaved: () => void
  notify: (message: string, tone?: 'success' | 'error' | 'warning') => void
  onSave: (current: CategoryDef | null, values: CategoryDraft) => Promise<void>
}

function CategoryForm({
  initial,
  categories,
  transactions,
  budgets,
  onClose,
  onSaved,
  notify,
  onSave,
}: FormProps) {
  const nameRef = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState<CategoryDraft>({
    name: initial?.name ?? '',
    kind: initial?.type ?? 'expense',
    color: initial?.color ?? '#64748b',
  })
  const [errors, setErrors] = useState<CategoryErrors>({})
  const [summary, setSummary] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const usage = initial ? categoryUsage(initial.name, transactions, budgets) : null
  const kindLocked =
    initial !== null && usage !== null && kindChangeBlockReason(initial.name, usage) !== null

  useEffect(() => {
    nameRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, saving])

  const update = (patch: Partial<CategoryDraft>) => {
    setDraft((prev) => ({ ...prev, ...patch }))
    setErrors((prev) => {
      const next = { ...prev }
      for (const key of Object.keys(patch) as CategoryField[]) delete next[key]
      return next
    })
    setSummary(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (saving) return

    const result = validateCategoryDraft(draft, { categories, editing: initial?.name ?? null })
    if (!result.values) {
      setErrors(result.errors)
      setSummary('Please fix the highlighted fields, then save again.')
      const first = (['name', 'kind', 'color'] as CategoryField[]).find((f) => result.errors[f])
      if (first === 'name') nameRef.current?.focus()
      return
    }

    setSaving(true)
    setSummary(null)
    try {
      await onSave(initial, result.values)
      notify(
        initial
          ? `Saved the category “${result.values.name}”.`
          : `Added the category “${result.values.name}”.`,
        'success',
      )
      onSaved()
    } catch (err) {
      // Keep the dialog open so nothing the user typed is lost.
      setSummary(messageOf(err, 'Could not save the category. Please try again.'))
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-slate-900/50" aria-hidden="true" onClick={onClose} />
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="cat-form-title"
        onSubmit={(e) => void handleSubmit(e)}
        className="relative max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-6 shadow-2xl sm:max-w-md sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="cat-form-title" className="text-lg font-semibold tracking-tight">
              {initial ? 'Edit category' : 'Add category'}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {initial
                ? 'Transactions already filed under it keep their category.'
                : 'Available the next time you add a transaction.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-none"
          >
            <IconX className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <div>
            <label htmlFor="cat-name" className={labelCls}>
              Name
            </label>
            <input
              ref={nameRef}
              id="cat-name"
              type="text"
              autoComplete="off"
              maxLength={CATEGORY_NAME_MAX}
              aria-required="true"
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? 'cat-name-error' : undefined}
              value={draft.name}
              onChange={(e) => update({ name: e.target.value })}
              placeholder="e.g. Pet care"
              className={`${BASE_INPUT} ${
                errors.name
                  ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/30'
                  : 'border-slate-300 focus:border-emerald-500 focus:ring-emerald-500/40'
              }`}
            />
            {errors.name && (
              <p id="cat-name-error" className="mt-1 text-xs font-medium text-rose-600">
                {errors.name}
              </p>
            )}
          </div>

          <fieldset>
            <legend className={labelCls}>Type</legend>
            <div className="grid grid-cols-2 gap-2">
              {(['expense', 'income'] as CategoryKind[]).map((kind) => (
                <label
                  key={kind}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium ${
                    draft.kind === kind
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                      : 'border-slate-300 text-slate-600'
                  } ${kindLocked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
                >
                  <input
                    type="radio"
                    name="cat-kind"
                    className="accent-emerald-600"
                    value={kind}
                    checked={draft.kind === kind}
                    disabled={kindLocked}
                    onChange={() => update({ kind })}
                  />
                  {kind === 'expense' ? 'Expense' : 'Income'}
                </label>
              ))}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {initial && usage ? usageHint(usage) : 'Expense categories can have budgets.'}
            </p>
            {errors.kind && <p className="mt-1 text-xs font-medium text-rose-600">{errors.kind}</p>}
          </fieldset>

          <div>
            <label htmlFor="cat-color" className={labelCls}>
              Colour
            </label>
            <div className="flex items-center gap-3">
              <input
                id="cat-color"
                type="color"
                aria-invalid={Boolean(errors.color)}
                value={draft.color}
                onChange={(e) => update({ color: e.target.value })}
                className="h-10 w-16 cursor-pointer rounded-lg border border-slate-300 bg-white p-1 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-none"
              />
              <span className="text-sm text-slate-500">{draft.color.toUpperCase()}</span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Used for this category in the dashboard and budget charts.
            </p>
            {errors.color && (
              <p className="mt-1 text-xs font-medium text-rose-600">{errors.color}</p>
            )}
          </div>

          {summary && (
            <p
              role="alert"
              className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700"
            >
              {summary}
            </p>
          )}
        </div>

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:bg-emerald-400"
          >
            {saving ? 'Saving…' : initial ? 'Save changes' : 'Add category'}
          </button>
        </div>
      </form>
    </div>
  )
}
