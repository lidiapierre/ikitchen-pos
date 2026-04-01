const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ''

export interface UnifiedSection {
  id: string
  name: string
  restaurant_id: string
  assigned_server_id: string | null
  sort_order: number
  grid_cols: number
  grid_rows: number
}

export interface UnifiedTable {
  id: string
  label: string
  seat_count: number
  grid_x: number | null
  grid_y: number | null
  section_id: string | null
  open_order_id: string | null
}

export interface StaffUser {
  id: string
  name: string | null
  email: string
  role: string
}

interface OrderApiRow {
  id: string
  table_id: string | null
}

export interface UnifiedFloorPlanData {
  sections: UnifiedSection[]
  tables: UnifiedTable[]
  staffUsers: StaffUser[]
  restaurantId: string
}

function headers(accessToken: string): Record<string, string> {
  return {
    apikey: publishableKey,
    Authorization: `Bearer ${accessToken}`,
  }
}

export async function fetchUnifiedFloorPlanData(
  supabaseUrl: string,
  accessToken: string,
): Promise<UnifiedFloorPlanData> {
  const h = headers(accessToken)

  const sectionsUrl = new URL(`${supabaseUrl}/rest/v1/sections`)
  sectionsUrl.searchParams.set('select', 'id,name,restaurant_id,assigned_server_id,sort_order,grid_cols,grid_rows')
  sectionsUrl.searchParams.set('order', 'sort_order.asc,name.asc')

  const tablesUrl = new URL(`${supabaseUrl}/rest/v1/tables`)
  tablesUrl.searchParams.set('select', 'id,label,seat_count,grid_x,grid_y,section_id')
  tablesUrl.searchParams.set('order', 'label.asc')

  const ordersUrl = new URL(`${supabaseUrl}/rest/v1/orders`)
  ordersUrl.searchParams.set('select', 'id,table_id')
  ordersUrl.searchParams.set('status', 'in.(open,pending_payment)')
  ordersUrl.searchParams.set('order_type', 'eq.dine_in')

  const usersUrl = new URL(`${supabaseUrl}/rest/v1/users`)
  usersUrl.searchParams.set('select', 'id,name,email,role')
  usersUrl.searchParams.set('is_active', 'eq.true')
  usersUrl.searchParams.set('role', 'in.(server,manager,owner)')
  usersUrl.searchParams.set('order', 'name.asc')

  const restaurantUrl = new URL(`${supabaseUrl}/rest/v1/restaurants`)
  restaurantUrl.searchParams.set('select', 'id')
  restaurantUrl.searchParams.set('limit', '1')

  const [sectionsRes, tablesRes, ordersRes, usersRes, restRes] = await Promise.all([
    fetch(sectionsUrl.toString(), { headers: h }),
    fetch(tablesUrl.toString(), { headers: h }),
    fetch(ordersUrl.toString(), { headers: h }),
    fetch(usersUrl.toString(), { headers: h }),
    fetch(restaurantUrl.toString(), { headers: h }),
  ])

  if (!sectionsRes.ok) throw new Error(`Failed to fetch sections: ${sectionsRes.status}`)
  if (!tablesRes.ok) throw new Error(`Failed to fetch tables: ${tablesRes.status}`)
  if (!ordersRes.ok) throw new Error(`Failed to fetch orders: ${ordersRes.status}`)
  if (!usersRes.ok) throw new Error(`Failed to fetch users: ${usersRes.status}`)
  if (!restRes.ok) throw new Error(`Failed to fetch restaurant: ${restRes.status}`)

  const sections = (await sectionsRes.json()) as UnifiedSection[]
  const rawTables = (await tablesRes.json()) as Array<{
    id: string; label: string; seat_count: number; grid_x: number | null; grid_y: number | null; section_id: string | null
  }>
  const orders = (await ordersRes.json()) as OrderApiRow[]
  const staffUsers = (await usersRes.json()) as StaffUser[]
  const restaurants = (await restRes.json()) as Array<{ id: string }>

  if (restaurants.length === 0) throw new Error('No restaurant found')

  const openOrderByTable = new Map<string, string>()
  for (const order of orders) {
    if (order.table_id !== null) {
      openOrderByTable.set(order.table_id, order.id)
    }
  }

  const tables: UnifiedTable[] = rawTables.map((t) => ({
    id: t.id,
    label: t.label,
    seat_count: t.seat_count,
    grid_x: t.grid_x,
    grid_y: t.grid_y,
    section_id: t.section_id,
    open_order_id: openOrderByTable.get(t.id) ?? null,
  }))

  return {
    sections,
    tables,
    staffUsers,
    restaurantId: restaurants[0].id,
  }
}
