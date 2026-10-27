import type { BudgetDef, CategoryDef, Transaction } from '../types'

/**
 * Rules for the category manager (Settings → Categories).
 *
 * A category is identified everywhere in the app by its name, but the
 * database links transactions and budgets to it by id. That means:
 *   - renaming is always safe: history follows the id, and every screen
 *     re-reads names after the write
 *   - the type (income / expense) and deletion are only safe while nothing
 *     references the category, because the database would either reject the
 *     write or silently cascade a budget away
 *
 * Everything here is pure so the rules can be unit tested without a browser
 * or a database.
 */

export type CategoryKind = 'income' | 'expense'

/** Mirrors the database check: char_length(btrim(name)) between 1 and 60. */
export const CATEGORY_NAME_MAX = 60

/** Mirrors the database check: color ~ '^#[0-9a-fA-F]{6}$'. */
export const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/

export interface CategoryDraft {
  name: string
  kind: CategoryKind
  color: string
}

export type CategoryField = keyof CategoryDraft
export type CategoryErrors = Partial<Record<CategoryField, string>>

export interface CategoryFormContext {
  /** Every category, including the one being edited. */
  categories: CategoryDef[]
  /** Name of the category being edited, or null when creating a new one. */
  editing?: string | null
}

export interface CategoryValidation {
  errors: CategoryErrors
  /** Present only when `errors` is empty: trimmed, lowercased colour. */
  values: CategoryDraft | null
}

/**
 * The single source of truth for what a valid category is:
 *   - a trimmed name of 1–60 characters that no other category already uses
 *     (compared case-insensitively, because the app keys everything by name)
 *   - a kind of exactly income or expense
 *   - a #rrggbb colour
 */
export function validateCategoryDraft(
  draft: CategoryDraft,
  ctx: CategoryFormContext,
): CategoryValidation {
  const errors: CategoryErrors = {}
  const name = draft.name.trim()

  if (!name) {
    errors.name = 'Enter a name for the category.'
  } else if (name.length > CATEGORY_NAME_MAX) {
    errors.name = `Keep the name to ${CATEGORY_NAME_MAX} characters or fewer.`
  } else {
    const clash = ctx.categories.find(
      (c) => c.name !== (ctx.editing ?? null) && c.name.toLowerCase() === name.toLowerCase(),
    )
    if (clash) errors.name = `You already have a category called “${clash.name}”.`
  }

  if (draft.kind !== 'income' && draft.kind !== 'expense') {
    errors.kind = 'Choose income or expense.'
  }

  if (!HEX_COLOR_PATTERN.test(draft.color.trim())) {
    errors.color = 'Pick a colour from the palette.'
  }

  if (Object.keys(errors).length > 0) return { errors, values: null }

  return {
    errors: {},
    values: { name, kind: draft.kind, color: draft.color.trim().toLowerCase() },
  }
}

/** How much of the app currently points at a category. */
export interface CategoryUsage {
  transactions: number
  budgets: number
}

export function categoryUsage(
  name: string,
  transactions: Transaction[],
  budgets: BudgetDef[],
): CategoryUsage {
  return {
    transactions: transactions.filter((t) => t.category === name).length,
    budgets: budgets.filter((b) => b.category === name).length,
  }
}

const counted = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

function usageParts(usage: CategoryUsage): string[] {
  const parts: string[] = []
  if (usage.transactions > 0) {
    parts.push(counted(usage.transactions, 'transaction', 'transactions'))
  }
  if (usage.budgets > 0) {
    parts.push(counted(usage.budgets, 'budget', 'budgets'))
  }
  return parts
}

/** "3 transactions · 1 budget" — or "Not used yet" for an unused category. */
export function usageLabel(usage: CategoryUsage): string {
  const parts = usageParts(usage)
  return parts.length === 0 ? 'Not used yet' : parts.join(' · ')
}

/**
 * Why this category cannot be deleted right now, or null if it can be.
 * Deleting a referenced category would be rejected by the database for
 * transactions, and would silently cascade budgets away — so both are
 * refused up front with a sentence the user can act on.
 */
export function deleteBlockReason(name: string, usage: CategoryUsage): string | null {
  const parts = usageParts(usage)
  if (parts.length === 0) return null
  return `“${name}” is used by ${parts.join(' and ')}. Remove those first, then delete the category.`
}

/**
 * Why this category's type cannot change right now, or null if it can.
 * An expense transaction may only sit under an expense category (the
 * database enforces this), and budgets only exist for expense categories —
 * so re-typing a used category would strand its history.
 */
export function kindChangeBlockReason(name: string, usage: CategoryUsage): string | null {
  const parts = usageParts(usage)
  if (parts.length === 0) return null
  return `“${name}” is used by ${parts.join(' and ')}, so its type can’t change.`
}

/** Short hint shown under the type control when the type is locked. */
export function usageHint(usage: CategoryUsage): string {
  const parts = usageParts(usage)
  if (parts.length === 0) return 'Nothing uses this category yet — its type can still change.'
  const total = usage.transactions + usage.budgets
  return `Locked while ${parts.join(' and ')} ${total === 1 ? 'points' : 'point'} at it.`
}
