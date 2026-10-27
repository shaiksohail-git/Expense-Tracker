import type { AccountDef, CategoryDef, MonthPoint, Transaction } from '../types'
import { SummaryCards } from '../components/SummaryCards'
import { MonthlyChart } from '../components/MonthlyChart'
import { CategoryChart } from '../components/CategoryChart'
import { TransactionsTable } from '../components/TransactionsTable'
import { categorySpend, recentTransactions, totalBalance } from '../lib/finance'
import { IconPlus } from '../components/Icons'

interface Props {
  transactions: Transaction[]
  categories: CategoryDef[]
  accounts: AccountDef[]
  monthly: MonthPoint[]
  currentMonthKey: string
  onAddTransaction: () => void
}

export function DashboardView({
  transactions,
  categories,
  accounts,
  monthly,
  currentMonthKey,
  onAddTransaction,
}: Props) {
  const thisMonth = monthly[monthly.length - 1]
  const balance = totalBalance(accounts, transactions)
  const colorOf = new Map(categories.map((c) => [c.name, c.color] as const))

  const categorySlices = categorySpend(transactions, currentMonthKey).map((slice) => ({
    ...slice,
    color: colorOf.get(slice.name),
  }))

  const recent = recentTransactions(transactions, 7)

  return (
    <div className="space-y-6">
      {transactions.length === 0 && (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
          <h2 className="text-base font-semibold tracking-tight text-emerald-900">
            Your dashboard is ready
          </h2>
          <p className="mt-1 max-w-xl text-sm leading-relaxed text-emerald-800">
            No transactions yet. Add your first income or expense and the totals,
            charts and budgets fill in straight away.
          </p>
          <button
            type="button"
            onClick={onAddTransaction}
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            <IconPlus className="size-4" />
            Add your first transaction
          </button>
        </section>
      )}

      <SummaryCards
        cards={[
          {
            label: 'Total balance',
            value: balance,
            tone: balance >= 0 ? 'neutral' : 'negative',
            hint: 'Across all accounts',
          },
          {
            label: 'Income (this month)',
            value: thisMonth?.income ?? 0,
            tone: 'positive',
          },
          {
            label: 'Expenses (this month)',
            value: thisMonth?.expense ?? 0,
            tone: 'negative',
          },
          {
            label: 'Savings (this month)',
            value: thisMonth?.savings ?? 0,
            tone: (thisMonth?.savings ?? 0) >= 0 ? 'positive' : 'negative',
            hint: 'Income − expenses',
          },
        ]}
      />

      <div className="grid gap-4 xl:grid-cols-3">
        <section
          aria-labelledby="monthly-chart-title"
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-2"
        >
          <h2 id="monthly-chart-title" className="text-base font-semibold tracking-tight">
            Income vs expenses
          </h2>
          <p className="mb-4 text-xs text-slate-500">Last 6 months, in ₹</p>
          <MonthlyChart data={monthly} />
        </section>

        <section
          aria-labelledby="category-chart-title"
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <h2 id="category-chart-title" className="text-base font-semibold tracking-tight">
            Spending by category
          </h2>
          <p className="mb-4 text-xs text-slate-500">This month, in ₹</p>
          <CategoryChart
            data={categorySlices}
            emptyMessage="No spending recorded this month yet."
          />
        </section>
      </div>

      <section aria-labelledby="recent-transactions-title" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="recent-transactions-title" className="text-base font-semibold tracking-tight">
              Recent transactions
            </h2>
            <p className="text-xs text-slate-500">Latest 7 entries, newest first</p>
          </div>
          <button
            type="button"
            onClick={onAddTransaction}
            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            <IconPlus className="size-4" />
            Add Transaction
          </button>
        </div>
        <TransactionsTable transactions={recent} categories={categories} />
      </section>
    </div>
  )
}
