export interface OrderItem {
  id: string
  name: string
  quantity: number
  price_cents: number
}

interface OrderItemRow {
  id: string
  quantity: number
  unit_price_cents: number
  menu_items: { name: string }
}

export async function fetchOrderItems(
  supabaseUrl: string,
  apiKey: string,
  orderId: string,
): Promise<OrderItem[]> {
  const url = new URL(`${supabaseUrl}/rest/v1/order_items`)
  url.searchParams.set('select', 'id,quantity,unit_price_cents,menu_items(name)')
  url.searchParams.set('order_id', `eq.${orderId}`)
  url.searchParams.set('voided', 'eq.false')

  const res = await fetch(url.toString(), {
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`,
    },
  })

  if (!res.ok) {
    throw new Error(`Failed to fetch order items: ${res.statusText}`)
  }

  const rows = (await res.json()) as OrderItemRow[]
  return rows.map((row) => ({
    id: row.id,
    name: row.menu_items.name,
    quantity: row.quantity,
    price_cents: row.unit_price_cents,
  }))
}
