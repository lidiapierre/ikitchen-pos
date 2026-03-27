/**
 * Service charge calculation utility — pure functions, no side effects.
 *
 * Service charge is applied to the post-discount subtotal,
 * BEFORE VAT is calculated. Order: Subtotal → Discount → Service Charge → VAT → Total
 */

export interface ServiceChargeBreakdown {
  /** Post-discount subtotal that service charge is applied to */
  baseAmountCents: number
  /** Service charge amount in cents */
  serviceChargeCents: number
  /** Service charge rate used (%) */
  serviceChargePercent: number
}

/**
 * Calculate service charge from a post-discount subtotal in cents.
 *
 * @param postDiscountCents  Subtotal after discounts have been applied
 * @param serviceChargePercent  Service charge rate in percent (e.g. 10 for 10%). 0 = disabled.
 */
export function calcServiceCharge(
  postDiscountCents: number,
  serviceChargePercent: number,
): ServiceChargeBreakdown {
  if (serviceChargePercent <= 0 || postDiscountCents <= 0) {
    return {
      baseAmountCents: postDiscountCents,
      serviceChargeCents: 0,
      serviceChargePercent,
    }
  }

  const serviceChargeCents = Math.round((postDiscountCents * serviceChargePercent) / 100)
  return {
    baseAmountCents: postDiscountCents,
    serviceChargeCents,
    serviceChargePercent,
  }
}
