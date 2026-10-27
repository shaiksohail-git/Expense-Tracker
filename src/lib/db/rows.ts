import type { AccountDef, BudgetDef, CategoryDef, Transaction, TxType } from '../../types'

/**
 * The database stores ids and numbers; the UI speaks in account/category
 * *names* and rupees. These mappers are the only place those two worlds meet,
 * which keeps the rest of the app free of database details.
 */

export interface AccountRow {
  id: string
  name: string
  opening_balance: number | string
}

export interface CategoryRow {
  id: string
  name: string
  kind: 'income' | 'expense'
  color: string
}

export interface TransactionRow {
  id: string
  occurred_on: string
  type: TxType
  amount: number | string
  category_id: string | null
  account_id: string
  to_account_id: string | null
  note: string
}

export interface BudgetRow {
  category_id: string
  monthly_limit: number | string
  /** First day of the month, e.g. "2026-10-01" */
  month: string
}

/** PostgREST may hand numeric columns back as strings; normalise both. */
export function toNumber(value: number | string): number {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : 0
}

export function mapAccounts(rows: AccountRow[]): AccountDef[] {
  return rows
    .map((row) => ({ name: row.name, openingBalance: toNumber(row.opening_balance) }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function mapCategories(rows: CategoryRow[]): CategoryDef[] {
  return rows
    .map((row) => ({ name: row.name, type: row.kind, color: row.color }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** Lookup tables used to translate between names (UI) and ids (database). */
export interface WorkspaceRefs {
  accountIdByName: Map<string, string>
  categoryIdByName: Map<string, string>
  accountNameById: Map<string, string>
  categoryNameById: Map<string, string>
}

export function buildRefs(accounts: AccountRow[], categories: CategoryRow[]): WorkspaceRefs {
  return {
    accountIdByName: new Map(accounts.map((a) => [a.name, a.id])),
    categoryIdByName: new Map(categories.map((c) => [c.name, c.id])),
    accountNameById: new Map(accounts.map((a) => [a.id, a.name])),
    categoryNameById: new Map(categories.map((c) => [c.id, c.name])),
  }
}

/** One database row -> the shape every screen uses. */
export function mapTransactionRow(row: TransactionRow, refs: WorkspaceRefs): Transaction {
  const categoryName = row.category_id ? refs.categoryNameById.get(row.category_id) : undefined
  const accountName = refs.accountNameById.get(row.account_id) ?? 'Unknown account'
  const toAccountName = row.to_account_id
    ? refs.accountNameById.get(row.to_account_id)
    : undefined

  return {
    id: row.id,
    date: row.occurred_on,
    type: row.type,
    amount: toNumber(row.amount),
    // A category id with no name would mean the row outlived its category,
    // which the database's foreign keys prevent.
    category: categoryName,
    account: accountName,
    toAccount: toAccountName,
    note: row.note,
  }
}

export function mapTransactionRows(rows: TransactionRow[], refs: WorkspaceRefs): Transaction[] {
  return rows.map((row) => mapTransactionRow(row, refs))
}

export function mapBudgets(rows: BudgetRow[], refs: WorkspaceRefs): BudgetDef[] {
  return rows
    .map((row) => ({
      category: refs.categoryNameById.get(row.category_id) ?? 'Unknown category',
      monthlyLimit: toNumber(row.monthly_limit),
      month: row.month.slice(0, 7),
    }))
    .sort(
      (a, b) => a.month.localeCompare(b.month) || a.category.localeCompare(b.category),
    )
}

/** The column values written to `transactions` for an add or an edit. */
export interface TransactionWriteRow {
  occurred_on: string
  type: TxType
  amount: number
  category_id: string | null
  account_id: string
  to_account_id: string | null
  note: string
}

/**
 * App values -> database columns. Throws a user-facing message when a name no
 * longer resolves, which can only happen if the reference data changed in
 * another tab.
 */
export function transactionToRow(
  values: Omit<Transaction, 'id'>,
  refs: WorkspaceRefs,
): TransactionWriteRow {
  const accountId = refs.accountIdByName.get(values.account)
  if (!accountId) {
    throw new Error(`The account “${values.account}” no longer exists. Refresh and try again.`)
  }

  let categoryId: string | null = null
  if (values.type !== 'transfer') {
    const name = values.category ?? ''
    const found = refs.categoryIdByName.get(name)
    if (!found) {
      throw new Error(`The category “${name}” no longer exists. Refresh and try again.`)
    }
    categoryId = found
  }

  let toAccountId: string | null = null
  if (values.type === 'transfer') {
    const name = values.toAccount ?? ''
    const found = refs.accountIdByName.get(name)
    if (!found) {
      throw new Error(`The account “${name}” no longer exists. Refresh and try again.`)
    }
    toAccountId = found
  }

  return {
    occurred_on: values.date,
    type: values.type,
    amount: values.amount,
    category_id: categoryId,
    account_id: accountId,
    to_account_id: toAccountId,
    note: values.note,
  }
}

const MONTH_KEY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/

/** "2026-10" -> "2026-10-01", the value of the database's `month` column. */
export function monthDate(monthKey: string): string {
  if (!MONTH_KEY_PATTERN.test(monthKey)) {
    throw new Error('That month is not valid. Pick a month and try again.')
  }
  return `${monthKey}-01`
}

/** App values -> the columns written to `budgets` for a set or an edit. */
export interface BudgetWriteRow {
  category_id: string
  monthly_limit: number
  month: string
}

export function budgetToRow(
  category: string,
  monthlyLimit: number,
  monthKey: string,
  refs: WorkspaceRefs,
): BudgetWriteRow {
  const categoryId = refs.categoryIdByName.get(category)
  if (!categoryId) {
    throw new Error(`The category “${category}” no longer exists. Refresh and try again.`)
  }
  return { category_id: categoryId, monthly_limit: monthlyLimit, month: monthDate(monthKey) }
}

/**
 * True for a primary/unique-key collision. Used to make a retried insert
 * idempotent: the row already exists under the id this client generated.
 */
export function isDuplicateKeyError(error: unknown): boolean {
  const record = (error ?? {}) as { code?: string; message?: string }
  return record.code === '23505' || /duplicate key/i.test(record.message ?? '')
}

/** Turn a PostgREST/Postgres error into a sentence a person can act on. */
export function friendlyDbError(error: unknown): string {
  const record = (error ?? {}) as {
    message?: string
    code?: string
    details?: string
    status?: number
  }
  const code = record.code
  const message = record.message ?? ''

  if (code === '23505') return 'That already exists — try a different name.'
  if (code === '23503') return 'That account or category no longer exists. Refresh and try again.'
  if (code === '23514') return 'Some of those values are not allowed. Check the amount and try again.'
  if (code === '42501' || record.status === 403) {
    return 'You do not have permission to change that. Try signing in again.'
  }
  if (code === 'PGRST301' || /jwt expired/i.test(message)) {
    return 'Your session expired. Sign in again to continue.'
  }
  if (message.includes('Category type must match')) {
    return 'That category does not match the transaction type.'
  }
  if (/duplicate key/i.test(message)) return 'That already exists.'
  if (/row-level security/i.test(message)) {
    return 'You do not have permission to change that.'
  }
  if (/Failed to fetch|NetworkError/i.test(message)) {
    return 'Could not reach the server. Check your connection and try again.'
  }
  return 'Something went wrong saving to the database. Please try again.'
}
