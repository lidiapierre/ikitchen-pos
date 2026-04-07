/**
 * Format a price from cents to a human-readable string with the given currency symbol.
 * e.g. formatPrice(165000, '৳') → '৳ 1,650.00'
 * e.g. formatPrice(850, '৳')   → '৳ 8.50'
 *
 * @param roundToWhole - When true, rounds to the nearest whole number (half-up) and shows no
 *   decimal places. Used when the `round_bill_totals` restaurant setting is enabled (issue #371).
 *   e.g. formatPrice(859320, '৳', true) → '৳ 8,593'
 *   e.g. formatPrice(859360, '৳', true) → '৳ 8,594'
 */
export function formatPrice(cents: number, symbol: string, roundToWhole = false): string {
  const value = roundToWhole ? Math.round(cents / 100) : cents / 100
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: roundToWhole ? 0 : 2,
    maximumFractionDigits: roundToWhole ? 0 : 2,
  }).format(value)
  return `${symbol} ${formatted}`
}

export const DEFAULT_CURRENCY_SYMBOL = '৳'
