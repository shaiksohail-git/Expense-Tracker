/**
 * Shared types for the Expense Tracker.
 * Amounts are always in rupees, stored as positive numbers;
 * the *type* (income / expense / transfer) decides which way the money moves.
 */

export type TxType = 'income' | 'expense' | 'transfer'

export interface Transaction {
  id: string
  /** ISO date, e.g. "2026-10-01" */
  date: string
  type: TxType
  /** Amount in rupees (always positive; direction comes from `type`) */
  amount: number
  /** Category name (used for income & expenses, not transfers) */
  category?: string
  /** Account the money moves from (or is earned into) */
  account: string
  /** Only for transfers: the account receiving the money */
  toAccount?: string
  note: string
}

export interface CategoryDef {
  name: string
  type: 'income' | 'expense'
  /** Chart colour, hex string */
  color: string
}

export interface AccountDef {
  name: string
  /** Balance before any tracked transactions */
  openingBalance: number
}

export interface BudgetDef {
  /** Category name this limit applies to */
  category: string
  /** Spending limit in rupees */
  monthlyLimit: number
  /** Month this limit applies to, "YYYY-MM" */
  month: string
}

/** One month of aggregated numbers, used by the charts. */
export interface MonthPoint {
  /** "YYYY-MM" */
  key: string
  /** Short label, e.g. "Jul" */
  label: string
  income: number
  expense: number
  /** income - expense */
  savings: number
}
