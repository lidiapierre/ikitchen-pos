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
  /** Section assignment (null = unsectioned) */
  section_id: string | null
  section_name: string | null
  assigned_server_name: string | null
  /** Section sort_order for ordering in card grid view */
  section_sort_order: number | null
  /**
   * Merge label on the primary order (issue #274).
   * Set when this table's order has secondary tables merged in (e.g. "Table 3 + Table 4").
   * Null when not part of a merge.
   */
  merge_label: string | null
  /**
   * When non-null, this table is a secondary partner in a merge (issue #274).
   * Points to the primary order that locked this table.
   * The table is displayed as "Merged" and clicking navigates to the primary order.
   */
  locked_by_order_id: string | null
  /**
   * For locked (secondary) tables, the primary table's ID for navigation (issue #274).
   * Used to build the URL: /tables/${primary_table_id}/order/${locked_by_order_id}
   */
  primary_table_id: string | null
}

export interface TakeawayDeliveryOrder {
  id: string
  order_type: 'takeaway' | 'delivery'
  customer_name: string | null
  customer_mobile: string | null
  delivery_note: string | null
  status: string
  created_at: string
  item_count: number
  /** Scheduled pickup/delivery time for takeaway and delivery orders (issue #352). */
  scheduled_time: string | null
}

interface TableApiRow {
  id: string
  label: string
  grid_x: number | null
  grid_y: number | null
  section_id: string | null
  locked_by_order_id: string | null
}

interface SectionApiRow {
  id: string
  name: string
  assigned_server_id: string | null
  sort_order: number
}

interface UserApiRow {
  id: string
  name: string | null
  email: string
}

interface OrderApiRow {
  id: string
  table_id: string | null
  status: string
  created_at: string
  merge_label: string | null
}

interface TakeawayDeliveryApiRow {
  id: string
  order_type: string
  customer_name: string | null
  customer_mobile: string | null
  delivery_note: string | null
  status: string
  created_at: string
  scheduled_time: string | null
}

export async function fetchTables(
  supabaseUrl: string,
  accessToken: string,
): Promise<TableRow[]> {
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ''
  const headers = {
    apikey: publishableKey,
    Authorization: `Bearer ${accessToken}`,
  }

  const tablesUrl = new URL(`${supabaseUrl}/rest/v1/tables`)
  tablesUrl.searchParams.set('select', 'id,label,grid_x,grid_y,section_id,locked_by_order_id')

  const tablesRes = await fetch(tablesUrl.toString(), { headers })

  if (!tablesRes.ok) {
    const body = await tablesRes.text()
    throw new Error(`Failed to fetch tables: ${tablesRes.status} ${tablesRes.statusText} — ${body}`)
  }

  const ordersUrl = new URL(`${supabaseUrl}/rest/v1/orders`)
  ordersUrl.searchParams.set('select', 'id,table_id,status,created_at,merge_label')
  ordersUrl.searchParams.set('status', 'in.(open,pending_payment)')
  ordersUrl.searchParams.set('order_type', 'eq.dine_in')

  const ordersRes = await fetch(ordersUrl.toString(), { headers })

  if (!ordersRes.ok) {
    const body = await ordersRes.text()
    throw new Error(`Failed to fetch orders: ${ordersRes.status} ${ordersRes.statusText} — ${body}`)
  }

  const tables = (await tablesRes.json()) as TableApiRow[]
  const orders = (await ordersRes.json()) as OrderApiRow[]

  // Fetch sections for section names + assigned server info
  const sectionIds = [...new Set(tables.map(t => t.section_id).filter(Boolean))] as string[]
  const sectionMap = new Map<string, { name: string; assigned_server_id: string | null; sort_order: number }>()
  const serverNameMap = new Map<string, string>()

  if (sectionIds.length > 0) {
    const sectionsUrl = new URL(`${supabaseUrl}/rest/v1/sections`)
    sectionsUrl.searchParams.set('select', 'id,name,assigned_server_id,sort_order')
    sectionsUrl.searchParams.set('id', `in.(${sectionIds.join(',')})`)
    const sectionsRes = await fetch(sectionsUrl.toString(), { headers })
    if (sectionsRes.ok) {
      const secs = (await sectionsRes.json()) as SectionApiRow[]
      for (const s of secs) {
        sectionMap.set(s.id, { name: s.name, assigned_server_id: s.assigned_server_id, sort_order: s.sort_order })
      }
      const serverIds = [...new Set(secs.map(s => s.assigned_server_id).filter(Boolean))] as string[]
      if (serverIds.length > 0) {
        const usersUrl = new URL(`${supabaseUrl}/rest/v1/users`)
        usersUrl.searchParams.set('select', 'id,name,email')
        usersUrl.searchParams.set('id', `in.(${serverIds.join(',')})`)
        const usersRes = await fetch(usersUrl.toString(), { headers })
        if (usersRes.ok) {
          const users = (await usersRes.json()) as UserApiRow[]
          for (const u of users) {
            serverNameMap.set(u.id, u.name ?? u.email)
          }
        }
      }
    }
  }

  const openOrderByTable = new Map<string, OrderApiRow>()
  const openOrderById = new Map<string, OrderApiRow>()
  for (const order of orders) {
    openOrderById.set(order.id, order)
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
    const sec = table.section_id ? sectionMap.get(table.section_id) : null
    const serverName = sec?.assigned_server_id ? serverNameMap.get(sec.assigned_server_id) ?? null : null

    // Resolve primary table ID for locked (secondary merge) tables
    const lockedByOrderId = table.locked_by_order_id ?? null
    let primaryTableId: string | null = null
    if (lockedByOrderId !== null) {
      const primaryOrder = openOrderById.get(lockedByOrderId)
      primaryTableId = primaryOrder?.table_id ?? null
    }

    return {
      id: table.id,
      label: table.label,
      open_order_id: order?.id ?? null,
      order_status: order?.status ?? null,
      order_created_at: order?.created_at ?? null,
      order_item_count: order !== undefined ? (itemCountByOrder.get(order.id) ?? 0) : null,
      grid_x: table.grid_x ?? null,
      grid_y: table.grid_y ?? null,
      section_id: table.section_id ?? null,
      section_name: sec?.name ?? null,
      assigned_server_name: serverName,
      section_sort_order: sec?.sort_order ?? null,
      merge_label: order?.merge_label ?? null,
      locked_by_order_id: lockedByOrderId,
      primary_table_id: primaryTableId,
    }
  })
}

/**
 * Fetch active takeaway and delivery orders for the queue section on the tables page.
 */
export async function fetchTakeawayDeliveryQueue(
  supabaseUrl: string,
  accessToken: string,
): Promise<TakeawayDeliveryOrder[]> {
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ''
  const headers = {
    apikey: publishableKey,
    Authorization: `Bearer ${accessToken}`,
  }

  const ordersUrl = new URL(`${supabaseUrl}/rest/v1/orders`)
  ordersUrl.searchParams.set('select', 'id,order_type,customer_name,customer_mobile,delivery_note,status,created_at,scheduled_time')
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
    customer_mobile: o.customer_mobile,
    delivery_note: o.delivery_note,
    status: o.status,
    created_at: o.created_at,
    item_count: itemCountByOrder.get(o.id) ?? 0,
    scheduled_time: o.scheduled_time ?? null,
  }))
}
