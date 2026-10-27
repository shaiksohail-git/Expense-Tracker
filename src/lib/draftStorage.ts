import type { TransactionDraft } from './transactionForm'

/**
 * Unsaved transactions are kept in this browser's localStorage until they are
 * saved or explicitly discarded.
 *
 * The database is still the only source of truth for saved data; this exists
 * so a failed or interrupted save cannot quietly lose what the user typed.
 * Drafts are per user id, so signing out and in as somebody else never shows
 * the previous person's half-typed transaction.
 */

export const DRAFT_VERSION = 1
export const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

const KEY_PREFIX = 'expense-tracker:pending-transaction:'

export interface StoredDraft {
  version: typeof DRAFT_VERSION
  userId: string
  /** Client-generated row id, reused on retry so a retry cannot duplicate. */
  pendingId: string
  values: TransactionDraft
  savedAt: string
}

/** The subset of the Storage API used here, so tests can pass a fake. */
export type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export function draftKey(userId: string): string {
  return `${KEY_PREFIX}${userId}`
}

function isTransactionDraft(value: unknown): value is TransactionDraft {
  if (!value || typeof value !== 'object') return false
  const draft = value as Record<string, unknown>
  return (
    (draft.type === 'income' || draft.type === 'expense' || draft.type === 'transfer') &&
    typeof draft.amount === 'string' &&
    typeof draft.date === 'string' &&
    typeof draft.category === 'string' &&
    typeof draft.account === 'string' &&
    typeof draft.toAccount === 'string' &&
    typeof draft.note === 'string'
  )
}

function isStoredDraft(value: unknown, userId: string): value is StoredDraft {
  if (!value || typeof value !== 'object') return false
  const draft = value as Record<string, unknown>
  return (
    draft.version === DRAFT_VERSION &&
    draft.userId === userId &&
    typeof draft.pendingId === 'string' &&
    draft.pendingId.length > 0 &&
    typeof draft.savedAt === 'string' &&
    isTransactionDraft(draft.values)
  )
}

/**
 * Parse one stored value. Returns null for missing, malformed, stale or
 * another user's drafts rather than throwing — a corrupt draft must never
 * stop the form from opening.
 */
export function parseStoredDraft(
  raw: string | null,
  userId: string,
  now = Date.now(),
): StoredDraft | null {
  if (!raw) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isStoredDraft(parsed, userId)) return null

  const savedAt = Date.parse(parsed.savedAt)
  if (!Number.isFinite(savedAt)) return null
  if (now - savedAt > DRAFT_MAX_AGE_MS) return null
  // A clock far in the future is as suspicious as a very old draft.
  if (savedAt - now > 60_000) return null

  return parsed
}

export function readDraft(
  storage: DraftStorage,
  userId: string,
  now = Date.now(),
): StoredDraft | null {
  try {
    return parseStoredDraft(storage.getItem(draftKey(userId)), userId, now)
  } catch {
    // Storage can be unavailable (private mode, disabled cookies).
    return null
  }
}

export function writeDraft(
  storage: DraftStorage,
  userId: string,
  pendingId: string,
  values: TransactionDraft,
  now = Date.now(),
): void {
  const draft: StoredDraft = {
    version: DRAFT_VERSION,
    userId,
    pendingId,
    values,
    savedAt: new Date(now).toISOString(),
  }
  try {
    storage.setItem(draftKey(userId), JSON.stringify(draft))
  } catch {
    // Quota or unavailable storage: saving to the database still works.
  }
}

export function clearDraft(storage: DraftStorage, userId: string): void {
  try {
    storage.removeItem(draftKey(userId))
  } catch {
    // Nothing useful to do; the draft will expire on its own.
  }
}

/**
 * True when the user has actually entered something worth keeping. Opening
 * the form and closing it again should not leave a "restored draft" behind.
 */
export function hasDraftContent(values: TransactionDraft): boolean {
  return (
    values.amount.trim() !== '' ||
    values.note.trim() !== '' ||
    values.category !== '' ||
    values.type !== 'expense' ||
    values.toAccount !== ''
  )
}
