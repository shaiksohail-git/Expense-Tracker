import type { CategoryDef, Transaction } from '../types'
import { formatINR } from '../lib/format'
import { IconEdit, IconTrash } from './Icons'

const TYPE_LABEL: Record<Transaction['type'], string> = {
  income: 'Income',
  expense: 'Expense',
  transfer: 'Transfer',
}

function formatDate(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00`)
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function amountClasses(type: Transaction['type']): string {
  return type === 'income'
    ? 'text-emerald-600'
    : type === 'expense'
      ? 'text-rose-600'
      : 'text-sky-600'
}

function amountPrefix(type: Transaction['type']): string {
  return type === 'income' ? '+' : type === 'expense' ? '-' : '⇄ '
}

interface Props {
  transactions: Transaction[]
  categories: CategoryDef[]
  /** When provided, an actions column with Edit / Delete appears. */
  onEdit?: (tx: Transaction) => void
  onDelete?: (tx: Transaction) => void
  emptyTitle?: string
  emptyMessage?: string
}

/**
 * Renders transactions in the order it receives them (sorting happens in the
 * caller).
 *
 * Wide screens get a table; small screens get the same rows as stacked cards,
 * so editing never requires horizontal scrolling.
 */
export function TransactionsTable({
  transactions,
  categories,
  onEdit,
  onDelete,
  emptyTitle = 'No transactions yet',
  emptyMessage = 'Use “Add Transaction” to record your first one.',
}: Props) {
  const colorOf = new Map(categories.map((c) => [c.name, c.color] as const))
  const showActions = Boolean(onEdit || onDelete)

  if (transactions.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
        <p className="font-medium text-slate-700">{emptyTitle}</p>
        <p className="mt-1 text-sm text-slate-500">{emptyMessage}</p>
      </div>
    )
  }

  const chip = (t: Transaction) =>
    t.category ? (
      <span
        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
        style={{
          backgroundColor: `${colorOf.get(t.category) ?? '#94a3b8'}1a`,
          color: colorOf.get(t.category) ?? '#475569',
        }}
      >
        <span
          className="size-2 rounded-full"
          style={{ backgroundColor: colorOf.get(t.category) ?? '#94a3b8' }}
          aria-hidden="true"
        />
        {t.category}
      </span>
    ) : (
      <span className="text-xs text-slate-400">—</span>
    )

  const actions = (t: Transaction) =>
    showActions ? (
      <div className="flex items-center justify-end gap-1">
        {onEdit && (
          <button
            type="button"
            onClick={() => onEdit(t)}
            aria-label={`Edit transaction: ${t.note}`}
            title="Edit"
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-none"
          >
            <IconEdit className="size-4" />
          </button>
        )}
        {onDelete && (
          <button
            type="button"
            onClick={() => onDelete(t)}
            aria-label={`Delete transaction: ${t.note}`}
            title="Delete"
            className="rounded-lg p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-700 focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:outline-none"
          >
            <IconTrash className="size-4" />
          </button>
        )}
      </div>
    ) : null

  return (
    <>
      {/* ---- small screens: cards ---- */}
      <ul className="space-y-2 md:hidden">
        {transactions.map((t) => (
          <li
            key={t.id}
            className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-slate-800">{t.note}</span>
                </div>
                <p className="mt-0.5 text-xs text-slate-500">
                  {formatDate(t.date)} · {TYPE_LABEL[t.type]}
                  {t.type === 'transfer' && t.toAccount
                    ? ` · ${t.account} → ${t.toAccount}`
                    : ` · ${t.account}`}
                </p>
                <div className="mt-2">{chip(t)}</div>
              </div>
              <span
                className={`shrink-0 text-right font-semibold whitespace-nowrap tabular-nums ${amountClasses(
                  t.type,
                )}`}
              >
                {amountPrefix(t.type)}
                {formatINR(t.amount)}
              </span>
            </div>
            {showActions && (
              <div className="mt-2 flex justify-end border-t border-slate-100 pt-1">
                {actions(t)}
              </div>
            )}
          </li>
        ))}
      </ul>

      {/* ---- wide screens: table ---- */}
      <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm md:block">
        <table className="w-full min-w-[720px] text-left text-sm">
          <caption className="sr-only">Transactions</caption>
          <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold tracking-wide text-slate-500 uppercase">
            <tr>
              <th scope="col" className="px-4 py-3">Date</th>
              <th scope="col" className="px-4 py-3">Description</th>
              <th scope="col" className="px-4 py-3">Category</th>
              <th scope="col" className="px-4 py-3">Account</th>
              <th scope="col" className="px-4 py-3 text-right">Amount</th>
              {showActions && (
                <th scope="col" className="px-4 py-3 text-right">
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {transactions.map((t) => (
              <tr key={t.id} className="hover:bg-slate-50/70">
                <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                  {formatDate(t.date)}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-slate-800">{t.note}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {TYPE_LABEL[t.type]}
                    {t.type === 'transfer' && t.toAccount
                      ? ` · ${t.account} → ${t.toAccount}`
                      : ''}
                  </p>
                </td>
                <td className="px-4 py-3">{chip(t)}</td>
                <td className="px-4 py-3 text-slate-600">{t.account}</td>
                <td
                  className={`px-4 py-3 text-right font-semibold whitespace-nowrap tabular-nums ${amountClasses(
                    t.type,
                  )}`}
                >
                  {amountPrefix(t.type)}
                  {formatINR(t.amount)}
                </td>
                {showActions && <td className="px-2 py-3">{actions(t)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
