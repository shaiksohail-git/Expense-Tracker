import { useEffect } from 'react'
import { IconAlert, IconCheck, IconX } from './Icons'

export interface ToastData {
  id: number
  message: string
  /** Defaults to a success (green) message. */
  tone?: 'success' | 'error' | 'warning'
  actionLabel?: string
  onAction?: () => void | Promise<void>
}

const AUTO_DISMISS_MS = 8000

/**
 * Short confirmation of what just happened, with an optional action
 * (used for "Deleted … Undo").
 * Successes are announced politely; failures use `role="alert"`.
 */
export function Toast({ toast, onDismiss }: { toast: ToastData | null; onDismiss: () => void }) {
  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(onDismiss, AUTO_DISMISS_MS)
    return () => window.clearTimeout(timer)
  }, [toast, onDismiss])

  if (!toast) return null

  const tone = toast.tone ?? 'success'
  const isError = tone === 'error'
  const isWarning = tone === 'warning'

  return (
    <div
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
      className="fixed bottom-4 left-1/2 z-[70] w-[calc(100%-2rem)] max-w-md -translate-x-1/2"
    >
      <div className="flex items-center gap-3 rounded-xl bg-slate-900 px-4 py-3 text-sm text-white shadow-xl">
        <span
          className={`grid size-6 shrink-0 place-items-center rounded-full ${
            isError
              ? 'bg-rose-500/20 text-rose-300'
              : isWarning
                ? 'bg-amber-500/20 text-amber-300'
                : 'bg-emerald-500/20 text-emerald-300'
          }`}
        >
          {isError ? (
            <IconX className="size-4" />
          ) : isWarning ? (
            <IconAlert className="size-4" />
          ) : (
            <IconCheck className="size-4" />
          )}
        </span>
        <p className="flex-1 leading-snug">{toast.message}</p>
        {toast.actionLabel && toast.onAction && (
          <button
            type="button"
            onClick={() => {
              // Dismiss first: the action may show a fresh toast of its own.
              onDismiss()
              void toast.onAction?.()
            }}
            className="rounded-lg bg-white/10 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:outline-none"
          >
            {toast.actionLabel}
          </button>
        )}
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss message"
          className="rounded-lg p-1.5 text-slate-300 hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:outline-none"
        >
          <IconX className="size-4" />
        </button>
      </div>
    </div>
  )
}
