import { useState } from 'react'
import { useAuth } from '../lib/auth'

type Mode = 'sign-in' | 'sign-up'

const inputCls =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/40 focus:outline-none'
const labelCls = 'mb-1.5 block text-sm font-medium text-slate-700'

/**
 * Sign in / create account.
 * A personal tracker normally has exactly one account, but sign-up stays
 * available so the app can be set up without touching the dashboard.
 */
export function AuthScreen() {
  const { signIn, signUp } = useAuth()
  const [mode, setMode] = useState<Mode>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const switchMode = (next: Mode) => {
    setMode(next)
    setError(null)
    setNotice(null)
    setConfirm('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setNotice(null)

    const trimmedEmail = email.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError('Enter a valid email address, like you@example.com.')
      return
    }
    if (!password) {
      setError('Enter your password.')
      return
    }
    if (mode === 'sign-up') {
      if (password.length < 8) {
        setError('Use a password with at least 8 characters.')
        return
      }
      if (password !== confirm) {
        setError('The two passwords do not match.')
        return
      }
    }

    setBusy(true)
    try {
      if (mode === 'sign-in') {
        await signIn(trimmedEmail, password)
      } else {
        const { needsConfirmation } = await signUp(trimmedEmail, password)
        if (needsConfirmation) {
          setNotice(
            `Account created. Check ${trimmedEmail} for a confirmation link, then come back and sign in.`,
          )
          setPassword('')
          setConfirm('')
          setMode('sign-in')
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-3">
          <span className="grid size-11 place-items-center rounded-2xl bg-emerald-600 text-xl font-bold text-white shadow-sm">
            ₹
          </span>
          <div>
            <p className="text-lg font-semibold tracking-tight text-slate-900">Expense Tracker</p>
            <p className="text-xs text-slate-500">Private personal finance · priced in ₹</p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div role="tablist" aria-label="Sign in or create account" className="mb-6 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
            {(['sign-in', 'sign-up'] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => switchMode(m)}
                className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-none ${
                  mode === m ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {m === 'sign-in' ? 'Sign in' : 'Create account'}
              </button>
            ))}
          </div>

          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            {mode === 'sign-in' ? 'Welcome back' : 'Create your account'}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {mode === 'sign-in'
              ? 'Sign in to reach your transactions on any device.'
              : 'One account for your expenses, synced everywhere you sign in.'}
          </p>

          <form className="mt-6 space-y-4" onSubmit={handleSubmit} noValidate>
            <div>
              <label htmlFor="auth-email" className={labelCls}>
                Email
              </label>
              <input
                id="auth-email"
                type="email"
                autoComplete="email"
                inputMode="email"
                placeholder="you@example.com"
                aria-invalid={Boolean(error)}
                aria-describedby={error ? 'auth-error' : undefined}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  setError(null)
                }}
                className={inputCls}
              />
            </div>

            <div>
              <label htmlFor="auth-password" className={labelCls}>
                Password
              </label>
              <input
                id="auth-password"
                type="password"
                autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
                placeholder={mode === 'sign-up' ? 'At least 8 characters' : 'Your password'}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? 'auth-error' : undefined}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  setError(null)
                }}
                className={inputCls}
              />
            </div>

            {mode === 'sign-up' && (
              <div>
                <label htmlFor="auth-confirm" className={labelCls}>
                  Confirm password
                </label>
                <input
                  id="auth-confirm"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Type it again"
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? 'auth-error' : undefined}
                  value={confirm}
                  onChange={(e) => {
                    setConfirm(e.target.value)
                    setError(null)
                  }}
                  className={inputCls}
                />
              </div>
            )}

            <div aria-live="polite" className="min-h-5">
              {error && (
                <p
                  id="auth-error"
                  role="alert"
                  className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700"
                >
                  {error}
                </p>
              )}
              {notice && (
                <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
                  {notice}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:bg-emerald-400"
            >
              {busy
                ? mode === 'sign-in'
                  ? 'Signing in…'
                  : 'Creating account…'
                : mode === 'sign-in'
                  ? 'Sign in'
                  : 'Create account'}
            </button>
          </form>

          <p className="mt-6 border-t border-slate-100 pt-4 text-xs leading-relaxed text-slate-500">
            Your records are stored in your own Supabase project and protected by row-level
            security, so only this account can read them.
          </p>
        </div>
      </div>
    </div>
  )
}
