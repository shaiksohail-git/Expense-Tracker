import type { AccountDef, CategoryDef, Transaction, TxType } from '../types'
import { accountBalance, roundMoney } from './finance'
import { formatINR, formatINRCompact } from './format'

/**
 * One form shape for both "add" and "edit", so there is exactly one place
 * where a transaction is validated and turned into a Transaction record.
 *
 * Everything in a draft is a string because that is what inputs hold. The
 * validation step is the only thing allowed to turn text into numbers.
 */

export interface TransactionDraft {
  type: TxType
  amount: string
  date: string
  category: string
  account: string
  toAccount: string
  note: string
}

export type DraftField = keyof TransactionDraft
export type DraftErrors = Partial<Record<DraftField, string>>

export interface ValidationContext {
  categories: CategoryDef[]
  accounts: AccountDef[]
  /** Every transaction *except* the one being edited (so edits don't count twice). */
  transactions: Transaction[]
  /** Injectable clock — keeps tests deterministic. */
  today?: Date
}

/** Largest amount this tracker accepts: ₹10 crore. */
export const AMOUNT_MAX = 100_000_000
export const NOTE_MAX = 120

/** Digits with an optional 2-decimal tail: "1200", "1200.5", "1200.50". */
const AMOUNT_PATTERN = /^\d{1,9}(\.\d{1,2})?$/

const pad = (n: number) => String(n).padStart(2, '0')

/** Local-date ISO string (never UTC, so "today" never slips a day). */
export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Strict "YYYY-MM-DD" parse: rejects "2026-02-31", "hello", "26-01-01". */
export function parseISODate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [y, m, d] = value.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) {
    return null
  }
  return date
}

export function emptyDraft(accounts: AccountDef[] = []): TransactionDraft {
  return {
    type: 'expense',
    amount: '',
    date: toISODate(new Date()),
    category: '',
    // Default to the first account so a beginner can save in two clicks.
    account: accounts[0]?.name ?? '',
    toAccount: accounts[1]?.name ?? '',
    note: '',
  }
}

/** Turn a saved transaction back into editable form values. */
export function draftFromTransaction(tx: Transaction): TransactionDraft {
  return {
    type: tx.type,
    amount: String(tx.amount),
    date: tx.date,
    category: tx.category ?? '',
    account: tx.account,
    toAccount: tx.toAccount ?? '',
    note: tx.note,
  }
}

export interface ValidationResult {
  errors: DraftErrors
  /** Present only when `errors` is empty. */
  values: Omit<Transaction, 'id'> | null
}

/**
 * The single source of truth for what a valid transaction is.
 * Enforces the data model invariants:
 *   - amount is a positive rupee value with at most 2 decimals
 *   - date is a real calendar date between 1970 and one year from today
 *   - income / expense carry a category of the same kind + one account
 *   - transfer carries two *different* accounts, no category, and cannot
 *     move more money than that account actually holds
 *   - note is short enough to display
 */
export function validateDraft(draft: TransactionDraft, ctx: ValidationContext): ValidationResult {
  const errors: DraftErrors = {}
  const isTransfer = draft.type === 'transfer'

  // ---- amount -------------------------------------------------------------
  const amountText = draft.amount.trim()
  let amount = Number.NaN
  if (!amountText) {
    errors.amount = 'Enter an amount.'
  } else if (!AMOUNT_PATTERN.test(amountText)) {
    errors.amount = 'Use digits only, with up to 2 decimals (for example 1200 or 1200.50).'
  } else {
    amount = Number(amountText)
    if (amount <= 0) {
      errors.amount = 'Amount must be more than ₹0.'
    } else if (amount > AMOUNT_MAX) {
      errors.amount = `Amount must be at most ${formatINRCompact(AMOUNT_MAX)}.`
    }
  }

  // ---- date ---------------------------------------------------------------
  const dateText = draft.date.trim()
  if (!dateText) {
    errors.date = 'Pick a date.'
  } else {
    const parsed = parseISODate(dateText)
    if (!parsed) {
      errors.date = 'Enter a real date, like 2026-10-23.'
    } else if (dateText < '1970-01-01') {
      errors.date = 'Pick a date after 1 January 1970.'
    } else {
      const today = ctx.today ?? new Date()
      const oneYearAhead = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 366)
      if (dateText > toISODate(oneYearAhead)) {
        errors.date = "That date is too far in the future. Pick something within a year."
      }
    }
  }

  // ---- accounts + category ------------------------------------------------
  const accounts = ctx.accounts
  const accountNames = accounts.map((a) => a.name)

  if (!draft.account) {
    errors.account = isTransfer ? 'Choose the account the money leaves.' : 'Choose an account.'
  } else if (!accountNames.includes(draft.account)) {
    errors.account = 'That account is no longer available. Pick another one.'
  }

  if (isTransfer) {
    if (!draft.toAccount) {
      errors.toAccount = 'Choose the account receiving the money.'
    } else if (!accountNames.includes(draft.toAccount)) {
      errors.toAccount = 'That account is no longer available. Pick another one.'
    } else if (draft.toAccount === draft.account) {
      errors.toAccount = 'Choose two different accounts — money cannot move to the same account.'
    }

    // A transfer is money you already have moving between your own accounts.
    if (Number.isFinite(amount) && amount > 0 && draft.account && !errors.account && !errors.toAccount) {
      const available = accountBalance(draft.account, accounts, ctx.transactions)
      if (amount > available) {
        const shownAvailable = Math.max(available, 0)
        errors.amount = `Not enough in ${draft.account}: ${formatINR(shownAvailable)} available.`
      }
    }
  } else {
    const wantType = draft.type === 'income' ? 'income' : 'expense'
    const allowed = ctx.categories.filter((c) => c.type === wantType)
    if (!draft.category) {
      errors.category = 'Choose a category.'
    } else if (!allowed.some((c) => c.name === draft.category)) {
      errors.category = 'Pick a category that matches this transaction type.'
    }
  }

  // ---- note ---------------------------------------------------------------
  const note = draft.note.trim()
  if (note.length > NOTE_MAX) {
    errors.note = `Keep the note under ${NOTE_MAX} characters.`
  }

  if (Object.keys(errors).length > 0) return { errors, values: null }

  return {
    errors: {},
    values: {
      date: dateText,
      type: draft.type,
      amount: roundMoney(amount),
      category: isTransfer ? undefined : draft.category,
      account: draft.account,
      toAccount: isTransfer ? draft.toAccount : undefined,
      note: note || (isTransfer ? 'Transfer' : draft.category),
    },
  }
}

/** Field order used when focusing the first problem after a failed save. */
export const FIELD_ORDER: DraftField[] = [
  'amount',
  'date',
  'account',
  'category',
  'toAccount',
  'note',
]
