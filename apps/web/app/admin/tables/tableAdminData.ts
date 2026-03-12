export interface AdminTable {
  id: string
  label: string
  seat_count: number
  open_order_id: string | null
}

interface TableApiRow {
  id: string
  label: string
  seat_count: number
}

interface OrderApiRow {
  id: string
  table_id: string | null
}

interface RestaurantRow {
  id: string
}

export async function fetchRestaurantId(supabaseUrl: string, apiKey: string): Promise<string> {
  const headers = { apikey: apiKey, Authorization: `Bearer ${apiKey}` }
  const url = new URL(`${supabaseUrl}/rest/v1/restaurants`)
  url.searchParams.set('select', 'id')
  url.searchParams.set('limit', '1')
  const res = await fetch(url.toString(), { headers })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Failed to fetch restaurant: ${res.status} ${res.statusText} — ${body}`)
  }
  const rows = (await res.json()) as RestaurantRow[]
  if (rows.length === 0) throw new Error('No restaurant found')
  return rows[0].id
}

export async function fetchAdminTables(
  supabaseUrl: string,
  apiKey: string,
): Promise<AdminTable[]> {
  const headers = { apikey: apiKey, Authorization: `Bearer ${apiKey}` }

  const tablesUrl = new URL(`${supabaseUrl}/rest/v1/tables`)
  tablesUrl.searchParams.set('select', 'id,label,seat_count')

  const ordersUrl = new URL(`${supabaseUrl}/rest/v1/orders`)
  ordersUrl.searchParams.set('select', 'id,table_id')
  ordersUrl.searchParams.set('status', 'eq.open')

  const [tablesRes, ordersRes] = await Promise.all([
    fetch(tablesUrl.toString(), { headers }),
    fetch(ordersUrl.toString(), { headers }),
  ])

  if (!tablesRes.ok) {
    const body = await tablesRes.text()
    throw new Error(`Failed to fetch tables: ${tablesRes.status} ${tablesRes.statusText} — ${body}`)
  }
  if (!ordersRes.ok) {
    const body = await ordersRes.text()
    throw new Error(`Failed to fetch orders: ${ordersRes.status} ${ordersRes.statusText} — ${body}`)
  }

  const tables = (await tablesRes.json()) as TableApiRow[]
  const orders = (await ordersRes.json()) as OrderApiRow[]

  const openOrderByTable = new Map<string, string>()
  for (const order of orders) {
    if (order.table_id !== null) {
      openOrderByTable.set(order.table_id, order.id)
    }
  }

  return tables.map((table) => ({
    id: table.id,
    label: table.label,
    seat_count: table.seat_count,
    open_order_id: openOrderByTable.get(table.id) ?? null,
  }))
}
