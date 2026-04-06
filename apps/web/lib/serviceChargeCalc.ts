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
 * Per-order-type flags for service charge application.
 * Defaults (per issue #357): dine-in = true, takeaway = false, delivery = false.
 */
export interface ServiceChargeApplyConfig {
  applyDineIn: boolean
  applyTakeaway: boolean
  applyDelivery: boolean
}

/** Default config: service charge applies to dine-in only. */
export const DEFAULT_SERVICE_CHARGE_APPLY_CONFIG: ServiceChargeApplyConfig = {
  applyDineIn: true,
  applyTakeaway: false,
  applyDelivery: false,
}

/**
 * Determine whether service charge should be applied for the given order type
 * based on the restaurant's configuration.
 */
export function shouldApplyServiceCharge(
  orderType: 'dine_in' | 'takeaway' | 'delivery',
  config: ServiceChargeApplyConfig,
): boolean {
  switch (orderType) {
    case 'dine_in': return config.applyDineIn
    case 'takeaway': return config.applyTakeaway
    case 'delivery': return config.applyDelivery
    default: {
      // TypeScript exhaustiveness check — compile error if a new order type is added without updating this function
      const _exhaustive: never = orderType
      void _exhaustive
      return false
    }
  }
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
