export interface AdminUser {
  id: string
  email: string
  name: string | null
  role: string
  is_active: boolean
  created_at: string
}

interface UserApiRow {
  id: string
  email: string
  name: string | null
  role: string
  is_active: boolean
  created_at: string
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

export async function fetchAdminUsers(
  supabaseUrl: string,
  apiKey: string,
): Promise<AdminUser[]> {
  const headers = { apikey: apiKey, Authorization: `Bearer ${apiKey}` }
  const url = new URL(`${supabaseUrl}/rest/v1/users`)
  url.searchParams.set('select', 'id,email,name,role,is_active,created_at')
  url.searchParams.set('order', 'created_at.asc')

  const res = await fetch(url.toString(), { headers })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Failed to fetch users: ${res.status} ${res.statusText} — ${body}`)
  }

  const rows = (await res.json()) as UserApiRow[]
  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    name: row.name ?? null,
    role: row.role,
    is_active: row.is_active ?? true,
    created_at: row.created_at,
  }))
}
