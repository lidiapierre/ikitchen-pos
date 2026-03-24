/**
 * Format a price from cents to a human-readable string with the given currency symbol.
 * e.g. formatPrice(165000, '৳') → '৳ 1,650.00'
 * e.g. formatPrice(850, '৳')   → '৳ 8.50'
 */
export function formatPrice(cents: number, symbol: string): string {
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100)
  return `${symbol} ${formatted}`
}

export const DEFAULT_CURRENCY_SYMBOL = '৳'
