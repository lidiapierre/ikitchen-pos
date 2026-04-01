/**
 * kdsApi.ts — Kitchen Display Screen data fetching & mutations.
 * All calls use the anon/publishable key; no user JWT required.
 */

const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ''

export interface KdsOrderItem {
  id: string
  name: string
  quantity: number
  modifier_names: string[]
}

export interface KdsOrder {
  id: string
  tableLabel: string
  firedAt: string   // ISO timestamp — when order was created (proxy for kitchen fire time)
  items: KdsOrderItem[]
}

export interface KdsSettings {
  pinEnabled: boolean
  pin: string | null
  refreshIntervalSeconds: number
}

// ── Fetch open KDS orders ──────────────────────────────────────────────────

interface OrderRow {
  id: string
  created_at: string
  tables: { label: string } | null
}

interface OrderItemRow {
  id: string
  order_id: string
  quantity: number
  sent_to_kitchen: boolean
  voided: boolean
  menu_items: { name: string } | null
  modifier_ids: string[]
}

interface ModifierRow {
  id: string
  name: string
}

export async function fetchKdsOrders(
  supabaseUrl: string,
  accessToken: string,
): Promise<KdsOrder[]> {
  const headers = { apikey: publishableKey, Authorization: `Bearer ${accessToken}` }

  // Fetch open orders that have NOT been marked done by the kitchen
  const ordersUrl = new URL(`${supabaseUrl}/rest/v1/orders`)
  ordersUrl.searchParams.set(
    'select',
    'id,created_at,tables(label)',
  )
  ordersUrl.searchParams.set('status', 'in.(open,pending_payment)')
  ordersUrl.searchParams.set('kitchen_done_at', 'is.null')

  const ordersRes = await fetch(ordersUrl.toString(), { headers })
  if (!ordersRes.ok) {
    throw new Error(`Failed to fetch orders: ${ordersRes.status}`)
  }
  const orders = (await ordersRes.json()) as OrderRow[]

  if (orders.length === 0) return []

  const orderIds = orders.map((o) => o.id)

  // Fetch all order items for those orders where sent_to_kitchen = true
  const itemsUrl = new URL(`${supabaseUrl}/rest/v1/order_items`)
  itemsUrl.searchParams.set(
    'select',
    'id,order_id,quantity,sent_to_kitchen,voided,modifier_ids,menu_items(name)',
  )
  itemsUrl.searchParams.set('order_id', `in.(${orderIds.join(',')})`)
  itemsUrl.searchParams.set('sent_to_kitchen', 'eq.true')
  itemsUrl.searchParams.set('voided', 'eq.false')

  const itemsRes = await fetch(itemsUrl.toString(), { headers })
  if (!itemsRes.ok) {
    throw new Error(`Failed to fetch order items: ${itemsRes.status}`)
  }
  const allItems = (await itemsRes.json()) as OrderItemRow[]

  // Collect all modifier IDs
  const allModifierIds = [...new Set(allItems.flatMap((i) => i.modifier_ids ?? []))]
  const modifierNameMap = new Map<string, string>()

  if (allModifierIds.length > 0) {
    try {
      const modUrl = new URL(`${supabaseUrl}/rest/v1/modifiers`)
      modUrl.searchParams.set('select', 'id,name')
      modUrl.searchParams.set('id', `in.(${allModifierIds.join(',')})`)
      const modRes = await fetch(modUrl.toString(), { headers })
      if (modRes.ok) {
        const mods = (await modRes.json()) as ModifierRow[]
        for (const m of mods) modifierNameMap.set(m.id, m.name)
      }
    } catch {
      // non-fatal — item names still show without modifier labels
    }
  }

  // Group items by order, skip orders that have no kitchen items
  const itemsByOrder = new Map<string, KdsOrderItem[]>()
  for (const item of allItems) {
    if (!itemsByOrder.has(item.order_id)) itemsByOrder.set(item.order_id, [])
    const ids = item.modifier_ids ?? []
    itemsByOrder.get(item.order_id)!.push({
      id: item.id,
      name: item.menu_items?.name ?? '—',
      quantity: item.quantity,
      modifier_names: ids.map((id) => modifierNameMap.get(id) ?? id),
    })
  }

  const result: KdsOrder[] = []

  for (const order of orders) {
    const items = itemsByOrder.get(order.id)
    if (!items || items.length === 0) continue   // nothing fired yet — skip

    const tableLabel =
      (order.tables as { label: string } | null)?.label ?? '—'

    result.push({
      id: order.id,
      tableLabel,
      firedAt: order.created_at,
      items,
    })
  }

  // Sort oldest-first (most urgent at top-left)
  result.sort((a, b) => new Date(a.firedAt).getTime() - new Date(b.firedAt).getTime())

  return result
}

// ── Mark order as kitchen-done ─────────────────────────────────────────────

export async function markOrderKitchenDone(
  supabaseUrl: string,
  accessToken: string,
  orderId: string,
): Promise<void> {
  const res = await fetch(`${supabaseUrl}/functions/v1/mark-order-kitchen-done`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      apikey: publishableKey,
    },
    body: JSON.stringify({ order_id: orderId }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Failed to mark order done: ${res.status} — ${body}`)
  }
}

// ── Fetch KDS settings ─────────────────────────────────────────────────────

interface KdsSettingsRow {
  pin_enabled: boolean
  pin: string | null
  refresh_interval_seconds: number
}

export async function fetchKdsSettings(
  supabaseUrl: string,
  accessToken: string,
): Promise<KdsSettings> {
  const url = new URL(`${supabaseUrl}/rest/v1/kds_settings`)
  url.searchParams.set('select', 'pin_enabled,pin,refresh_interval_seconds')
  url.searchParams.set('limit', '1')

  const res = await fetch(url.toString(), {
    headers: { apikey: publishableKey, Authorization: `Bearer ${accessToken}` },
  })

  if (!res.ok) {
    // Table may not exist yet — return defaults
    return { pinEnabled: false, pin: null, refreshIntervalSeconds: 15 }
  }

  const rows = (await res.json()) as KdsSettingsRow[]
  if (rows.length === 0) {
    return { pinEnabled: false, pin: null, refreshIntervalSeconds: 15 }
  }

  return {
    pinEnabled: rows[0].pin_enabled,
    pin: rows[0].pin,
    refreshIntervalSeconds: rows[0].refresh_interval_seconds,
  }
}
