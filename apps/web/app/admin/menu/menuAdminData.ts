export interface AdminModifier {
  id: string
  name: string
  price_delta_cents: number
}

export interface AdminMenuItem {
  id: string
  name: string
  description?: string
  price_cents: number
  image_url?: string
  modifiers: AdminModifier[]
}

export interface AdminMenu {
  id: string
  name: string
  restaurant_id: string
  printer_type: 'kitchen' | 'cashier' | 'bar'
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
  description?: string
  price_cents: number
  image_url?: string
  modifiers: ModifierRow[]
}

interface MenuRow {
  id: string
  name: string
  restaurant_id: string
  printer_type: string | null
  menu_items: MenuItemRow[]
}

interface RestaurantRow {
  id: string
}

async function fetchRestaurantId(supabaseUrl: string, apiKey: string): Promise<string> {
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
    'id,name,restaurant_id,printer_type,menu_items(id,name,description,price_cents,image_url,modifiers(id,name,price_delta_cents))',
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
    printer_type: (menu.printer_type as 'kitchen' | 'cashier' | 'bar' | null) ?? 'kitchen',
    items: (menu.menu_items ?? []).map((item) => ({
      id: item.id,
      name: item.name,
      ...(item.description !== undefined ? { description: item.description } : {}),
      price_cents: item.price_cents,
      ...(item.image_url !== undefined ? { image_url: item.image_url } : {}),
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
  const [restaurantId, menus] = await Promise.all([
    fetchRestaurantId(supabaseUrl, apiKey),
    fetchMenus(supabaseUrl, apiKey),
  ])
  return { restaurantId, menus }
}
