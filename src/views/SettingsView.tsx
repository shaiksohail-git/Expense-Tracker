import { useState } from 'react'
import { CategoryManager } from '../components/CategoryManager'
import type { CategoryDraft } from '../lib/categoryForm'
import {
  downloadText,
  exportFilename,
  jsonExportText,
  transactionsToCsv,
} from '../lib/exportData'
import type { AccountDef, BudgetDef, CategoryDef, Transaction } from '../types'

interface Props {
  email: string
  userId: string
  /** ISO timestamp from the Supabase user record. */
  memberSince?: string
  accounts: AccountDef[]
  categories: CategoryDef[]
  transactions: Transaction[]
  budgets: BudgetDef[]
  lastSyncedAt: Date | null
  syncing: boolean
  syncError: string | null
  online: boolean
  /** Re-read everything from Supabase; resolves false when that failed. */
  onRefresh: () => Promise<void>
  /** Create (current = null) or change one category. Rejects on failure. */
  onSaveCategory: (current: CategoryDef | null, values: CategoryDraft) => Promise<void>
  onDeleteCategory: (name: string) => Promise<void>
  onNotify: (message: string, tone?: 'success' | 'error' | 'warning') => void
  onSignOut: () => void
}

const labelCls = 'text-sm font-medium text-slate-500'
const valueCls = 'mt-1 text-base font-semibold break-all text-slate-900'

function formatJoined(iso?: string): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
}

function formatSynced(date: Date | null): string {
  if (!date) return 'Not yet'
  const today = new Date()
  const sameDay =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  const time = date.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  return sameDay ? `Today at ${time}` : `${date.toLocaleDateString('en-IN')} at ${time}`
}

