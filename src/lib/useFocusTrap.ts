import { useEffect, type RefObject } from 'react'

/**
 * Keeps keyboard focus inside an open dialog (WCAG 2.4.3 and 2.1.2).
 *
 * Without this, Tab from the last control in a dialog escapes to the page
 * behind it, where a keyboard user cannot see where focus went. The trap
 * does not choose the *initial* focus — each dialog keeps its own rule (the
 * amount field, Cancel, the drawer's close button). It only makes Tab and
 * Shift+Tab cycle within the container, and hands focus back to whatever
 * opened the dialog when it closes.
 */

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

/** Visible, enabled controls inside the container, in tab order. */
function focusableIn(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => element.getClientRects().length > 0,
  )
}

export function useFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
  active: boolean,
): void {
  useEffect(() => {
    if (!active) return
    const container = containerRef.current
    if (!container) return

    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return
      const items = focusableIn(container)
      if (items.length === 0) return

      const first = items[0]
      const last = items[items.length - 1]
      const current = document.activeElement

      if (event.shiftKey) {
        if (current === first || !container.contains(current)) {
          event.preventDefault()
          last.focus()
        }
      } else if (current === last || !container.contains(current)) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      // Return focus to whatever opened the dialog, if it is still around.
      if (previouslyFocused?.isConnected) previouslyFocused.focus()
    }
  }, [containerRef, active])
}
