import type { ComponentType } from 'react'
import { useEffect, useRef } from 'react'
import { useFocusTrap } from '../lib/useFocusTrap'
import {
  IconDashboard,
  IconList,
  IconMenu,
  IconPlus,
  IconReport,
  IconSettings,
  IconWallet,
  IconX,
} from './Icons'
import type { ViewKey } from '../views/viewKeys'

export const NAV_ITEMS: Array<{
  key: ViewKey
  label: string
  icon: ComponentType<{ className?: string }>
}> = [
  { key: 'dashboard', label: 'Dashboard', icon: IconDashboard },
  { key: 'transactions', label: 'Transactions', icon: IconList },
  { key: 'budgets', label: 'Budgets', icon: IconWallet },
  { key: 'reports', label: 'Reports', icon: IconReport },
  { key: 'settings', label: 'Settings', icon: IconSettings },
]

export const VIEW_TITLES: Record<ViewKey, string> = {
  dashboard: 'Dashboard',
  transactions: 'Transactions',
  budgets: 'Budgets',
  reports: 'Reports',
  settings: 'Settings',
}

function Logo() {
  return (
    <div className="flex items-center gap-2 px-2">
      <span className="grid size-9 place-items-center rounded-xl bg-emerald-600 text-lg font-bold text-white">
        ₹
      </span>
      <div className="leading-tight">
        <p className="font-semibold tracking-tight text-slate-900">Expense Tracker</p>
        <p className="text-[11px] text-slate-500">Personal finance · ₹</p>
      </div>
    </div>
  )
}

function NavLinks({
  active,
  onNavigate,
}: {
  active: ViewKey
  onNavigate: (key: ViewKey) => void
}) {
  return (
    <nav aria-label="Main navigation" className="mt-6 space-y-1">
      {NAV_ITEMS.map(({ key, label, icon: Icon }) => {
        const isActive = key === active
        return (
          <button
            key={key}
            type="button"
            onClick={() => onNavigate(key)}
            aria-current={isActive ? 'page' : undefined}
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-none ${
              isActive
                ? 'bg-emerald-50 text-emerald-800'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <Icon className="size-5 shrink-0" />
            {label}
          </button>
        )
      })}
    </nav>
  )
}

function AccountBox({
  email,
  onSignOut,
}: {
  email: string
  onSignOut: () => void
}) {
  return (
    <div className="mt-auto border-t border-slate-200 pt-3">
      <p className="px-1 text-[11px] font-semibold tracking-wide text-slate-400 uppercase">
        Signed in as
      </p>
      <p className="mt-0.5 truncate px-1 text-xs text-slate-600" title={email}>
        {email}
      </p>
      <button
        type="button"
        onClick={onSignOut}
        className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-none"
      >
        Sign out
      </button>
    </div>
  )
}

export function Sidebar({
  active,
  onNavigate,
  userEmail,
  onSignOut,
}: {
  active: ViewKey
  onNavigate: (key: ViewKey) => void
  userEmail: string
  onSignOut: () => void
}) {
  return (
    <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-slate-200 bg-white px-4 py-5 lg:flex">
      <Logo />
      <NavLinks active={active} onNavigate={onNavigate} />
      <AccountBox email={userEmail} onSignOut={onSignOut} />
    </aside>
  )
}

export function TopBar({
  active,
  onOpenDrawer,
  onAddTransaction,
  drawerOpen,
}: {
  active: ViewKey
  onOpenDrawer: () => void
  onAddTransaction: () => void
  drawerOpen: boolean
}) {
  return (
    <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur lg:hidden">
      <button
        type="button"
        onClick={onOpenDrawer}
        aria-label="Open menu"
        aria-expanded={drawerOpen}
        className="rounded-lg border border-slate-200 p-2 text-slate-700 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-none"
      >
        <IconMenu className="size-5" />
      </button>
      <h1 className="flex-1 truncate text-base font-semibold tracking-tight">
        {VIEW_TITLES[active]}
      </h1>
      <button
        type="button"
        onClick={onAddTransaction}
        className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:outline-none"
      >
        <IconPlus className="size-4" />
        Add
      </button>
    </div>
  )
}

export function MobileDrawer({
  open,
  active,
  onNavigate,
  onClose,
  userEmail,
  onSignOut,
}: {
  open: boolean
  active: ViewKey
  onNavigate: (key: ViewKey) => void
  onClose: () => void
  userEmail: string
  onSignOut: () => void
}) {
  const drawerRef = useRef<HTMLElement>(null)
  useFocusTrap(drawerRef, open)

  useEffect(() => {
    if (!open) return
    // Escape closes the drawer, matching the other dialogs in the app.
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-40 lg:hidden">
      <div
        className="absolute inset-0 bg-slate-900/50"
        aria-hidden="true"
        onClick={onClose}
      />
      <aside
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Main menu"
        className="absolute inset-y-0 left-0 flex w-64 flex-col bg-white px-4 py-5 shadow-xl"
      >
        <div className="flex items-center justify-between">
          <Logo />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="rounded-lg border border-slate-200 p-2 text-slate-700 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-none"
          >
            <IconX className="size-5" />
          </button>
        </div>
        <NavLinks
          active={active}
          onNavigate={(key) => {
            onNavigate(key)
            onClose()
          }}
        />
        <AccountBox email={userEmail} onSignOut={onSignOut} />
      </aside>
    </div>
  )
}
