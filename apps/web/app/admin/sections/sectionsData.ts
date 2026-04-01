export interface Section {
  id: string
  name: string
  restaurant_id: string
  assigned_server_id: string | null
  sort_order: number
  grid_cols: number
  grid_rows: number
  created_at: string
  updated_at: string
}

export interface SectionTable {
  id: string
  label: string
  section_id: string | null
}

export interface StaffUser {
  id: string
  name: string | null
  email: string
  role: string
}

export async function fetchSections(
  supabaseUrl: string,
  accessToken: string,
): Promise<Section[]> {
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ''
  const url = new URL(`${supabaseUrl}/rest/v1/sections`)
  url.searchParams.set('select', '*')
  url.searchParams.set('order', 'sort_order.asc,name.asc')

  const res = await fetch(url.toString(), {
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${accessToken}`,
    },
  })
  if (!res.ok) throw new Error('Failed to fetch sections')
  return (await res.json()) as Section[]
}

export async function fetchSectionTables(
  supabaseUrl: string,
  accessToken: string,
): Promise<SectionTable[]> {
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ''
  const url = new URL(`${supabaseUrl}/rest/v1/tables`)
  url.searchParams.set('select', 'id,label,section_id')
  url.searchParams.set('order', 'label.asc')

  const res = await fetch(url.toString(), {
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${accessToken}`,
    },
  })
  if (!res.ok) throw new Error('Failed to fetch tables')
  return (await res.json()) as SectionTable[]
}

export async function fetchStaffUsers(
  supabaseUrl: string,
  accessToken: string,
): Promise<StaffUser[]> {
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ''
  const url = new URL(`${supabaseUrl}/rest/v1/users`)
  url.searchParams.set('select', 'id,name,email,role')
  url.searchParams.set('is_active', 'eq.true')
  url.searchParams.set('role', 'in.(server,manager,owner)')
  url.searchParams.set('order', 'name.asc')

  const res = await fetch(url.toString(), {
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${accessToken}`,
    },
  })
  if (!res.ok) return []
  return (await res.json()) as StaffUser[]
}

export async function fetchRestaurantId(
  supabaseUrl: string,
  accessToken: string,
): Promise<string> {
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ''
  const url = new URL(`${supabaseUrl}/rest/v1/restaurants`)
  url.searchParams.set('select', 'id')
  url.searchParams.set('limit', '1')

  const res = await fetch(url.toString(), {
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${accessToken}`,
    },
  })
  if (!res.ok) throw new Error('Failed to fetch restaurant')
  const rows = (await res.json()) as Array<{ id: string }>
  if (rows.length === 0) throw new Error('No restaurant found')
  return rows[0].id
}
