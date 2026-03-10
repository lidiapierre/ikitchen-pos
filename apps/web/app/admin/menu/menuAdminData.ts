export interface AdminModifier {
  id: string
  name: string
  price_delta_cents: number
}

export interface AdminMenuItem {
  id: string
  name: string
  price_cents: number
  modifiers: AdminModifier[]
}

export interface AdminMenu {
  id: string
  name: string
  restaurant_id: string
  items: AdminMenuItem[]
}

export interface MenuAdminData {
  restaurantId: string
  menus: AdminMenu[]
}

interface ModifierRow {
  id: string
  name: string
  price_delta_cents: number
}

interface MenuItemRow {
  id: string
  name: string
  price_cents: number
  modifiers: ModifierRow[]
}

interface MenuRow {
  id: string
  name: string
  restaurant_id: string
  menu_items: MenuItemRow[]
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

async function fetchMenus(supabaseUrl: string, apiKey: string): Promise<AdminMenu[]> {
  const headers = { apikey: apiKey, Authorization: `Bearer ${apiKey}` }
  const url = new URL(`${supabaseUrl}/rest/v1/menus`)
  url.searchParams.set(
    'select',
    'id,name,restaurant_id,menu_items(id,name,price_cents,modifiers(id,name,price_delta_cents))',
  )
  const res = await fetch(url.toString(), { headers })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Failed to fetch menus: ${res.status} ${res.statusText} — ${body}`)
  }
  const rows = (await res.json()) as MenuRow[]
  if (!Array.isArray(rows)) throw new Error('Unexpected response format from menus endpoint')
  return rows.map((menu) => ({
    id: menu.id,
    name: menu.name,
    restaurant_id: menu.restaurant_id,
    items: (menu.menu_items ?? []).map((item) => ({
      id: item.id,
      name: item.name,
      price_cents: item.price_cents,
      modifiers: (item.modifiers ?? []).map((mod) => ({
        id: mod.id,
        name: mod.name,
        price_delta_cents: mod.price_delta_cents,
      })),
    })),
  }))
}

export async function fetchMenuAdminData(
  supabaseUrl: string,
  apiKey: string,
): Promise<MenuAdminData> {
  // Only fetch menus on page load — the restaurants table may not be readable by
  // the anon key until the allow_anon_read migration is applied to production.
  // restaurantId is extracted from the loaded menus (every menu row includes it),
  // and fetched lazily from the restaurants table only when no menus exist yet.
  const menus = await fetchMenus(supabaseUrl, apiKey)
  const restaurantId = menus[0]?.restaurant_id ?? ''
  return { restaurantId, menus }
}
