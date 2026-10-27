import type { MonthOption, SortKey, TxQuery, TypeFilter } from '../lib/transactionQuery'
import { SORT_OPTIONS, activeFilterCount, isDefaultQuery } from '../lib/transactionQuery'
import { IconSearch, IconX } from './Icons'

interface Props {
  query: TxQuery
  onChange: (patch: Partial<TxQuery>) => void
  onClear: () => void
  categories: string[]
  months: MonthOption[]
  resultCount: number
  totalCount: number
}

const controlCls =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/40 focus:outline-none'
const labelCls = 'mb-1.5 block text-xs font-semibold tracking-wide text-slate-500 uppercase'

const TYPE_OPTIONS: Array<{ value: TypeFilter; label: string }> = [
  { value: 'all', label: 'All types' },
  { value: 'income', label: 'Income' },
  { value: 'expense', label: 'Expense' },
  { value: 'transfer', label: 'Transfer' },
]

export function TransactionToolbar({
  query,
  onChange,
  onClear,
  categories,
  months,
  resultCount,
  totalCount,
}: Props) {
  const filterCount = activeFilterCount(query)

  return (
    <section
      aria-label="Search, filter and sort transactions"
      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <div>
        <label htmlFor="tx-search" className="mb-1.5 block text-sm font-medium text-slate-700">
          Search
        </label>
        <div className="relative">
          <IconSearch className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
          <input
            id="tx-search"
            type="text"
            autoComplete="off"
            placeholder="Note, category, account or amount…"
            value={query.search}
            onChange={(e) => onChange({ search: e.target.value })}
            className={`${controlCls} pr-9 pl-9`}
          />
          {query.search !== '' && (
            <button
              type="button"
              onClick={() => onChange({ search: '' })}
              aria-label="Clear search"
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-none"
            >
              <IconX className="size-4" />
            </button>
          )}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div>
          <label htmlFor="tx-filter-type" className={labelCls}>
            Type
          </label>
          <select
            id="tx-filter-type"
            value={query.type}
            onChange={(e) => onChange({ type: e.target.value as TypeFilter })}
            className={controlCls}
          >
            {TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="tx-filter-category" className={labelCls}>
            Category
          </label>
          <select
            id="tx-filter-category"
            value={query.category}
            onChange={(e) => onChange({ category: e.target.value })}
            className={controlCls}
          >
            <option value="all">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="tx-filter-month" className={labelCls}>
            Month
          </label>
          <select
            id="tx-filter-month"
            value={query.month}
            onChange={(e) => onChange({ month: e.target.value })}
            className={controlCls}
          >
            <option value="all">All months</option>
            {months.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="tx-sort" className={labelCls}>
            Sort by
          </label>
          <select
            id="tx-sort"
            value={query.sort}
            onChange={(e) => onChange({ sort: e.target.value as SortKey })}
            className={controlCls}
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
        <p className="text-xs text-slate-500" aria-live="polite">
          Showing <strong className="text-slate-700">{resultCount}</strong> of {totalCount}{' '}
          transactions
          {filterCount > 0 && (
            <>
              {' '}
              · {filterCount} filter{filterCount === 1 ? '' : 's'} on
            </>
          )}
        </p>
        {!isDefaultQuery(query) && (
          <button
            type="button"
            onClick={onClear}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-none"
          >
            Clear all filters
          </button>
        )}
      </div>
    </section>
  )
}
