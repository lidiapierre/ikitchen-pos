/**
 * Fetch VAT configuration from Supabase for a given restaurant.
 *
 * Looks up:
 * - config.tax_inclusive (key/value table)
 * - vat_rates (menu-specific first, then restaurant default)
 */

export interface VatConfig {
  /** VAT rate in percent (e.g. 15 for 15%). 0 means no VAT. */
  vatPercent: number
  /** Whether item prices already include VAT */
  taxInclusive: boolean
}

/**
 * Fetch the VAT config for a restaurant.
 * Menu-specific rate takes precedence over restaurant-level default.
 * All errors are swallowed (returns 0% exclusive as safe fallback).
 */
export async function fetchVatConfig(
  supabaseUrl: string,
  apiKey: string,
  restaurantId: string,
  menuId?: string | null,
): Promise<VatConfig> {
  const headers = {
    apikey: apiKey,
    Authorization: `Bearer ${apiKey}`,
  }

  // ── 1. Fetch tax_inclusive from config table ──────────────────────────────
  let taxInclusive = false
  try {
    const configUrl = new URL(`${supabaseUrl}/rest/v1/config`)
    configUrl.searchParams.set('restaurant_id', `eq.${restaurantId}`)
    configUrl.searchParams.set('key', 'eq.tax_inclusive')
    configUrl.searchParams.set('select', 'value')
    configUrl.searchParams.set('limit', '1')

    const configRes = await fetch(configUrl.toString(), { headers })
    if (configRes.ok) {
      const rows = (await configRes.json()) as Array<{ value: string }>
      if (rows.length > 0) {
        taxInclusive = rows[0].value === 'true'
      }
    }
  } catch {
    // Non-fatal: default to exclusive
  }

  // ── 2. Fetch VAT rates for this restaurant ────────────────────────────────
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

      if (rates.length > 0) {
        // Prefer menu-specific rate if we have a menuId
        if (menuId) {
          const menuRate = rates.find((r) => r.menu_id === menuId)
          if (menuRate) {
            return { vatPercent: Number(menuRate.percentage), taxInclusive }
          }
        }

        // Fall back to restaurant-level default (menu_id IS NULL)
        const defaultRate = rates.find((r) => r.menu_id === null)
        vatPercent = defaultRate
          ? Number(defaultRate.percentage)
          : Number(rates[0].percentage)
      }
    }
  } catch {
    // Non-fatal: return 0% VAT so payment can proceed
  }

  return { vatPercent, taxInclusive }
}

/**
 * Fetch the restaurant_id and (optionally) the menu_id of the first item
 * in the order — used to look up per-menu VAT rates.
 */
export async function fetchOrderVatContext(
  supabaseUrl: string,
  apiKey: string,
  orderId: string,
): Promise<{ restaurantId: string; menuId: string | null }> {
  const headers = {
    apikey: apiKey,
    Authorization: `Bearer ${apiKey}`,
  }

  // Fetch restaurant_id from orders
  const orderUrl = new URL(`${supabaseUrl}/rest/v1/orders`)
  orderUrl.searchParams.set('id', `eq.${orderId}`)
  orderUrl.searchParams.set('select', 'restaurant_id')
  orderUrl.searchParams.set('limit', '1')

  const orderRes = await fetch(orderUrl.toString(), { headers })
  if (!orderRes.ok) {
    throw new Error(`Failed to fetch order: ${orderRes.status} ${orderRes.statusText}`)
  }
  const orders = (await orderRes.json()) as Array<{ restaurant_id: string }>
  if (orders.length === 0) throw new Error('Order not found')

  const restaurantId = orders[0].restaurant_id

  // Fetch menu_id from first order item (via menu_items relation)
  let menuId: string | null = null
  try {
    const itemUrl = new URL(`${supabaseUrl}/rest/v1/order_items`)
    itemUrl.searchParams.set('order_id', `eq.${orderId}`)
    itemUrl.searchParams.set('select', 'menu_items(menu_id)')
    itemUrl.searchParams.set('limit', '1')

    const itemRes = await fetch(itemUrl.toString(), { headers })
    if (itemRes.ok) {
      const rows = (await itemRes.json()) as Array<{
        menu_items: { menu_id: string } | null
      }>
      if (rows.length > 0 && rows[0].menu_items) {
        menuId = rows[0].menu_items.menu_id
      }
    }
  } catch {
    // Non-fatal
  }

  return { restaurantId, menuId }
}
