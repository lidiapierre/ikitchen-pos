export interface OrderItem {
  id: string
  name: string
  quantity: number
  price_cents: number
  modifier_ids: string[]
  modifier_names: string[]
  sent_to_kitchen: boolean
}

export interface OrderSummary {
  status: string
  payment_method: string | null
}

interface OrderItemRow {
  id: string
  quantity: number
  unit_price_cents: number
  modifier_ids: string[]
  sent_to_kitchen: boolean
  menu_items: { name: string }
}

interface ModifierRow {
  id: string
  name: string
}

export async function fetchOrderItems(
  supabaseUrl: string,
  apiKey: string,
  orderId: string,
): Promise<OrderItem[]> {
  const url = new URL(`${supabaseUrl}/rest/v1/order_items`)
  url.searchParams.set('select', 'id,quantity,unit_price_cents,modifier_ids,sent_to_kitchen,menu_items(name)')
  url.searchParams.set('order_id', `eq.${orderId}`)
  url.searchParams.set('voided', 'eq.false')

  const res = await fetch(url.toString(), {
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`,
    },
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Failed to fetch order items: ${res.status} ${res.statusText} — ${body}`)
  }

  const rows = (await res.json()) as OrderItemRow[]

  // Collect all unique modifier IDs across all items
  const allModifierIds = [...new Set(rows.flatMap((row) => row.modifier_ids ?? []))]

  // Fetch modifier names if any items have modifiers
  const modifierNameMap = new Map<string, string>()
  if (allModifierIds.length > 0) {
    try {
      const modUrl = new URL(`${supabaseUrl}/rest/v1/modifiers`)
      modUrl.searchParams.set('select', 'id,name')
      modUrl.searchParams.set('id', `in.(${allModifierIds.join(',')})`)

      const modRes = await fetch(modUrl.toString(), {
        headers: {
          apikey: apiKey,
          Authorization: `Bearer ${apiKey}`,
        },
      })

      if (modRes.ok) {
        const mods = (await modRes.json()) as ModifierRow[]
        for (const mod of mods) {
          modifierNameMap.set(mod.id, mod.name)
        }
      }
    } catch {
      // Non-fatal: modifier names may not display but items will still show
    }
  }

  return rows.map((row) => {
    const ids = row.modifier_ids ?? []
    return {
      id: row.id,
      name: row.menu_items.name,
      quantity: row.quantity,
      price_cents: row.unit_price_cents,
      modifier_ids: ids,
      modifier_names: ids.map((id) => modifierNameMap.get(id) ?? id),
      sent_to_kitchen: row.sent_to_kitchen,
    }
  })
}

export async function fetchOrderSummary(
  supabaseUrl: string,
  apiKey: string,
  orderId: string,
): Promise<OrderSummary> {
  const headers = {
    apikey: apiKey,
    Authorization: `Bearer ${apiKey}`,
  }

  const orderUrl = new URL(`${supabaseUrl}/rest/v1/orders`)
  orderUrl.searchParams.set('id', `eq.${orderId}`)
  orderUrl.searchParams.set('select', 'status')

  const orderRes = await fetch(orderUrl.toString(), { headers })
  if (!orderRes.ok) {
    const body = await orderRes.text()
    throw new Error(`Failed to fetch order: ${orderRes.status} ${orderRes.statusText} — ${body}`)
  }

  const orders = (await orderRes.json()) as Array<{ status: string }>
  if (orders.length === 0) {
    throw new Error('Order not found')
  }

  const { status } = orders[0]
  if (status !== 'paid') {
    return { status, payment_method: null }
  }

  const paymentUrl = new URL(`${supabaseUrl}/rest/v1/payments`)
  paymentUrl.searchParams.set('order_id', `eq.${orderId}`)
  paymentUrl.searchParams.set('select', 'method')
  paymentUrl.searchParams.set('limit', '1')

  const paymentRes = await fetch(paymentUrl.toString(), { headers })
  if (!paymentRes.ok) {
    return { status, payment_method: null }
  }

  const payments = (await paymentRes.json()) as Array<{ method: string }>
  return {
    status,
    payment_method: payments.length > 0 ? payments[0].method : null,
  }
}
