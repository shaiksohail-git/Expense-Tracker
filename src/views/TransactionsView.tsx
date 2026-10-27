import { useMemo, useState } from 'react'
import type { CategoryDef, Transaction } from '../types'
import { TransactionsTable } from '../components/TransactionsTable'
import { TransactionToolbar } from '../components/TransactionToolbar'
import { IconPlus } from '../components/Icons'
import { roundMoney, sumOf } from '../lib/finance'
import { formatINR } from '../lib/format'
import {
  DEFAULT_QUERY,
  categoryOptions,
  monthOptions,
  queryTransactions,
  type TxQuery,
} from '../lib/transactionQuery'

interface Props {
  transactions: Transaction[]
  categories: CategoryDef[]
  onAdd: () => void
  onEdit: (tx: Transaction) => void
  onDelete: (tx: Transaction) => void
}

export function TransactionsView({ transactions, categories, onAdd, onEdit, onDelete }: Props) {
  const [query, setQuery] = useState<TxQuery>(DEFAULT_QUERY)

  const results = useMemo(() => queryTransactions(transactions, query), [transactions, query])
  const months = useMemo(() => monthOptions(transactions), [transactions])
  const categoriesInUse = useMemo(() => categoryOptions(transactions), [transactions])

  const income = sumOf(results, 'income')
  const expense = sumOf(results, 'expense')
  const net = roundMoney(income - expense)

  const onChange = (patch: Partial<TxQuery>) => setQuery((q) => ({ ...q, ...patch }))

  if (transactions.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
        <p className="text-base font-semibold text-slate-800">No transactions yet</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
          Add your first income, expense or transfer and it will show up here with search,
          filters and totals.
        </p>
        <button
          type="button"
          onClick={onAdd}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          <IconPlus className="size-4" />
          Add your first transaction
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <TransactionToolbar
        query={query}
        onChange={onChange}
        onClear={() => setQuery(DEFAULT_QUERY)}
        categories={categoriesInUse}
        months={months}
        resultCount={results.length}
        totalCount={transactions.length}
      />

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <p className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
            Money in
          </p>
          <p className="mt-1 text-sm font-semibold tabular-nums text-emerald-600 sm:text-base">
            {formatINR(income)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <p className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
            Money out
          </p>
          <p className="mt-1 text-sm font-semibold tabular-nums text-rose-600 sm:text-base">
            {formatINR(expense)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <p className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
            Net
          </p>
          <p
            className={`mt-1 text-sm font-semibold tabular-nums sm:text-base ${
              net >= 0 ? 'text-slate-900' : 'text-rose-600'
            }`}
          >
            {formatINR(net)}
          </p>
        </div>
      </div>
      <p className="-mt-2 text-[11px] text-slate-500">
        Totals for the filtered list. Transfers move money between your own accounts, so they
        count as neither in nor out.
      </p>

      <TransactionsTable
        transactions={results}
        categories={categories}
        onEdit={onEdit}
        onDelete={onDelete}
        emptyTitle="No transactions match"
        emptyMessage="Try a different search or clear the filters below."
      />

      {results.length === 0 && (
        <div className="text-center">
          <button
            type="button"
            onClick={() => setQuery(DEFAULT_QUERY)}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-none"
          >
            Clear all filters
          </button>
        </div>
      )}
    </div>
  )
}
