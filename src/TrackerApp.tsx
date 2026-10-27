import { useCallback, useMemo, useState } from 'react'
import { MobileDrawer, Sidebar, TopBar, VIEW_TITLES } from './components/Navigation'
import { TransactionFormModal } from './components/TransactionFormModal'
import { ConfirmDialog } from './components/ConfirmDialog'
import { Toast, type ToastData } from './components/Toast'
import { LoadErrorPanel, LoadingScreen } from './components/ScreenStates'
import { DashboardView } from './views/DashboardView'
import { TransactionsView } from './views/TransactionsView'
import { BudgetsView } from './views/BudgetsView'
import { ReportsView } from './views/ReportsView'
import { SettingsView } from './views/SettingsView'
import { useAuth } from './lib/auth'
import { useWorkspace } from './lib/useWorkspace'
import { budgetWarningForMonth, lastMonthKeys, monthlyTotals } from './lib/finance'
import { formatINR } from './lib/format'
import type { ViewKey } from './views/viewKeys'
import type { Transaction } from './types'

const messageOf = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback

const VIEW_SUBTITLES: Record<ViewKey, string> = {
  dashboard: 'Your money at a glance · priced in ₹',
  transactions: '',
  budgets: 'Monthly limits and how much is left',
  reports: 'Filter by date, drill into months, compare budgets',
  settings: 'Your account and data',
}

/**
 * The signed-in application. Everything here reads from the user's own rows;
 * writes go to Supabase first and only then update the screen.
 */
