const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ''

export interface AdminRestaurant {
  id: string
  name: string
  slug: string | null
  timezone: string
  created_at: string
  owner_email: string | null
}

interface RestaurantRow {
  id: string
  name: string
  slug: string | null
  timezone: string
  created_at: string
}

interface UserRow {
  restaurant_id: string
  email: string
  role: string
}

export async function fetchAdminRestaurants(
  supabaseUrl: string,
  accessToken: string,
): Promise<AdminRestaurant[]> {
  const headers = { apikey: publishableKey, Authorization: `Bearer ${accessToken}` }

  const restUrl = new URL(`${supabaseUrl}/rest/v1/restaurants`)
  restUrl.searchParams.set('select', 'id,name,slug,timezone,created_at')
  restUrl.searchParams.set('order', 'created_at.asc')

  const restRes = await fetch(restUrl.toString(), { headers })
  if (!restRes.ok) {
    const body = await restRes.text()
    throw new Error(`Failed to fetch restaurants: ${restRes.status} ${restRes.statusText} — ${body}`)
  }
  const restaurants = (await restRes.json()) as RestaurantRow[]

  if (restaurants.length === 0) return []

  const ids = restaurants.map((r) => r.id)
  const usersUrl = new URL(`${supabaseUrl}/rest/v1/users`)
  usersUrl.searchParams.set('select', 'restaurant_id,email,role')
  usersUrl.searchParams.set('role', 'eq.owner')
  usersUrl.searchParams.set('restaurant_id', `in.(${ids.join(',')})`)

  const usersRes = await fetch(usersUrl.toString(), { headers })
  const ownerMap = new Map<string, string>()
  if (usersRes.ok) {
    const users = (await usersRes.json()) as UserRow[]
    for (const u of users) {
      if (!ownerMap.has(u.restaurant_id)) {
        ownerMap.set(u.restaurant_id, u.email)
      }
    }
  }

  return restaurants.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug ?? null,
    timezone: r.timezone,
    created_at: r.created_at,
    owner_email: ownerMap.get(r.id) ?? null,
  }))
}

export async function fetchIsSuperAdmin(
  supabaseUrl: string,
  accessToken: string,
): Promise<boolean> {
  const headers = { apikey: publishableKey, Authorization: `Bearer ${accessToken}` }

  const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: publishableKey, Authorization: `Bearer ${accessToken}` },
  })
  if (!userRes.ok) return false
  const user = (await userRes.json()) as { id?: string }
  if (!user.id) return false

  const url = new URL(`${supabaseUrl}/rest/v1/users`)
  url.searchParams.set('id', `eq.${user.id}`)
  url.searchParams.set('select', 'is_super_admin')
  url.searchParams.set('limit', '1')

  const res = await fetch(url.toString(), { headers })
  if (!res.ok) return false
  const rows = (await res.json()) as Array<{ is_super_admin: boolean }>
  return rows.length > 0 && rows[0].is_super_admin === true
}
