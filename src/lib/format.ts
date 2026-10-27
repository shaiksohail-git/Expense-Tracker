/**
 * Currency formatting helpers — all amounts in this app are Indian Rupees (₹).
 *
 * We keep money as JS numbers for now (2-decimal values like 1499.50).
 * Numbers are formatted with the `en-IN` locale, which gives the standard
 * Indian digit grouping: 1,23,456.78
 */

const inrFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
})

const inrCompactFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
})

/** Format a number as Rupees with paise, e.g. 123456.78 -> "₹1,23,456.78" */
export function formatINR(value: number): string {
  return inrFormatter.format(value)
}

/** Format a number as whole Rupees, e.g. 123456.78 -> "₹1,23,457" (for charts/totals) */
export function formatINRCompact(value: number): string {
  return inrCompactFormatter.format(value)
}
