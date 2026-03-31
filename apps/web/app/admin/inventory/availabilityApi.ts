export interface AvailabilityMenuItem {
  id: string
  name: string
  available: boolean
}

export interface AvailabilityCategory {
  id: string
  name: string
  items: AvailabilityMenuItem[]
}

export async function fetchMenuAvailability(
  supabaseUrl: string,
  apiKey: string,
  restaurantId: string,
): Promise<AvailabilityCategory[]> {
  const url = `${supabaseUrl}/rest/v1/menus?restaurant_id=eq.${restaurantId}&select=id,name,menu_items(id,name,available)&order=name.asc`
  const res = await fetch(url, {
    headers: { apikey: apiKey, Authorization: `Bearer ${apiKey}` },
  })
  if (!res.ok) throw new Error(`Failed to fetch availability: ${res.status}`)
  const rows = (await res.json()) as Array<{
    id: string
    name: string
    menu_items: Array<{ id: string; name: string; available: boolean }>
  }>
  return rows.map((menu) => ({
    id: menu.id,
    name: menu.name,
    items: (menu.menu_items ?? [])
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((item) => ({ id: item.id, name: item.name, available: item.available })),
  }))
}
