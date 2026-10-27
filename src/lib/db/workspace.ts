import { getSupabase } from '../supabaseClient'
import type { AccountDef, BudgetDef, CategoryDef, Transaction } from '../../types'
import type { CategoryDraft } from '../categoryForm'
import {
  budgetToRow,
  buildRefs,
  friendlyDbError,
  isDuplicateKeyError,
  mapAccounts,
  mapBudgets,
  mapCategories,
  mapTransactionRow,
  monthDate,
  transactionToRow,
  type AccountRow,
  type BudgetRow,
  type CategoryRow,
  type TransactionRow,
  type WorkspaceRefs,
} from './rows'

/**
 * Every Supabase call the app makes lives here. Screens never talk to the
 * database directly, so there is one place that decides what is loaded,
 * what is written, and how errors are phrased.
 */

export interface WorkspaceData {
  accounts: AccountDef[]
  categories: CategoryDef[]
  budgets: BudgetDef[]
  transactions: Transaction[]
}

export interface WorkspaceSnapshot {
  data: WorkspaceData
  refs: WorkspaceRefs
}

/** Accounts and categories a brand-new account starts with. */
export const STARTER_ACCOUNTS: Array<{ name: string; opening_balance: number }> = [
  { name: 'Bank', opening_balance: 0 },
  { name: 'Cash', opening_balance: 0 },
]

export const STARTER_CATEGORIES: Array<{
  name: string
  kind: 'income' | 'expense'
  color: string
}> = [
  { name: 'Salary', kind: 'income', color: '#0ea5e9' },
  { name: 'Freelance', kind: 'income', color: '#22c55e' },
  { name: 'Rent', kind: 'expense', color: '#f59e0b' },
  { name: 'Groceries', kind: 'expense', color: '#10b981' },
  { name: 'Transport', kind: 'expense', color: '#6366f1' },
  { name: 'Dining Out', kind: 'expense', color: '#ef4444' },
  { name: 'Utilities', kind: 'expense', color: '#a855f7' },
  { name: 'Entertainment', kind: 'expense', color: '#ec4899' },
  { name: 'Subscriptions', kind: 'expense', color: '#14b8a6' },
  { name: 'Health', kind: 'expense', color: '#f97316' },
]

function fail(error: unknown): never {
  // Keep the raw error in the console for debugging, but never show it raw.
  console.error('[supabase]', error)
  throw new Error(friendlyDbError(error))
}

/** Load everything this user can see in one go. */
export async function loadWorkspace(): Promise<WorkspaceSnapshot> {
  const supabase = getSupabase()

  const [accountsRes, categoriesRes, budgetsRes, transactionsRes] = await Promise.all([
    supabase.from('accounts').select('id, name, opening_balance').order('name'),
    supabase.from('categories').select('id, name, kind, color').order('name'),
    supabase.from('budgets').select('category_id, monthly_limit, month'),
    supabase
      .from('transactions')
      .select('id, occurred_on, type, amount, category_id, account_id, to_account_id, note')
      .order('occurred_on', { ascending: false })
      .order('created_at', { ascending: false }),
  ])

  if (accountsRes.error) fail(accountsRes.error)
  if (categoriesRes.error) fail(categoriesRes.error)
  if (budgetsRes.error) fail(budgetsRes.error)
  if (transactionsRes.error) fail(transactionsRes.error)

  const accountRows = (accountsRes.data ?? []) as AccountRow[]
  const categoryRows = (categoriesRes.data ?? []) as CategoryRow[]
  const budgetRows = (budgetsRes.data ?? []) as BudgetRow[]
  const transactionRows = (transactionsRes.data ?? []) as TransactionRow[]

  const refs = buildRefs(accountRows, categoryRows)

  return {
    data: {
      accounts: mapAccounts(accountRows),
      categories: mapCategories(categoryRows),
      budgets: mapBudgets(budgetRows, refs),
      transactions: transactionRows.map((row) => mapTransactionRow(row, refs)),
    },
    refs,
  }
}

/**
 * Give a brand-new account two accounts and a starter category list so the
 * first added transaction has somewhere to go. Safe to call more than once:
 * it only writes when the user has neither accounts nor categories.
 */
export async function ensureStarterData(): Promise<boolean> {
  const supabase = getSupabase()

  const [accountsRes, categoriesRes] = await Promise.all([
    supabase.from('accounts').select('id').limit(1),
    supabase.from('categories').select('id').limit(1),
  ])
  if (accountsRes.error) fail(accountsRes.error)
  if (categoriesRes.error) fail(categoriesRes.error)

  const needsAccounts = (accountsRes.data ?? []).length === 0
  const needsCategories = (categoriesRes.data ?? []).length === 0
  if (!needsAccounts && !needsCategories) return false

  // Another tab (or React StrictMode running the effect twice) may seed at
  // the same moment; a unique-name collision means someone else already did.
  if (needsAccounts) {
    const { error } = await supabase.from('accounts').insert(STARTER_ACCOUNTS)
    if (error && error.code !== '23505') fail(error)
  }

  if (needsCategories) {
    const { error } = await supabase.from('categories').insert(STARTER_CATEGORIES)
    if (error && error.code !== '23505') fail(error)
  }

  return true
}

/**
 * Create or change one category's limit for one month. The database has a
 * unique (user, category, month) constraint, so an upsert is the whole
 * operation and other months are untouched.
 */
