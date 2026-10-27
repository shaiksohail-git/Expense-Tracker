import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { useFocusTrap } from '../lib/useFocusTrap'

interface Props {
  open: boolean
  title: string
  description: ReactNode
  confirmLabel: string
  cancelLabel?: string
  /** While true both buttons are disabled and the dialog cannot be dismissed. */
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Accessible destructive-action confirmation.
 * - `role="alertdialog"` so screen readers announce it immediately
 * - Escape and the backdrop both cancel (never confirm)
 * - focus starts on **Cancel**, the safe choice, not on the red button
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  busy = false,
  onConfirm,
  onCancel,
}: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  // Focus stays inside the dialog while it is open, and returns to the
  // element that opened it when it closes. Initial focus is Cancel's.
  useFocusTrap(dialogRef, open)

  useEffect(() => {
    if (!open) return
    cancelRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onCancel, busy])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center p-4 sm:items-center">
      <div
        className="absolute inset-0 bg-slate-900/50"
        aria-hidden="true"
        onClick={busy ? undefined : onCancel}
      />
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-description"
        className="relative w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl"
      >
        <h2 id="confirm-title" className="text-lg font-semibold tracking-tight text-slate-900">
          {title}
        </h2>
        <div id="confirm-description" className="mt-2 text-sm text-slate-600">
          {description}
        </div>
        <div className="mt-6 flex gap-3">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="flex-1 rounded-lg bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-700 focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:bg-rose-400"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
