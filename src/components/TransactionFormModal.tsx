import { useEffect, useRef, useState } from 'react'
import type { AccountDef, CategoryDef, Transaction, TxType } from '../types'
import {
  clearDraft,
  hasDraftContent,
  readDraft,
  writeDraft,
  type StoredDraft,
} from '../lib/draftStorage'
import {
  NOTE_MAX,
  draftFromTransaction,
  emptyDraft,
  validateDraft,
  type DraftErrors,
  type DraftField,
  type TransactionDraft,
} from '../lib/transactionForm'
import { useFocusTrap } from '../lib/useFocusTrap'
import { IconX } from './Icons'

interface Props {
  open: boolean
  /** `null` = add a new transaction; a transaction = edit that one. */
  initial: Transaction | null
  categories: CategoryDef[]
  accounts: AccountDef[]
  /** All current transactions; used to check transfer balances. */
  transactions: Transaction[]
  /** Owner of the draft; keeps one user's unsaved form away from another's. */
  userId: string
  onClose: () => void
  /**
   * Rejects with a user-facing message when the database write fails.
   * `pendingId` is stable across retries of the same draft, which makes the
   * insert idempotent.
   */
  onSave: (values: Omit<Transaction, 'id'>, pendingId: string) => Promise<void>
}

/** UUID v4 for the client-generated row id, with a fallback for old browsers. */
function newPendingId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16)
    const value = char === 'x' ? random : (random & 0x3) | 0x8
    return value.toString(16)
  })
}

function formatSavedAt(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return 'earlier'
  return date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
}

const BASE_INPUT =
  'w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition focus:ring-2 focus:outline-none'

function inputClasses(hasError: boolean): string {
  return `${BASE_INPUT} ${
    hasError
      ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/30'
      : 'border-slate-300 focus:border-emerald-500 focus:ring-emerald-500/40'
  }`
}

const labelCls = 'mb-1.5 block text-sm font-medium text-slate-700'

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null
  return (
    <p id={id} className="mt-1 text-xs font-medium text-rose-600">
      {message}
    </p>
  )
}

/**
 * The single transaction form, used for both add and edit.
 *
 * Accessibility notes:
 * - it is a real dialog (`role="dialog"` + `aria-modal`) labelled by the title
 * - Escape and the backdrop close it; focus lands on the amount field
 * - every input has a visible label
 * - each error is tied to its input via `aria-describedby` + `aria-invalid`,
 *   and the first invalid field is focused after a failed save
 * - a polite live region announces the summary message
 */
export function TransactionFormModal(props: Props) {
  if (!props.open) return null
  // A fresh key per target means the form mounts already holding the right
  // values, so nothing has to be reset in an effect (which could wipe what
  // you just typed).
  return (
    <TransactionForm
      key={props.initial?.id ?? 'new'}
      initial={props.initial}
      categories={props.categories}
      accounts={props.accounts}
      transactions={props.transactions}
      userId={props.userId}
      onClose={props.onClose}
      onSave={props.onSave}
    />
  )
}

