/**
 * Tests for UnifiedPricePanel (issue #359).
 */

import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
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
    { id: 'z1', name: 'Zone A', charge_amount: 99 },
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

  it('shows correct dine-in price (base + SC + VAT)', () => {
    // 65000 + 10% SC (6500) = 71500, + 5% VAT (3575) = 75075 → ৳ 751
    render(
      <UnifiedPricePanel baseCents={65000} config={BASE_CONFIG} currencySymbol="৳" />,
    )
    // formatPrice rounds to whole: 75075 cents → 751 BDT
    expect(screen.getByText('৳ 751')).toBeTruthy()
  })

  it('shows correct takeaway price (base + VAT only)', () => {
    // 65000 + 5% VAT (3250) = 68250 → ৳ 683
    render(
      <UnifiedPricePanel baseCents={65000} config={BASE_CONFIG} currencySymbol="৳" />,
    )
    expect(screen.getByText('৳ 683')).toBeTruthy()
  })

  it('shows delivery price with zone fee', () => {
    // 65000 base (no SC, no VAT) + 99 BDT zone = ৳ 749
    render(
      <UnifiedPricePanel baseCents={65000} config={BASE_CONFIG} currencySymbol="৳" />,
    )
    expect(screen.getByText('৳ 749')).toBeTruthy()
  })

  it('shows range when multiple delivery zones', () => {
    const config: UnifiedPricingConfig = {
      ...BASE_CONFIG,
      deliveryZones: [
        { id: 'z1', name: 'Zone A', charge_amount: 99 },
        { id: 'z2', name: 'Zone B', charge_amount: 199 },
      ],
    }
    render(
      <UnifiedPricePanel baseCents={65000} config={config} currencySymbol="৳" />,
    )
    // Should contain a dash between min and max
    const panel = screen.getByLabelText('Price breakdown by order type')
    expect(panel.textContent).toContain('–')
  })
})
