import type { AccountDef, BudgetDef, CategoryDef, Transaction } from '../types'

/**
 * Export of everything the signed-in user can see.
 *
 * Safety properties:
 *   - the input is exactly the rows RLS returned for this user; nothing is
 *     fetched by id, so an export can never include another account's data
 *   - no keys, tokens or connection strings are part of the bundle
 *   - CSV cells that start with = + - @ TAB or CR are prefixed with an
 *     apostrophe so a spreadsheet treats them as text, not a formula
 *   - amounts are written with exactly two decimals (the paise precision the
 *     database stores), so a re-import cannot silently round them
 */

export const EXPORT_SCHEMA = 'expense-tracker.export.v1'

export interface ExportInput {
  email: string
  userId: string
  accounts: AccountDef[]
  categories: CategoryDef[]
  budgets: BudgetDef[]
  transactions: Transaction[]
  exportedAt?: Date
}

export interface ExportBundle {
  schema: typeof EXPORT_SCHEMA
  exported_at: string
  app: {
    name: 'Expense Tracker'
    currency: 'INR'
    /** Amounts are rupees with two decimal places. */
    minor_unit: 'paise'
  }
  user: {
    id: string
    email: string
  }
  counts: {
    accounts: number
    categories: number
    budgets: number
    transactions: number
  }
  accounts: Array<{ name: string; opening_balance: number }>
  categories: Array<{ name: string; type: 'income' | 'expense'; color: string }>
  budgets: Array<{ category: string; monthly_limit: number; month: string }>
  transactions: Array<{
    id: string
    date: string
    type: Transaction['type']
    amount: number
    category: string | null
    from_account: string
    to_account: string | null
    note: string
  }>
}

/** Two-decimal rupees as a number, so JSON keeps the exact stored precision. */
export function money(value: number): number {
  if (!Number.isFinite(value)) return 0
  const sign = value < 0 ? -1 : 1
  return sign * Math.round(Number(`${Math.abs(value)}e2`)) / 100
}

/** Two-decimal rupees as text for CSV ("1200" -> "1200.00"). */
export function moneyText(value: number): string {
  return money(value).toFixed(2)
}

export function buildExportBundle(input: ExportInput): ExportBundle {
  const exportedAt = input.exportedAt ?? new Date()
  return {
    schema: EXPORT_SCHEMA,
    exported_at: exportedAt.toISOString(),
    app: { name: 'Expense Tracker', currency: 'INR', minor_unit: 'paise' },
    user: { id: input.userId, email: input.email },
    counts: {
      accounts: input.accounts.length,
      categories: input.categories.length,
      budgets: input.budgets.length,
      transactions: input.transactions.length,
    },
    accounts: input.accounts.map((account) => ({
      name: account.name,
      opening_balance: money(account.openingBalance),
    })),
    categories: input.categories.map((category) => ({
      name: category.name,
      type: category.type,
      color: category.color,
    })),
    budgets: input.budgets.map((budget) => ({
      category: budget.category,
      monthly_limit: money(budget.monthlyLimit),
      month: budget.month,
    })),
    transactions: input.transactions.map((transaction) => ({
      id: transaction.id,
      date: transaction.date,
      type: transaction.type,
      amount: money(transaction.amount),
      category: transaction.category ?? null,
      from_account: transaction.account,
      to_account: transaction.toAccount ?? null,
      note: transaction.note,
    })),
  }
}

/**
 * Quote one CSV cell. Text that a spreadsheet would treat as a formula is
 * prefixed with an apostrophe; quotes are doubled and cells containing a
 * comma, quote or newline are wrapped.
 */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  let text = String(value)
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

export const CSV_HEADER = [
  'id',
  'date',
  'type',
  'amount_inr',
  'category',
  'from_account',
  'to_account',
  'note',
] as const

/**
 * Transactions only: the ledger. Accounts, categories and budgets are in the
 * JSON export, which is the complete backup.
 */
export function transactionsToCsv(transactions: Transaction[]): string {
  const lines = [CSV_HEADER.join(',')]
  for (const transaction of transactions) {
    lines.push(
      [
        csvCell(transaction.id),
        csvCell(transaction.date),
        csvCell(transaction.type),
        moneyText(transaction.amount),
        csvCell(transaction.category ?? ''),
        csvCell(transaction.account),
        csvCell(transaction.toAccount ?? ''),
        csvCell(transaction.note),
      ].join(','),
    )
  }
  // UTF-8 BOM + CRLF keeps Excel on Windows from mangling Indian text/₹.
  return `\uFEFF${lines.join('\r\n')}\r\n`
}

/** Safe, predictable filename: no spaces, slashes or user-supplied path parts. */
export function exportFilename(
  email: string,
  extension: 'json' | 'csv',
  date = new Date(),
): string {
  const day = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
  const owner = email.split('@')[0]?.replace(/[^a-z0-9._-]/gi, '').slice(0, 40) || 'account'
  return `expense-tracker-${owner}-${day}.${extension}`
}

/**
 * Filename for a report export. Only digits and hyphens from the validated
 * range can reach the name, so no user text can inject a path.
 */
export function reportCsvFilename(
  from: string,
  to: string,
  monthKey?: string | null,
): string {
  const safe = (value: string) =>
    value.replace(/[^0-9-]/g, '').replace(/^-+|-+$/g, '')
  if (monthKey) {
    const month = safe(monthKey)
    if (month) return `expense-tracker-report-${month}.csv`
  }
  return `expense-tracker-report-${safe(from) || 'start'}-to-${safe(to) || 'end'}.csv`
}

export function jsonExportText(input: ExportInput): string {
  return `${JSON.stringify(buildExportBundle(input), null, 2)}\n`
}

/** Trigger a browser download. Kept separate so the builders stay testable. */
export function downloadText(filename: string, mime: string, text: string): void {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.rel = 'noopener'
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  // Give the browser a moment to start the download before revoking.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