function TransactionForm({
  initial,
  categories,
  accounts,
  transactions,
  userId,
  onClose,
  onSave,
}: Omit<Props, 'open'>) {
  const isEdit = initial !== null
  const storage = typeof window === 'undefined' ? null : window.localStorage
  const amountRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  // The component only mounts while the dialog is open, so the trap is
  // always active here. Initial focus still lands on the amount field.
  useFocusTrap(dialogRef, true)

  // A draft left behind by a failed save, a closed tab or a reload is offered
  // back instead of being lost. It keeps the same pending id, so saving it
  // cannot create a second copy of a write that actually went through.
  const [restoredDraft] = useState<StoredDraft | null>(() => {
    if (isEdit || !storage) return null
    const stored = readDraft(storage, userId)
    return stored && hasDraftContent(stored.values) ? stored : null
  })
  const [draft, setDraft] = useState<TransactionDraft>(() => {
    if (initial) return draftFromTransaction(initial)
    return restoredDraft?.values ?? emptyDraft(accounts)
  })
  const [draftRestored, setDraftRestored] = useState(restoredDraft !== null)
  const [errors, setErrors] = useState<DraftErrors>({})
  const [summary, setSummary] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const pendingIdRef = useRef(initial?.id ?? restoredDraft?.pendingId ?? newPendingId())
  /** Synchronous guard: state alone can lag behind a fast double submit. */
  const savingRef = useRef(false)
  const savedRef = useRef(false)

  useEffect(() => {
    // Put the cursor where a person starts typing.
    amountRef.current?.focus()

    const onKey = (e: KeyboardEvent) => {
      // Do not let Escape close the dialog while a save is in flight.
      if (e.key === 'Escape' && !savingRef.current) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Keep the unfinished form on this device until it is saved or discarded.
  useEffect(() => {
    if (isEdit || !storage || savedRef.current) return
    if (!hasDraftContent(draft)) {
      clearDraft(storage, userId)
      return
    }
    writeDraft(storage, userId, pendingIdRef.current, draft)
  }, [draft, isEdit, storage, userId])

  const discardDraft = () => {
    if (storage) clearDraft(storage, userId)
    setDraft(emptyDraft(accounts))
    setErrors({})
    setSummary(null)
    setDraftRestored(false)
    pendingIdRef.current = newPendingId()
  }

  const isTransfer = draft.type === 'transfer'
  const categoryOptions = categories.filter(
    (c) => c.type === (draft.type === 'income' ? 'income' : 'expense'),
  )
  const formError = summary

  const fieldId = (field: DraftField): string => {
    switch (field) {
      case 'amount':
        return 'tx-amount'
      case 'date':
        return 'tx-date'
      case 'category':
        return 'tx-category'
      case 'account':
        return isTransfer ? 'tx-from' : 'tx-account'
      case 'toAccount':
        return 'tx-to'
      case 'note':
        return 'tx-note'
      default:
        return ''
    }
  }

  const update = (patch: Partial<TransactionDraft>) => {
    setDraft((prev) => ({ ...prev, ...patch }))
    // Clear only the errors that this change could fix.
    setErrors((prev) => {
      const next = { ...prev }
      for (const key of Object.keys(patch) as DraftField[]) delete next[key]
      return next
    })
    setSummary(null)
  }

  const changeType = (type: TxType) => {
    setDraft((prev) => ({
      ...prev,
      type,
      category: '',
      toAccount:
        type === 'transfer'
          ? (accounts.find((a) => a.name !== prev.account)?.name ?? '')
          : '',
    }))
    setErrors({})
    setSummary(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (savingRef.current) return

    const result = validateDraft(draft, {
      categories,
      accounts,
      // Exclude the record being edited so its old amount doesn't count.
      transactions: transactions.filter((t) => t.id !== initial?.id),
    })

    if (!result.values) {
      setErrors(result.errors)
      setSummary('Please fix the highlighted fields, then save again.')
      const first = (
        ['amount', 'date', 'account', 'category', 'toAccount', 'note'] as DraftField[]
      ).find((f) => result.errors[f])
      if (first) document.getElementById(fieldId(first))?.focus()
      return
    }

    savingRef.current = true
    setSaving(true)
    setSummary(null)
    try {
      await onSave(result.values, pendingIdRef.current)
      savedRef.current = true
      if (storage) clearDraft(storage, userId)
      onClose()
    } catch (err) {
      // Keep the dialog open with the user's values so nothing is retyped,
      // and leave the local draft in place in case the tab is closed.
      setSummary(
        err instanceof Error && err.message
          ? err.message
          : 'Could not save to the database. Please try again.',
      )
      savingRef.current = false
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div
        className="absolute inset-0 bg-slate-900/50"
        aria-hidden="true"
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tx-form-title"
        className="relative max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-6 shadow-2xl sm:max-w-lg sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="tx-form-title" className="text-lg font-semibold tracking-tight">
              {isEdit ? 'Edit transaction' : 'Add transaction'}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {isEdit
                ? 'Saved to your account — available on every device you sign in to.'
                : 'Saved to your account. Until then, this form is kept on this device.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-none"
          >
            <IconX className="size-4" />
          </button>
        </div>

        <form className="mt-4 space-y-4" onSubmit={handleSubmit} noValidate>
          {!isEdit && draftRestored && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
              <p>
                <span className="font-semibold">Unsaved draft restored</span> from{' '}
                {restoredDraft ? formatSavedAt(restoredDraft.savedAt) : 'earlier'}. It was
                never confirmed by the server, so check it before saving.
              </p>
              <button
                type="button"
                onClick={discardDraft}
                className="mt-1 font-semibold text-amber-900 underline underline-offset-2 hover:text-amber-950 focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:outline-none"
              >
                Discard draft
              </button>
            </div>
          )}
          <fieldset aria-describedby="tx-type-help">
            <legend className={labelCls}>Type</legend>
            <p id="tx-type-help" className="sr-only">
              Choose income, expense or transfer.
            </p>
            <div role="radiogroup" aria-label="Transaction type" className="grid grid-cols-3 gap-2">
              {(['expense', 'income', 'transfer'] as const).map((t) => (
                <label
                  key={t}
                  className={`flex cursor-pointer items-center justify-center rounded-lg border px-2 py-2 text-sm font-medium capitalize transition focus-within:ring-2 focus-within:ring-emerald-500/40 ${
                    draft.type === t
                      ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                      : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="tx-type"
                    value={t}
                    checked={draft.type === t}
                    onChange={() => changeType(t)}
                    className="sr-only"
                  />
                  {t}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="tx-amount" className={labelCls}>
                Amount (₹)
              </label>
              <input
                ref={amountRef}
                id="tx-amount"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="e.g. 249.50"
                aria-required="true"
                aria-invalid={Boolean(errors.amount)}
                aria-describedby={errors.amount ? 'tx-amount-error' : 'tx-amount-help'}
                value={draft.amount}
                onChange={(e) => update({ amount: e.target.value })}
                className={inputClasses(Boolean(errors.amount))}
              />
              <p id="tx-amount-help" className="mt-1 text-xs text-slate-500">
                Positive rupees only, up to 2 decimals.
              </p>
              <FieldError id="tx-amount-error" message={errors.amount} />
            </div>
            <div>
              <label htmlFor="tx-date" className={labelCls}>
                Date
              </label>
              <input
                id="tx-date"
                type="date"
                aria-required="true"
                aria-invalid={Boolean(errors.date)}
                aria-describedby={errors.date ? 'tx-date-error' : undefined}
                value={draft.date}
                onChange={(e) => update({ date: e.target.value })}
                className={inputClasses(Boolean(errors.date))}
              />
              <FieldError id="tx-date-error" message={errors.date} />
            </div>
          </div>

          {isTransfer ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="tx-from" className={labelCls}>
                  From account
                </label>
                <select
                  id="tx-from"
                  aria-required="true"
                  aria-invalid={Boolean(errors.account)}
                  aria-describedby={errors.account ? 'tx-from-error' : undefined}
                  value={draft.account}
                  onChange={(e) => update({ account: e.target.value })}
                  className={inputClasses(Boolean(errors.account))}
                >
                  <option value="" disabled>
                    From…
                  </option>
                  {accounts.map((a) => (
                    <option key={a.name} value={a.name}>
                      {a.name}
                    </option>
                  ))}
                </select>
                <FieldError id="tx-from-error" message={errors.account} />
              </div>
              <div>
                <label htmlFor="tx-to" className={labelCls}>
                  To account
                </label>
                <select
                  id="tx-to"
                  aria-required="true"
                  aria-invalid={Boolean(errors.toAccount)}
                  aria-describedby={errors.toAccount ? 'tx-to-error' : undefined}
                  value={draft.toAccount}
                  onChange={(e) => update({ toAccount: e.target.value })}
                  className={inputClasses(Boolean(errors.toAccount))}
                >
                  <option value="" disabled>
                    To…
                  </option>
                  {accounts.map((a) => (
                    <option key={a.name} value={a.name}>
                      {a.name}
                    </option>
                  ))}
                </select>
                <FieldError id="tx-to-error" message={errors.toAccount} />
              </div>
            </div>
          ) : (
            <>
              <div>
                <label htmlFor="tx-category" className={labelCls}>
                  Category
                </label>
                <select
                  id="tx-category"
                  aria-required="true"
                  aria-invalid={Boolean(errors.category)}
                  aria-describedby={errors.category ? 'tx-category-error' : undefined}
                  value={draft.category}
                  onChange={(e) => update({ category: e.target.value })}
                  className={inputClasses(Boolean(errors.category))}
                >
                  <option value="" disabled>
                    Choose a category…
                  </option>
                  {categoryOptions.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <FieldError id="tx-category-error" message={errors.category} />
              </div>
              <div>
                <label htmlFor="tx-account" className={labelCls}>
                  Account
                </label>
                <select
                  id="tx-account"
                  aria-required="true"
                  aria-invalid={Boolean(errors.account)}
                  aria-describedby={errors.account ? 'tx-account-error' : undefined}
                  value={draft.account}
                  onChange={(e) => update({ account: e.target.value })}
                  className={inputClasses(Boolean(errors.account))}
                >
                  <option value="" disabled>
                    Which account?
                  </option>
                  {accounts.map((a) => (
                    <option key={a.name} value={a.name}>
                      {a.name}
                    </option>
                  ))}
                </select>
                <FieldError id="tx-account-error" message={errors.account} />
              </div>
            </>
          )}

          <div>
            <label htmlFor="tx-note" className={labelCls}>
              Note <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <input
              id="tx-note"
              type="text"
              placeholder={isTransfer ? 'e.g. Moving to savings' : 'e.g. Groceries at the market'}
              aria-invalid={Boolean(errors.note)}
              aria-describedby={errors.note ? 'tx-note-error' : undefined}
              value={draft.note}
              onChange={(e) => update({ note: e.target.value })}
              className={inputClasses(Boolean(errors.note))}
            />
            {draft.note.trim().length > 90 && !errors.note && (
              <p className="mt-1 text-right text-[11px] text-slate-400">
                {draft.note.trim().length}/{NOTE_MAX}
              </p>
            )}
            <FieldError id="tx-note-error" message={errors.note} />
          </div>

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
              disabled={saving}
              className="flex-1 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:bg-emerald-400"
            >
              {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add transaction'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
