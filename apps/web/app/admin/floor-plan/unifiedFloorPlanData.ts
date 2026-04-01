import { supabase } from '@/lib/supabase'

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

export async function fetchUnifiedFloorPlanData(): Promise<UnifiedFloorPlanData> {
  const [sectionsResult, tablesResult, ordersResult, usersResult, restResult] = await Promise.all([
    supabase
      .from('sections')
      .select('id,name,restaurant_id,assigned_server_id,sort_order,grid_cols,grid_rows')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true }),
    supabase
      .from('tables')
      .select('id,label,seat_count,grid_x,grid_y,section_id')
      .order('label', { ascending: true }),
    supabase
      .from('orders')
      .select('id,table_id')
      .in('status', ['open', 'pending_payment'])
      .eq('order_type', 'dine_in'),
    supabase
      .from('users')
      .select('id,name,email,role')
      .eq('is_active', true)
      .in('role', ['server', 'manager', 'owner'])
      .order('name', { ascending: true }),
    supabase
      .from('restaurants')
      .select('id')
      .limit(1),
  ])

  if (sectionsResult.error) throw new Error(`Failed to fetch sections: ${sectionsResult.error.message}`)
  if (tablesResult.error) throw new Error(`Failed to fetch tables: ${tablesResult.error.message}`)
  if (ordersResult.error) throw new Error(`Failed to fetch orders: ${ordersResult.error.message}`)
  if (usersResult.error) throw new Error(`Failed to fetch users: ${usersResult.error.message}`)
  if (restResult.error) throw new Error(`Failed to fetch restaurant: ${restResult.error.message}`)

  const sections = (sectionsResult.data ?? []) as UnifiedSection[]
  const rawTables = (tablesResult.data ?? []) as Array<{
    id: string; label: string; seat_count: number; grid_x: number | null; grid_y: number | null; section_id: string | null
  }>
  const orders = (ordersResult.data ?? []) as OrderApiRow[]
  const staffUsers = (usersResult.data ?? []) as StaffUser[]
  const restaurants = (restResult.data ?? []) as Array<{ id: string }>

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
