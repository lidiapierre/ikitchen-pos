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
 */

const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ''

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DeliveryZone {
  id: string
  name: string
  charge_amount: number // in BDT whole units (not cents)
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
   * Final price for delivery in cents.
   * This is base + fees for the cheapest zone (or 0 if no zones configured).
   * `deliveryFromMinCents` and `deliveryFromMaxCents` hold the range.
   */
  deliveryMinCents: number
  deliveryMaxCents: number
  /** Whether there are multiple delivery zones (show "from" prefix) */
  deliveryHasRange: boolean
}

// ─── Fetch ────────────────────────────────────────────────────────────────────

/**
 * Fetch the full pricing config for a restaurant in one pass.
 * Returns safe defaults if any fetch fails — the panel will still display.
 */
export async function fetchUnifiedPricingConfig(
  supabaseUrl: string,
  accessToken: string,
  restaurantId: string,
): Promise<UnifiedPricingConfig> {
  const headers = {
    apikey: publishableKey,
    Authorization: `Bearer ${accessToken}`,
  }

  // Fetch all config keys in a single request
  const configKeys = [
    'tax_inclusive',
    'service_charge_percent',
    'service_charge_apply_dine_in',
    'service_charge_apply_takeaway',
    'service_charge_apply_delivery',
    'vat_apply_dine_in',
    'vat_apply_takeaway',
    'vat_apply_delivery',
  ]

  const configMap = new Map<string, string>()
  try {
    const configUrl = new URL(`${supabaseUrl}/rest/v1/config`)
    configUrl.searchParams.set('restaurant_id', `eq.${restaurantId}`)
    configUrl.searchParams.set('key', `in.(${configKeys.join(',')})`)
    configUrl.searchParams.set('select', 'key,value')

    const res = await fetch(configUrl.toString(), { headers })
    if (res.ok) {
      const rows = (await res.json()) as Array<{ key: string; value: string }>
      for (const row of rows) configMap.set(row.key, row.value)
    }
  } catch {
    // Non-fatal — fall back to defaults below
  }

  // Fetch VAT rates (use first applicable rate for the restaurant)
  let vatPercent = 0
  try {
    const vatUrl = new URL(`${supabaseUrl}/rest/v1/vat_rates`)
    vatUrl.searchParams.set('restaurant_id', `eq.${restaurantId}`)
    vatUrl.searchParams.set('select', 'percentage,menu_id')

    const vatRes = await fetch(vatUrl.toString(), { headers })
    if (vatRes.ok) {
      const rates = (await vatRes.json()) as Array<{
        percentage: string | number
        menu_id: string | null
      }>
      // Default rate = null menu_id; fall back to first rate if no default
      const defaultRate =
        rates.find((r) => r.menu_id === null) ?? rates[0]
      if (defaultRate) vatPercent = Number(defaultRate.percentage)
    }
  } catch {
    // Non-fatal
  }

  // Fetch delivery zones
  let deliveryZones: DeliveryZone[] = []
  try {
    const zonesUrl = new URL(`${supabaseUrl}/rest/v1/delivery_zones`)
    zonesUrl.searchParams.set('restaurant_id', `eq.${restaurantId}`)
    zonesUrl.searchParams.set('select', 'id,name,charge_amount')
    zonesUrl.searchParams.set('order', 'charge_amount.asc')

    const zonesRes = await fetch(zonesUrl.toString(), { headers })
    if (zonesRes.ok) {
      deliveryZones = (await zonesRes.json()) as DeliveryZone[]
    }
  } catch {
    // Non-fatal
  }

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

  // Delivery: base charges + delivery zone fee (zone charge is in whole BDT, convert to cents)
  const baseDeliveryCents = applyCharges(
    baseCents,
    config.scApplyDelivery,
    config.vatApplyDelivery,
  )

  let deliveryMinCents = baseDeliveryCents
  let deliveryMaxCents = baseDeliveryCents
  let deliveryHasRange = false

  if (config.deliveryZones.length > 0) {
    // Zones are sorted asc by charge_amount
    const minFee = config.deliveryZones[0].charge_amount * 100
    const maxFee =
      config.deliveryZones[config.deliveryZones.length - 1].charge_amount * 100
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
