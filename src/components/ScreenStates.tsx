export function LoadingScreen({ label = 'Loading your data…' }: { label?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div role="status" aria-live="polite" className="flex flex-col items-center gap-3">
        <span
          className="size-8 animate-spin rounded-full border-2 border-slate-200 border-t-emerald-600"
          aria-hidden="true"
        />
        <p className="text-sm font-medium text-slate-600">{label}</p>
      </div>
    </div>
  )
}

/**
 * Shown when .env.local has no Supabase credentials. Kept deliberately plain:
 * this is a developer message, not part of the product.
 */
export function SetupNotice() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-lg rounded-2xl border border-amber-200 bg-white p-6 shadow-sm sm:p-8">
        <span className="grid size-11 place-items-center rounded-2xl bg-amber-100 text-xl" aria-hidden="true">
          🔌
        </span>
        <h1 className="mt-4 text-xl font-bold tracking-tight text-slate-900">
          Supabase is not configured yet
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          The app needs two values before it can sign you in. Open{' '}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[13px]">expense-tracker/.env.local</code>{' '}
          and fill in:
        </p>
        <ul className="mt-3 space-y-1 rounded-xl bg-slate-50 p-3 font-mono text-xs text-slate-700">
          <li>VITE_SUPABASE_URL</li>
          <li>VITE_SUPABASE_ANON_KEY</li>
        </ul>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">
          Both live in your Supabase dashboard under{' '}
          <strong>Project Settings → API</strong>. Restart <code>npm run dev</code> after saving
          the file.
        </p>
      </div>
    </div>
  )
}

export function LoadErrorPanel({
  message,
  onRetry,
  onSignOut,
}: {
  message: string
  onRetry: () => void
  onSignOut: () => void
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div role="alert" className="w-full max-w-md rounded-2xl border border-rose-200 bg-white p-6 shadow-sm">
        <h1 className="text-lg font-semibold tracking-tight text-slate-900">
          Could not load your data
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">{message}</p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={onRetry}
            className="flex-1 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={onSignOut}
            className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-none"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  )
}