export function SettingsView({
  email,
  userId,
  memberSince,
  accounts,
  categories,
  transactions,
  budgets,
  lastSyncedAt,
  syncing,
  syncError,
  online,
  onRefresh,
  onSaveCategory,
  onDeleteCategory,
  onNotify,
  onSignOut,
}: Props) {
  const [exporting, setExporting] = useState<'json' | 'csv' | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const exportData = (kind: 'json' | 'csv') => {
    setExporting(kind)
    try {
      if (kind === 'json') {
        downloadText(
          exportFilename(email, 'json'),
          'application/json',
          jsonExportText({
            email,
            userId,
            accounts,
            categories,
            budgets,
            transactions,
          }),
        )
      } else {
        downloadText(
          exportFilename(email, 'csv'),
          'text/csv',
          transactionsToCsv(transactions),
        )
      }
      onNotify(
        kind === 'json'
          ? `Downloaded a full JSON backup (${transactions.length} transactions).`
          : `Downloaded ${transactions.length} transactions as CSV.`,
        'success',
      )
    } catch {
      onNotify('Could not create the download. Your data is still safe in Supabase.', 'error')
    } finally {
      setExporting(null)
    }
  }

  const refreshNow = async () => {
    setRefreshing(true)
    try {
      await onRefresh()
    } finally {
      setRefreshing(false)
    }
  }

  const busy = syncing || refreshing

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold tracking-tight">Account</h2>
        <p className="mt-1 text-sm text-slate-500">
          This account owns every transaction, account, category and budget in the app.
        </p>
        <dl className="mt-5 grid gap-5 sm:grid-cols-2">
          <div>
            <dt className={labelCls}>Signed in as</dt>
            <dd className={valueCls}>{email || '—'}</dd>
          </div>
          <div>
            <dt className={labelCls}>Member since</dt>
            <dd className={valueCls}>{formatJoined(memberSince)}</dd>
          </div>
        </dl>
        <button
          type="button"
          onClick={onSignOut}
          className="mt-6 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-none"
        >
          Sign out
        </button>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold tracking-tight">Cloud sync</h2>
            <p className="mt-1 text-sm text-slate-500">
              Supabase is the source of truth. A change is written there before the screen
              updates, so a saved transaction survives a refresh, a sign-out or a different
              device.
            </p>
          </div>
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-semibold uppercase ${
              !online
                ? 'bg-amber-100 text-amber-800'
                : syncError
                  ? 'bg-rose-100 text-rose-800'
                  : 'bg-emerald-100 text-emerald-800'
            }`}
          >
            {!online ? 'Offline' : syncError ? 'Sync problem' : 'Connected'}
          </span>
        </div>

        <dl className="mt-5 grid gap-5 sm:grid-cols-2">
          <div>
            <dt className={labelCls}>Last successful sync</dt>
            <dd className={valueCls}>
              {busy ? 'Syncing…' : formatSynced(lastSyncedAt)}
            </dd>
          </div>
          <div>
            <dt className={labelCls}>Cloud storage</dt>
            <dd className={valueCls}>Supabase · PostgreSQL</dd>
          </div>
        </dl>

        {syncError && (
          <p role="alert" className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
            The last refresh failed: {syncError} What you see may be out of date.
          </p>
        )}

        <button
          type="button"
          onClick={() => void refreshNow()}
          disabled={busy}
          className="mt-5 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? 'Refreshing…' : 'Refresh now'}
        </button>

        <p className="mt-3 text-xs leading-relaxed text-slate-500">
          Other tabs in this browser refresh as soon as you save. A different device reloads
          your data when the page loads, when you return to the tab after five seconds away,
          or when you use Refresh now. There is no live push subscription, so a screen left
          open elsewhere is not updated until one of those happens.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold tracking-tight">Export your data</h2>
        <p className="mt-1 text-sm text-slate-500">
          Downloads a copy of the rows your signed-in account can read: {transactions.length}{' '}
          transactions, {accounts.length} accounts, {categories.length} categories and{' '}
          {budgets.length} budgets. Nothing else is included — no password, no API key, and no
          other user&apos;s rows.
        </p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => exportData('json')}
            disabled={exporting !== null}
            className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:bg-emerald-400"
          >
            {exporting === 'json' ? 'Preparing…' : 'Download JSON backup'}
          </button>
          <button
            type="button"
            onClick={() => exportData('csv')}
            disabled={exporting !== null}
            className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
          >
            {exporting === 'csv' ? 'Preparing…' : 'Download CSV'}
          </button>
        </div>
        <ul className="mt-4 space-y-1 text-xs leading-relaxed text-slate-500">
          <li>
            <strong className="font-semibold text-slate-700">JSON</strong> is the complete
            backup: accounts with opening balances, categories, every monthly budget and every
            transaction.
          </li>
          <li>
            <strong className="font-semibold text-slate-700">CSV</strong> is the transaction
            ledger for spreadsheets. Cells that could be read as formulas are prefixed so a
            spreadsheet cannot execute them, and amounts keep two decimals.
          </li>
          <li>The file is unencrypted, so store it somewhere you trust.</li>
        </ul>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold tracking-tight">Backup and recovery</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          <strong className="font-semibold text-slate-900">
            No automatic backup is configured or verified for this project.
          </strong>{' '}
          Nothing in this app schedules one, so the JSON export above is the only backup this
          project can currently prove works.
        </p>
        <dl className="mt-4 space-y-3 text-sm leading-relaxed text-slate-600">
          <div>
            <dt className="font-semibold text-slate-800">What you can do today</dt>
            <dd>
              Download the JSON export after important changes and keep it somewhere safe.
              It is a snapshot, not a live copy, and it is not automatic.
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-slate-800">What your Supabase plan may add</dt>
            <dd>
              Supabase dashboards sometimes include scheduled backups or point-in-time
              recovery, depending on the project&apos;s plan and any add-ons. Whether this
              project has them was not verified here — check <em>Database → Backups</em> in
              the Supabase dashboard. If nothing is listed there, assume there is no backup.
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-slate-800">Recovering after a mistake</dt>
            <dd>
              A deleted transaction can be undone from the toast immediately after deleting
              it, before it disappears. After that, deletion is permanent: there is no trash
              and no importer in this app, so recovery means restoring a database backup or
              re-entering the rows from an export.
            </dd>
          </div>
        </dl>
        <p className="mt-4 text-xs leading-relaxed text-slate-500">
          The technical backup options (dashboard backups, point-in-time recovery and{' '}
          <code className="rounded bg-slate-100 px-1 py-0.5">pg_dump</code>) are explained in{' '}
          <code className="rounded bg-slate-100 px-1 py-0.5">supabase/README.md</code>.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold tracking-tight">App settings</h2>
        <dl className="mt-5 grid gap-5 sm:grid-cols-2">
          <div>
            <dt className={labelCls}>App name</dt>
            <dd className={valueCls}>Expense Tracker</dd>
          </div>
          <div>
            <dt className={labelCls}>Currency</dt>
            <dd className={valueCls}>₹ Indian Rupee (INR, en-IN format)</dd>
          </div>
          <div>
            <dt className={labelCls}>Data mode</dt>
            <dd className={valueCls}>
              <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800 uppercase">
                Cloud
              </span>
            </dd>
          </div>
        </dl>
      </div>

      <CategoryManager
        categories={categories}
        transactions={transactions}
        budgets={budgets}
        onSave={onSaveCategory}
        onDelete={onDeleteCategory}
        onNotify={onNotify}
      />

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold tracking-tight">Privacy</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          Every table uses Row Level Security: the database itself only returns rows whose
          owner matches your signed-in user id. The public key in the browser can read
          nothing on its own — no other account, and no anonymous visitor, can see your
          transactions, accounts, categories or budgets.
        </p>
      </div>
    </div>
  )
}
