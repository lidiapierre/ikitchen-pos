export interface TableRow {
  id: string
  label: string
  open_order_id: string | null
  order_status: string | null
  order_created_at: string | null
  /** Count of non-voided items on the active order; null when no active order. */
  order_item_count: number | null
  /** Floor plan grid position (null = unplaced) */
  grid_x: number | null
  grid_y: number | null
}

export interface TakeawayDeliveryOrder {
  id: string
  order_type: 'takeaway' | 'delivery'
  customer_name: string | null
  delivery_note: string | null
  status: string
  created_at: string
  item_count: number
}

interface TableApiRow {
  id: string
  label: string
  grid_x: number | null
  grid_y: number | null
}

interface OrderApiRow {
  id: string
  table_id: string | null
  status: string
  created_at: string
}

interface TakeawayDeliveryApiRow {
  id: string
  order_type: string
  customer_name: string | null
  delivery_note: string | null
  status: string
  created_at: string
}

export async function fetchTables(
  supabaseUrl: string,
  apiKey: string,
): Promise<TableRow[]> {
  const headers = {
    apikey: apiKey,
    Authorization: `Bearer ${apiKey}`,
  }

  const tablesUrl = new URL(`${supabaseUrl}/rest/v1/tables`)
  tablesUrl.searchParams.set('select', 'id,label,grid_x,grid_y')

  const tablesRes = await fetch(tablesUrl.toString(), { headers })

  if (!tablesRes.ok) {
    const body = await tablesRes.text()
    throw new Error(`Failed to fetch tables: ${tablesRes.status} ${tablesRes.statusText} — ${body}`)
  }

  const ordersUrl = new URL(`${supabaseUrl}/rest/v1/orders`)
  ordersUrl.searchParams.set('select', 'id,table_id,status,created_at')
  ordersUrl.searchParams.set('status', 'in.(open,pending_payment)')
  ordersUrl.searchParams.set('order_type', 'eq.dine_in')

  const ordersRes = await fetch(ordersUrl.toString(), { headers })

  if (!ordersRes.ok) {
    const body = await ordersRes.text()
    throw new Error(`Failed to fetch orders: ${ordersRes.status} ${ordersRes.statusText} — ${body}`)
  }

  const tables = (await tablesRes.json()) as TableApiRow[]
  const orders = (await ordersRes.json()) as OrderApiRow[]

  const openOrderByTable = new Map<string, OrderApiRow>()
  for (const order of orders) {
    if (order.table_id !== null) {
      openOrderByTable.set(order.table_id, order)
    }
  }

  // Fetch non-voided item counts for all active orders (to distinguish seated vs ordered)
  const itemCountByOrder = new Map<string, number>()
  const orderIds = orders.map((o) => o.id)
  if (orderIds.length > 0) {
    const itemsUrl = new URL(`${supabaseUrl}/rest/v1/order_items`)
    itemsUrl.searchParams.set('select', 'order_id')
    itemsUrl.searchParams.set('voided', 'eq.false')
    itemsUrl.searchParams.set('order_id', `in.(${orderIds.join(',')})`)

    const itemsRes = await fetch(itemsUrl.toString(), { headers })
    if (!itemsRes.ok) {
      const body = await itemsRes.text()
      throw new Error(`Failed to fetch order items: ${itemsRes.status} ${itemsRes.statusText} — ${body}`)
    }

    const items = (await itemsRes.json()) as Array<{ order_id: string }>
    for (const item of items) {
      itemCountByOrder.set(item.order_id, (itemCountByOrder.get(item.order_id) ?? 0) + 1)
    }
  }

  return tables.map((table) => {
    const order = openOrderByTable.get(table.id)
    return {
      id: table.id,
      label: table.label,
      open_order_id: order?.id ?? null,
      order_status: order?.status ?? null,
      order_created_at: order?.created_at ?? null,
      order_item_count: order !== undefined ? (itemCountByOrder.get(order.id) ?? 0) : null,
      grid_x: table.grid_x ?? null,
      grid_y: table.grid_y ?? null,
    }
  })
}

/**
 * Fetch active takeaway and delivery orders for the queue section on the tables page.
 */
export async function fetchTakeawayDeliveryQueue(
  supabaseUrl: string,
  apiKey: string,
): Promise<TakeawayDeliveryOrder[]> {
  const headers = {
    apikey: apiKey,
    Authorization: `Bearer ${apiKey}`,
  }

  const ordersUrl = new URL(`${supabaseUrl}/rest/v1/orders`)
  ordersUrl.searchParams.set('select', 'id,order_type,customer_name,delivery_note,status,created_at')
  ordersUrl.searchParams.set('status', 'in.(open,pending_payment)')
  ordersUrl.searchParams.set('order_type', 'in.(takeaway,delivery)')
  ordersUrl.searchParams.set('order', 'created_at.asc')

  const ordersRes = await fetch(ordersUrl.toString(), { headers })
  if (!ordersRes.ok) {
    const body = await ordersRes.text()
    throw new Error(`Failed to fetch takeaway/delivery orders: ${ordersRes.status} — ${body}`)
  }

  const orders = (await ordersRes.json()) as TakeawayDeliveryApiRow[]

  if (orders.length === 0) return []

  // Fetch item counts for these orders
  const orderIds = orders.map((o) => o.id)
  const itemCountByOrder = new Map<string, number>()

  const itemsUrl = new URL(`${supabaseUrl}/rest/v1/order_items`)
  itemsUrl.searchParams.set('select', 'order_id')
  itemsUrl.searchParams.set('voided', 'eq.false')
  itemsUrl.searchParams.set('order_id', `in.(${orderIds.join(',')})`)

  const itemsRes = await fetch(itemsUrl.toString(), { headers })
  if (itemsRes.ok) {
    const items = (await itemsRes.json()) as Array<{ order_id: string }>
    for (const item of items) {
      itemCountByOrder.set(item.order_id, (itemCountByOrder.get(item.order_id) ?? 0) + 1)
    }
  }

  return orders.map((o) => ({
    id: o.id,
    order_type: o.order_type as 'takeaway' | 'delivery',
    customer_name: o.customer_name,
    delivery_note: o.delivery_note,
    status: o.status,
    created_at: o.created_at,
    item_count: itemCountByOrder.get(o.id) ?? 0,
  }))
}
