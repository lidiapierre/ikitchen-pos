'use client'

/**
 * UnifiedPricePanel — issue #359
 *
 * Displays the final price for a menu item across all three service types
 * (Dine-in, Takeaway, Delivery) in a single compact panel so staff can give
 * instant price confirmations without tab-switching.
 */

import { useMemo } from 'react'
import type { JSX } from 'react'
import { formatPrice } from '@/lib/formatPrice'
import type { UnifiedPricingConfig } from '@/lib/unifiedPricing'
import { computeUnifiedPrices } from '@/lib/unifiedPricing'

interface UnifiedPricePanelProps {
  baseCents: number
  config: UnifiedPricingConfig
  currencySymbol: string
}

export default function UnifiedPricePanel({
  baseCents,
  config,
  currencySymbol,
}: UnifiedPricePanelProps): JSX.Element {
  // Memoised so recomputation only happens when baseCents or config reference changes,
  // not on every unrelated parent re-render (menu page has many cards).
  const prices = useMemo(
    () => computeUnifiedPrices(baseCents, config),
    [baseCents, config],
  )

  const deliveryLabel = (): string => {
    if (config.deliveryZones.length === 0) {
      // No zones configured — just show base + applicable charges
      return formatPrice(prices.deliveryMinCents, currencySymbol, true)
    }
    const min = formatPrice(prices.deliveryMinCents, currencySymbol, true)
    if (!prices.deliveryHasRange) return min
    const max = formatPrice(prices.deliveryMaxCents, currencySymbol, true)
    return `${min}–${max}`
  }

  return (
    <div
      className="grid grid-cols-3 gap-1 mt-1 rounded-xl bg-brand-offwhite border border-brand-grey/40 px-2 py-1.5"
      aria-label="Price breakdown by order type"
    >
      <PriceCell label="Dine In" value={formatPrice(prices.dineInCents, currencySymbol, true)} />
      <PriceCell label="Takeaway" value={formatPrice(prices.takeawayCents, currencySymbol, true)} />
      <PriceCell
        label="Delivery"
        value={deliveryLabel()}
        muted={config.deliveryZones.length === 0}
      />
    </div>
  )
}

function PriceCell({
  label,
  value,
  muted = false,
}: {
  label: string
  value: string
  muted?: boolean
}): JSX.Element {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-[10px] font-medium text-brand-navy/50 uppercase tracking-wide leading-none">
        {label}
      </span>
      <span
        className={[
          'text-xs font-bold tabular-nums leading-none',
          muted ? 'text-brand-navy/40' : 'text-brand-navy',
        ].join(' ')}
      >
        {value}
      </span>
    </div>
  )
}
