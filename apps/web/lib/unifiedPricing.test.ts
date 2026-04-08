/**
 * Tests for unified pricing computation (issue #359).
 */

import { describe, it, expect } from 'vitest'
import { computeUnifiedPrices } from './unifiedPricing'
import type { UnifiedPricingConfig } from './unifiedPricing'

const BASE_CONFIG: UnifiedPricingConfig = {
  vatPercent: 5,
  taxInclusive: false,
  serviceChargePercent: 10,
  scApplyDineIn: true,
  scApplyTakeaway: false,
  scApplyDelivery: false,
  vatApplyDineIn: true,
  vatApplyTakeaway: true,
  vatApplyDelivery: false,
  deliveryZones: [
    { id: 'z1', name: 'Zone A', charge_amount: 99 },
    { id: 'z2', name: 'Zone B', charge_amount: 199 },
  ],
}

describe('computeUnifiedPrices', () => {
  it('computes dine-in price: base + SC + VAT', () => {
    // base=65000 (৳650), SC=10%→+6500=71500, VAT=5%→+3575=75075 → round
    // SC: Math.round(65000 * 10 / 100) = 6500 → 71500
    // VAT on total: Math.round(71500 * 5 / 100) = 3575 → 75075
    const result = computeUnifiedPrices(65000, BASE_CONFIG)
    expect(result.dineInCents).toBe(75075)
  })

  it('computes takeaway price: base + VAT only (no SC)', () => {
    // base=65000, no SC, VAT=5%→Math.round(65000*5/100)=3250 → 68250
    const result = computeUnifiedPrices(65000, BASE_CONFIG)
    expect(result.takeawayCents).toBe(68250)
  })

  it('computes delivery min price: base + min zone fee (no VAT for delivery)', () => {
    // base=65000, no SC, no VAT (vatApplyDelivery=false)
    // min zone = 99 BDT = 9900 cents → 65000 + 9900 = 74900
    const result = computeUnifiedPrices(65000, BASE_CONFIG)
    expect(result.deliveryMinCents).toBe(74900)
  })

  it('computes delivery max price: base + max zone fee', () => {
    // max zone = 199 BDT = 19900 cents → 65000 + 19900 = 84900
    const result = computeUnifiedPrices(65000, BASE_CONFIG)
    expect(result.deliveryMaxCents).toBe(84900)
  })

  it('flags delivery range when min != max', () => {
    const result = computeUnifiedPrices(65000, BASE_CONFIG)
    expect(result.deliveryHasRange).toBe(true)
  })

  it('no delivery range when single zone', () => {
    const config: UnifiedPricingConfig = {
      ...BASE_CONFIG,
      deliveryZones: [{ id: 'z1', name: 'Zone A', charge_amount: 99 }],
    }
    const result = computeUnifiedPrices(65000, config)
    expect(result.deliveryHasRange).toBe(false)
    expect(result.deliveryMinCents).toBe(result.deliveryMaxCents)
  })

  it('delivery without zones: no zone fee added', () => {
    const config: UnifiedPricingConfig = { ...BASE_CONFIG, deliveryZones: [] }
    const result = computeUnifiedPrices(65000, config)
    // No zones — just base (65000) with no SC/VAT for delivery
    expect(result.deliveryMinCents).toBe(65000)
    expect(result.deliveryHasRange).toBe(false)
  })

  it('tax-inclusive mode: VAT not added on top', () => {
    const config: UnifiedPricingConfig = { ...BASE_CONFIG, taxInclusive: true }
    // Dine-in: base=65000, SC applied (10%) = 6500 → 71500
    // taxInclusive: VAT already included, so no extra VAT charge
    const result = computeUnifiedPrices(65000, config)
    expect(result.dineInCents).toBe(71500)
    // Takeaway: no SC, taxInclusive, no extra VAT
    expect(result.takeawayCents).toBe(65000)
  })

  it('zero service charge: no SC added', () => {
    const config: UnifiedPricingConfig = { ...BASE_CONFIG, serviceChargePercent: 0 }
    // Dine-in: no SC, VAT=5% → Math.round(65000*5/100)=3250 → 68250
    const result = computeUnifiedPrices(65000, config)
    expect(result.dineInCents).toBe(68250)
  })

  it('zero VAT: no VAT added', () => {
    const config: UnifiedPricingConfig = { ...BASE_CONFIG, vatPercent: 0 }
    // Dine-in: SC=10% → 65000+6500=71500, no VAT
    const result = computeUnifiedPrices(65000, config)
    expect(result.dineInCents).toBe(71500)
    // Takeaway: no SC, no VAT
    expect(result.takeawayCents).toBe(65000)
  })
})
