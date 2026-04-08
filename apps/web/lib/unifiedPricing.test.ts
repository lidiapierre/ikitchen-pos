/**
 * Tests for unified pricing computation (issue #359).
 *
 * All monetary values are in cents.
 * `charge_amount` in DeliveryZone is in cents (matches the DB column convention).
 */

import { describe, it, expect, vi } from 'vitest'

// Mock the Supabase client so module initialisation doesn't require env vars.
// These tests only exercise the pure computeUnifiedPrices function.
vi.mock('@/lib/supabase', () => ({ supabase: {} }))

import { computeUnifiedPrices } from './unifiedPricing'
import type { UnifiedPricingConfig } from './unifiedPricing'

// charge_amount is in cents: 99 BDT = 9900 cents, 199 BDT = 19900 cents
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
    { id: 'z1', name: 'Zone A', charge_amount: 9900 },  // 99 BDT in cents
    { id: 'z2', name: 'Zone B', charge_amount: 19900 }, // 199 BDT in cents
  ],
}

describe('computeUnifiedPrices', () => {
  it('computes dine-in price: base + SC + VAT', () => {
    // base=65000 (৳650)
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
    // min zone = 9900 cents → 65000 + 9900 = 74900
    const result = computeUnifiedPrices(65000, BASE_CONFIG)
    expect(result.deliveryMinCents).toBe(74900)
  })

  it('computes delivery max price: base + max zone fee', () => {
    // max zone = 19900 cents → 65000 + 19900 = 84900
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
      deliveryZones: [{ id: 'z1', name: 'Zone A', charge_amount: 9900 }],
    }
    const result = computeUnifiedPrices(65000, config)
    expect(result.deliveryHasRange).toBe(false)
    expect(result.deliveryMinCents).toBe(result.deliveryMaxCents)
    expect(result.deliveryMinCents).toBe(65000 + 9900)
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

  it('delivery range: both min and max use correct zone fees', () => {
    const config: UnifiedPricingConfig = {
      ...BASE_CONFIG,
      deliveryZones: [
        { id: 'z1', name: 'Near', charge_amount: 5000 },  // 50 BDT in cents
        { id: 'z2', name: 'Far',  charge_amount: 15000 }, // 150 BDT in cents
      ],
    }
    const result = computeUnifiedPrices(100000, config) // base = ৳1000
    expect(result.deliveryMinCents).toBe(100000 + 5000)  // 105000
    expect(result.deliveryMaxCents).toBe(100000 + 15000) // 115000
    expect(result.deliveryHasRange).toBe(true)
  })
})
