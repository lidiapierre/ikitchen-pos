export interface OrderItem {
  id: string
  name: string
  quantity: number
  price_cents: number
}

export interface OrderSummary {
  status: string
  payment_method: string | null
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
    const body = await res.text()
    throw new Error(`Failed to fetch order items: ${res.status} ${res.statusText} — ${body}`)
  }

  const rows = (await res.json()) as OrderItemRow[]
  return rows.map((row) => ({
    id: row.id,
    name: row.menu_items.name,
    quantity: row.quantity,
    price_cents: row.unit_price_cents,
  }))
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
