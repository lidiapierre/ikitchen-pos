/**
 * VAT calculation utility — pure functions, no side effects.
 *
 * tax_inclusive = false (exclusive):
 *   VAT is added ON TOP of item subtotal.
 *   vatCents  = round(subtotal × rate / 100)
 *   total     = subtotal + vatCents
 *
 * tax_inclusive = true (inclusive):
 *   VAT is already BAKED INTO item prices.
 *   vatCents  = round(gross × rate / (100 + rate))
 *   net       = gross − vatCents   (displayed as subtotal)
 *   total     = gross              (unchanged)
 */

export interface VatBreakdown {
  /** Net amount before VAT (or extracted net if inclusive) */
  subtotalCents: number
  /** VAT amount in cents */
  vatCents: number
  /** Grand total to charge the customer */
  totalCents: number
  /** VAT rate used (%) */
  vatPercent: number
  /** Whether prices were tax-inclusive */
  taxInclusive: boolean
}

/**
 * Calculate VAT breakdown from a raw items-sum in cents.
 *
 * @param rawSubtotalCents  Sum of (quantity × price_cents) for all items
 * @param vatPercent        VAT rate in percent (e.g. 15 for 15%)
 * @param taxInclusive      Whether prices already include VAT
 */
export function calcVat(
  rawSubtotalCents: number,
  vatPercent: number,
  taxInclusive: boolean,
): VatBreakdown {
  // Zero or negative rate → no VAT line
  if (vatPercent <= 0) {
    return {
      subtotalCents: rawSubtotalCents,
      vatCents: 0,
      totalCents: rawSubtotalCents,
      vatPercent,
      taxInclusive,
    }
  }

  if (taxInclusive) {
    // Reverse-calculate: extract VAT from gross
    // vat = gross × rate / (100 + rate)
    const vatCents = Math.round((rawSubtotalCents * vatPercent) / (100 + vatPercent))
    return {
      subtotalCents: rawSubtotalCents - vatCents,
      vatCents,
      totalCents: rawSubtotalCents,
      vatPercent,
      taxInclusive,
    }
  } else {
    // Add VAT on top of net
    // vat = net × rate / 100
    const vatCents = Math.round((rawSubtotalCents * vatPercent) / 100)
    return {
      subtotalCents: rawSubtotalCents,
      vatCents,
      totalCents: rawSubtotalCents + vatCents,
      vatPercent,
      taxInclusive,
    }
  }
}