export async function saveBudgetRow(
  category: string,
  monthlyLimit: number,
  monthKey: string,
  refs: WorkspaceRefs,
): Promise<BudgetDef> {
  const supabase = getSupabase()
  const row = budgetToRow(category, monthlyLimit, monthKey, refs)
  const { data, error } = await supabase
    .from('budgets')
    .upsert(row, { onConflict: 'user_id,category_id,month' })
    .select('category_id, monthly_limit, month')
    .single()

  if (error) fail(error)
  return mapBudgets([data as BudgetRow], refs)[0]
}

/** Remove a category's limit for one month. Transactions are untouched. */
export async function deleteBudgetRow(
  category: string,
  monthKey: string,
  refs: WorkspaceRefs,
): Promise<void> {
  const supabase = getSupabase()
  const categoryId = refs.categoryIdByName.get(category)
  if (!categoryId) {
    throw new Error(`The category “${category}” no longer exists. Refresh and try again.`)
  }
  const { error } = await supabase
    .from('budgets')
    .delete()
    .eq('category_id', categoryId)
    .eq('month', monthDate(monthKey))
  if (error) fail(error)
}

/**
 * Add one category. The database owns the rules (unique name, colour shape,
 * kind), and the client has already validated the same rules, so the only
 * failures left are races with another tab.
 */
export async function insertCategory(values: CategoryDraft): Promise<CategoryDef> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('categories')
    .insert({ name: values.name, kind: values.kind, color: values.color })
    .select('id, name, kind, color')
    .single()

  if (error) fail(error)
  return mapCategories([data as CategoryRow])[0]
}

/**
 * Change one existing category's name, type and/or colour. Transactions and
 * budgets point at it by id, so a rename keeps every historical record —
 * the caller re-reads the workspace so all screens pick up the new name.
 */
export async function updateCategoryRow(
  currentName: string,
  patch: CategoryDraft,
  refs: WorkspaceRefs,
): Promise<void> {
  const categoryId = refs.categoryIdByName.get(currentName)
  if (!categoryId) {
    throw new Error(`The category “${currentName}” no longer exists. Refresh and try again.`)
  }

  const supabase = getSupabase()
  const { error } = await supabase
    .from('categories')
    .update({ name: patch.name, kind: patch.kind, color: patch.color })
    .eq('id', categoryId)
  if (error) fail(error)
}

/**
 * Remove a category. Only offered when nothing references it: transactions
 * are protected by a foreign key and budgets would cascade away silently.
 */
export async function deleteCategoryRow(name: string, refs: WorkspaceRefs): Promise<void> {
  const categoryId = refs.categoryIdByName.get(name)
  if (!categoryId) {
    throw new Error(`The category “${name}” no longer exists. Refresh and try again.`)
  }

  const supabase = getSupabase()
  const { error } = await supabase.from('categories').delete().eq('id', categoryId)
  if (error) fail(error)
}

/**
 * Insert one transaction.
 *
 * `pendingId` is generated by the form and reused for every retry of the
 * same draft. If the first attempt actually reached the database but its
 * response was lost (timeout, flaky connection, double click), the retry
 * collides on the primary key; the existing row is then read back and
 * returned, so one draft can never become two transactions.
 */
export async function insertTransaction(
  values: Omit<Transaction, 'id'>,
  refs: WorkspaceRefs,
  pendingId?: string,
  /** Injectable for tests; the app always uses the shared client. */
  injectedClient?: ReturnType<typeof getSupabase>,
): Promise<Transaction> {
  const supabase = injectedClient ?? getSupabase()
  const row = transactionToRow(values, refs)
  const payload = pendingId ? { ...row, id: pendingId } : row
  const columns = 'id, occurred_on, type, amount, category_id, account_id, to_account_id, note'

  const { data, error } = await supabase
    .from('transactions')
    .insert(payload)
    .select(columns)
    .single()

  if (error) {
    if (pendingId && isDuplicateKeyError(error)) {
      const existing = await supabase
        .from('transactions')
        .select(columns)
        .eq('id', pendingId)
        .maybeSingle()
      if (existing.data) {
        return mapTransactionRow(existing.data as TransactionRow, refs)
      }
    }
    fail(error)
  }

  return mapTransactionRow(data as TransactionRow, refs)
}

export async function updateTransactionRow(
  id: string,
  values: Omit<Transaction, 'id'>,
  refs: WorkspaceRefs,
): Promise<Transaction> {
  const supabase = getSupabase()
  const row = transactionToRow(values, refs)
  const { data, error } = await supabase
    .from('transactions')
    .update(row)
    .eq('id', id)
    .select('id, occurred_on, type, amount, category_id, account_id, to_account_id, note')
    .single()

  if (error) fail(error)
  return mapTransactionRow(data as TransactionRow, refs)
}

export async function deleteTransactionRow(id: string): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase.from('transactions').delete().eq('id', id)
  if (error) fail(error)
}

/** Undo support: write the exact record back, keeping its original id. */
export async function restoreTransactionRow(
  tx: Transaction,
  refs: WorkspaceRefs,
): Promise<Transaction> {
  const supabase = getSupabase()
  const row = transactionToRow(tx, refs)
  const { data, error } = await supabase
    .from('transactions')
    .insert({ ...row, id: tx.id })
    .select('id, occurred_on, type, amount, category_id, account_id, to_account_id, note')
    .single()

  if (error) fail(error)
  return mapTransactionRow(data as TransactionRow, refs)
}