export function TrackerApp() {
  const { user, signOut } = useAuth()
  const {
    data,
    loading,
    error,
    syncing,
    syncError,
    lastSyncedAt,
    online,
    reload,
    refresh,
    addTransaction,
    updateTransaction,
    deleteTransaction,
    restoreTransaction,
    saveBudget,
    deleteBudget,
    saveCategory,
    deleteCategory,
  } = useWorkspace(user?.id)

  const [view, setView] = useState<ViewKey>('dashboard')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Transaction | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [toast, setToast] = useState<ToastData | null>(null)

  const monthKeys = useMemo(() => lastMonthKeys(6), [])
  const monthly = useMemo(
    () => monthlyTotals(data.transactions, monthKeys),
    [data.transactions, monthKeys],
  )
  const currentMonthKey = monthKeys[monthKeys.length - 1]

  const dismissToast = useCallback(() => setToast(null), [])

  const notify = useCallback(
    (message: string, tone?: 'success' | 'error' | 'warning') =>
      setToast({ id: Date.now(), message, tone }),
    [],
  )

  const showError = useCallback((message: string) => {
    setToast({ id: Date.now(), message, tone: 'error' })
  }, [])

  const handleSignOut = useCallback(async () => {
    try {
      await signOut()
    } catch (err) {
      showError(messageOf(err, 'Could not sign out. Try again.'))
    }
  }, [signOut, showError])

  const openAdd = () => {
    setEditing(null)
    setFormOpen(true)
  }

  const openEdit = (tx: Transaction) => {
    setEditing(tx)
    setFormOpen(true)
  }

  /** Throws on failure so the form can stay open and explain what happened. */
  const handleSave = async (values: Omit<Transaction, 'id'>, pendingId: string) => {
    if (editing) {
      await updateTransaction(editing.id, values)
    } else {
      // The same pendingId is retried, so a save whose response was lost
      // cannot become two transactions.
      await addTransaction(values, pendingId)
    }

    // Warn straight away when this save pushes a category close to (or past)
    // its monthly budget, even if the user is on the dashboard.
    const after = [
      { ...values, id: editing?.id ?? 'pending' },
      ...data.transactions.filter((t) => t.id !== editing?.id),
    ]
    const warning =
      values.type === 'expense'
        ? budgetWarningForMonth(values.category, values.date.slice(0, 7), data.budgets, after)
        : null
    const message = editing
      ? `Saved changes to “${values.note}”.`
      : `Added “${values.note}” — ${formatINR(values.amount)}.`

    notify(warning ? `${message} ${warning.message}` : message, warning ? 'warning' : undefined)
  }

  const requestDelete = (tx: Transaction) => setPendingDelete(tx)

  const confirmDelete = async () => {
    const removed = pendingDelete
    if (!removed) return
    setDeleting(true)
    try {
      await deleteTransaction(removed.id)
      setPendingDelete(null)
      setToast({
        id: Date.now(),
        message: `Deleted “${removed.note}” — ${formatINR(removed.amount)}.`,
        actionLabel: 'Undo',
        onAction: async () => {
          try {
            await restoreTransaction(removed)
            setToast({ id: Date.now(), message: 'Transaction restored.' })
          } catch (err) {
            showError(messageOf(err, 'Could not restore that transaction.'))
          }
        },
      })
    } catch (err) {
      showError(messageOf(err, 'Could not delete that transaction.'))
    } finally {
      setDeleting(false)
    }
  }

  if (loading) return <LoadingScreen />

  if (error) {
    return (
      <LoadErrorPanel
        message={error}
        onRetry={() => void reload()}
        onSignOut={() => void handleSignOut()}
      />
    )
  }

  const email = user?.email ?? ''

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 antialiased">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-emerald-600 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        Skip to content
      </a>

      <Sidebar
        active={view}
        onNavigate={setView}
        userEmail={email}
        onSignOut={() => void handleSignOut()}
      />

      <div className="lg:pl-64">
        <TopBar
          active={view}
          onOpenDrawer={() => setDrawerOpen(true)}
          onAddTransaction={openAdd}
          drawerOpen={drawerOpen}
        />
        <main id="main-content" className="mx-auto max-w-6xl px-4 py-6 lg:px-8 lg:py-8">
          {!online && (
            <div
              role="status"
              className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
            >
              <span className="font-semibold">You are offline.</span> Changes cannot be
              saved until the connection returns. Anything already saved is safe in
              Supabase and will reload automatically.
            </div>
          )}
          {syncError && (
            <div
              role="alert"
              className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
            >
              <span className="flex-1">
                <span className="font-semibold">Could not refresh from the cloud.</span>{' '}
                {syncError} The data on screen may be out of date.
              </span>
              <button
                type="button"
                onClick={() => void refresh()}
                className="rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-800 hover:bg-rose-100 focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:outline-none"
              >
                Try again
              </button>
            </div>
          )}

          <div className="mb-6 hidden items-center justify-between lg:flex">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{VIEW_TITLES[view]}</h1>
              <p className="text-sm text-slate-500">
                {view === 'transactions'
                  ? `${data.transactions.length} transactions · search, filter and sort`
                  : VIEW_SUBTITLES[view]}
              </p>
            </div>
            <button
              type="button"
              onClick={openAdd}
              className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              ＋ Add Transaction
            </button>
          </div>

          {view === 'dashboard' && (
            <DashboardView
              transactions={data.transactions}
              categories={data.categories}
              accounts={data.accounts}
              monthly={monthly}
              currentMonthKey={currentMonthKey}
              onAddTransaction={openAdd}
            />
          )}
          {view === 'transactions' && (
            <TransactionsView
              transactions={data.transactions}
              categories={data.categories}
              onAdd={openAdd}
              onEdit={openEdit}
              onDelete={requestDelete}
            />
          )}
          {view === 'budgets' && (
            <BudgetsView
              budgets={data.budgets}
              categories={data.categories}
              transactions={data.transactions}
              currentMonthKey={currentMonthKey}
              onSaveBudget={saveBudget}
              onDeleteBudget={deleteBudget}
              onNotify={notify}
            />
          )}
          {view === 'reports' && (
            <ReportsView
              transactions={data.transactions}
              categories={data.categories}
              budgets={data.budgets}
              onNotify={notify}
              onOpenBudgets={() => setView('budgets')}
            />
          )}
          {view === 'settings' && (
            <SettingsView
              email={email}
              userId={user?.id ?? ''}
              memberSince={user?.created_at}
              accounts={data.accounts}
              categories={data.categories}
              transactions={data.transactions}
              budgets={data.budgets}
              lastSyncedAt={lastSyncedAt}
              syncing={syncing}
              syncError={syncError}
              online={online}
              onRefresh={async () => {
                const ok = await refresh()
                notify(
                  ok ? 'Reloaded your data from Supabase.' : 'Could not reach Supabase. Try again.',
                  ok ? 'success' : 'error',
                )
              }}
              onSaveCategory={saveCategory}
              onDeleteCategory={deleteCategory}
              onNotify={notify}
              onSignOut={() => void handleSignOut()}
            />
          )}
        </main>
      </div>

      <MobileDrawer
        open={drawerOpen}
        active={view}
        onNavigate={setView}
        onClose={() => setDrawerOpen(false)}
        userEmail={email}
        onSignOut={() => void handleSignOut()}
      />

      <TransactionFormModal
        open={formOpen}
        initial={editing}
        categories={data.categories}
        accounts={data.accounts}
        transactions={data.transactions}
        userId={user?.id ?? ''}
        onClose={() => setFormOpen(false)}
        onSave={handleSave}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this transaction?"
        description={
          pendingDelete && (
            <>
              <p className="font-medium text-slate-800">
                “{pendingDelete.note}” · {formatINR(pendingDelete.amount)}
              </p>
              <p className="mt-1">
                This removes it from your dashboard, budgets and totals everywhere. You can
                undo straight afterwards.
              </p>
            </>
          )
        }
        confirmLabel={deleting ? 'Deleting…' : 'Delete'}
        busy={deleting}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setPendingDelete(null)}
      />

      <Toast toast={toast} onDismiss={dismissToast} />
    </div>
  )
}
