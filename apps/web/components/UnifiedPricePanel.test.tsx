/**
 * Tests for UnifiedPricePanel (issue #359).
 *
 * charge_amount is in cents (consistent with the rest of the codebase).
 * 99 BDT = 9900 cents, 199 BDT = 19900 cents.
 */

import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

// Mock the Supabase client so module initialisation doesn't require env vars.
vi.mock('@/lib/supabase', () => ({ supabase: {} }))

import UnifiedPricePanel from './UnifiedPricePanel'
import type { UnifiedPricingConfig } from '@/lib/unifiedPricing'

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
    { id: 'z1', name: 'Zone A', charge_amount: 9900 }, // 99 BDT in cents
  ],
}

describe('UnifiedPricePanel', () => {
  it('renders three order-type labels', () => {
    render(
      <UnifiedPricePanel baseCents={65000} config={BASE_CONFIG} currencySymbol="৳" />,
    )
    expect(screen.getByText('Dine In')).toBeTruthy()
    expect(screen.getByText('Takeaway')).toBeTruthy()
    expect(screen.getByText('Delivery')).toBeTruthy()
  })

  it('shows correct dine-in price (base ৳650 + SC 10% + VAT 5%)', () => {
    // 65000 + 10% SC (6500) = 71500, + 5% VAT (3575) = 75075 → rounds to ৳751
    render(
      <UnifiedPricePanel baseCents={65000} config={BASE_CONFIG} currencySymbol="৳" />,
    )
    expect(screen.getByText('৳ 751')).toBeTruthy()
  })

  it('shows correct takeaway price (base ৳650 + VAT 5% only)', () => {
    // 65000 + 5% VAT (3250) = 68250 → ৳683
    render(
      <UnifiedPricePanel baseCents={65000} config={BASE_CONFIG} currencySymbol="৳" />,
    )
    expect(screen.getByText('৳ 683')).toBeTruthy()
  })

  it('shows delivery price including zone fee in cents (৳650 base + 99 BDT zone = ৳749)', () => {
    // base=65000 (no SC, no VAT) + zone=9900 cents = 74900 → ৳749
    render(
      <UnifiedPricePanel baseCents={65000} config={BASE_CONFIG} currencySymbol="৳" />,
    )
    expect(screen.getByText('৳ 749')).toBeTruthy()
  })

  it('shows range with both min and max when multiple delivery zones', () => {
    const config: UnifiedPricingConfig = {
      ...BASE_CONFIG,
      deliveryZones: [
        { id: 'z1', name: 'Zone A', charge_amount: 9900 },  // 99 BDT → ৳749 total
        { id: 'z2', name: 'Zone B', charge_amount: 19900 }, // 199 BDT → ৳849 total
      ],
    }
    render(
      <UnifiedPricePanel baseCents={65000} config={config} currencySymbol="৳" />,
    )
    const panel = screen.getByLabelText('Price breakdown by order type')
    // Should show both boundary values with a dash
    expect(panel.textContent).toContain('৳ 749')
    expect(panel.textContent).toContain('৳ 849')
    expect(panel.textContent).toContain('–')
  })
})
