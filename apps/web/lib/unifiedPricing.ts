/**
 * Unified item price view — issue #359.
 *
 * Fetches all pricing config (VAT, service charge, delivery zones) for a restaurant
 * and computes the final price of a single item for each order type so staff can
 * compare dine-in / takeaway / delivery prices at a glance.
 *
 * Pricing rules (per PR #382):
 *   Dine-in  : base + service_charge (if apply_dine_in) + VAT (if apply_dine_in)
 *   Takeaway : base + service_charge (if apply_takeaway) + VAT (if apply_takeaway)
 *   Delivery : base + service_charge (if apply_delivery) + VAT (if apply_delivery) + delivery_fee
 *
 * Operations are all in integer cents to avoid floating-point drift.
 *
 * Known limitation: VAT rate lookup uses the restaurant-level default rate (menu_id IS NULL).
 * Per-category overrides (menu_id specific rates) are not applied to the unified panel.
 * This is an acceptable approximation for the staff price-lookup use case.
 */

import { supabase } from '@/lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DeliveryZone {
  id: string
  name: string
  /** Delivery zone fee in cents — matches the `charge_amount` column in `delivery_zones` table. */
  charge_amount: number
}

export interface UnifiedPricingConfig {
  vatPercent: number
  taxInclusive: boolean
  serviceChargePercent: number
  scApplyDineIn: boolean
  scApplyTakeaway: boolean
  scApplyDelivery: boolean
  vatApplyDineIn: boolean
  vatApplyTakeaway: boolean
  vatApplyDelivery: boolean
  deliveryZones: DeliveryZone[]
}

export interface UnifiedPrices {
  /** Final price for dine-in in cents */
  dineInCents: number
  /** Final price for takeaway in cents */
  takeawayCents: number
  /**
   * Final delivery price in cents for the cheapest zone.
   * `deliveryMaxCents` holds the most expensive zone's price.
   * `deliveryHasRange` is true when min != max (multiple zones with different fees).
   */
  deliveryMinCents: number
  deliveryMaxCents: number
  /** Whether there are multiple delivery zones with different fees (show "from" prefix) */
  deliveryHasRange: boolean
}

// ─── Fetch ────────────────────────────────────────────────────────────────────

const CONFIG_KEYS = [
  'tax_inclusive',
  'service_charge_percent',
  'service_charge_apply_dine_in',
  'service_charge_apply_takeaway',
  'service_charge_apply_delivery',
  'vat_apply_dine_in',
  'vat_apply_takeaway',
  'vat_apply_delivery',
] as const

/**
 * Fetch the full pricing config for a restaurant in three parallel requests.
 * Returns safe defaults if any fetch fails — the panel will still display.
 */
export async function fetchUnifiedPricingConfig(
  restaurantId: string,
): Promise<UnifiedPricingConfig> {
  // All three DB reads run in parallel to minimise latency on the tablet.
  const [configResult, vatResult, zonesResult] = await Promise.all([
    supabase
      .from('config')
      .select('key, value')
      .eq('restaurant_id', restaurantId)
      .in('key', CONFIG_KEYS),
    supabase
      .from('vat_rates')
      .select('percentage, menu_id')
      .eq('restaurant_id', restaurantId),
    supabase
      .from('delivery_zones')
      .select('id, name, charge_amount')
      .eq('restaurant_id', restaurantId)
      .order('charge_amount', { ascending: true }),
  ])

  // Build a config key→value map (ignore errors — fall back to defaults)
  const configMap = new Map<string, string>()
  for (const row of configResult.data ?? []) {
    configMap.set(
      (row as { key: string; value: string }).key,
      (row as { key: string; value: string }).value,
    )
  }

  // Resolve VAT percent: default rate (menu_id IS NULL) first, fallback to first rate.
  let vatPercent = 0
  const vatRates = (vatResult.data ?? []) as Array<{
    percentage: string | number
    menu_id: string | null
  }>
  if (vatRates.length > 0) {
    const defaultRate = vatRates.find((r) => r.menu_id === null) ?? vatRates[0]
    vatPercent = Number(defaultRate.percentage)
  }

  const deliveryZones: DeliveryZone[] = (zonesResult.data ?? []) as DeliveryZone[]

  function boolVal(key: string, def: boolean): boolean {
    if (!configMap.has(key)) return def
    return configMap.get(key) === 'true'
  }

  const scPercentRaw = parseFloat(configMap.get('service_charge_percent') ?? '0')
  const serviceChargePercent =
    isNaN(scPercentRaw) || scPercentRaw < 0 ? 0 : scPercentRaw

  return {
    vatPercent,
    taxInclusive: boolVal('tax_inclusive', false),
    serviceChargePercent,
    scApplyDineIn: boolVal('service_charge_apply_dine_in', true),
    scApplyTakeaway: boolVal('service_charge_apply_takeaway', false),
    scApplyDelivery: boolVal('service_charge_apply_delivery', false),
    vatApplyDineIn: boolVal('vat_apply_dine_in', true),
    vatApplyTakeaway: boolVal('vat_apply_takeaway', true),
    vatApplyDelivery: boolVal('vat_apply_delivery', false),
    deliveryZones,
  }
}

// ─── Compute ──────────────────────────────────────────────────────────────────

/**
 * Compute the final price of a single item (in cents) for each order type.
 *
 * NOTE: delivery_fee is an order-level charge added to the item price here as a
 * reference ("what does this item effectively cost in a delivery order?").
 * Staff see it as an indicative price including the zone fee.
 *
 * `charge_amount` in `delivery_zones` is stored in cents — consistent with all
 * other monetary values in this codebase.
 */
export function computeUnifiedPrices(
  baseCents: number,
  config: UnifiedPricingConfig,
): UnifiedPrices {
  function applyCharges(
    base: number,
    applyServiceCharge: boolean,
    applyVat: boolean,
  ): number {
    let total = base
    if (applyServiceCharge && config.serviceChargePercent > 0) {
      total += Math.round((base * config.serviceChargePercent) / 100)
    }
    if (applyVat && config.vatPercent > 0) {
      if (config.taxInclusive) {
        // price already includes VAT — no change
      } else {
        total += Math.round((total * config.vatPercent) / 100)
      }
    }
    return total
  }

  const dineInCents = applyCharges(
    baseCents,
    config.scApplyDineIn,
    config.vatApplyDineIn,
  )
  const takeawayCents = applyCharges(
    baseCents,
    config.scApplyTakeaway,
    config.vatApplyTakeaway,
  )

  // Delivery: base charges + delivery zone fee (charge_amount is in cents)
  const baseDeliveryCents = applyCharges(
    baseCents,
    config.scApplyDelivery,
    config.vatApplyDelivery,
  )

  let deliveryMinCents = baseDeliveryCents
  let deliveryMaxCents = baseDeliveryCents
  let deliveryHasRange = false

  if (config.deliveryZones.length > 0) {
    // Zones are sorted asc by charge_amount; charge_amount is in cents
    const minFee = config.deliveryZones[0].charge_amount
    const maxFee = config.deliveryZones[config.deliveryZones.length - 1].charge_amount
    deliveryMinCents = baseDeliveryCents + minFee
    deliveryMaxCents = baseDeliveryCents + maxFee
    deliveryHasRange = minFee !== maxFee
  }

  return {
    dineInCents,
    takeawayCents,
    deliveryMinCents,
    deliveryMaxCents,
    deliveryHasRange,
  }
}
