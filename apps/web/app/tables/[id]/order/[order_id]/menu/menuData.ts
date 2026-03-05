export interface MenuItem {
  id: string
  name: string
  price_cents: number
}

export interface MenuCategory {
  name: string
  items: MenuItem[]
}

interface MenuItemRow {
  id: string
  name: string
  price_cents: number
}

interface MenuRow {
  id: string
  name: string
  menu_items: MenuItemRow[]
}

interface OrderRow {
  restaurant_id: string
}

export async function fetchMenuCategories(
  supabaseUrl: string,
  apiKey: string,
  orderId: string,
): Promise<MenuCategory[]> {
  const orderUrl = new URL(`${supabaseUrl}/rest/v1/orders`)
  orderUrl.searchParams.set('id', `eq.${orderId}`)
  orderUrl.searchParams.set('select', 'restaurant_id')

  const orderRes = await fetch(orderUrl.toString(), {
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`,
    },
  })

  if (!orderRes.ok) {
    const body = await orderRes.text()
    throw new Error(`Failed to fetch order: ${orderRes.status} ${orderRes.statusText} — ${body}`)
  }

  const orders = (await orderRes.json()) as OrderRow[]
  if (!Array.isArray(orders)) {
    throw new Error('Unexpected response format from orders endpoint')
  }
  if (orders.length === 0) {
    throw new Error('Unable to load menu')
  }

  const { restaurant_id } = orders[0]

  const menusUrl = new URL(`${supabaseUrl}/rest/v1/menus`)
  menusUrl.searchParams.set('restaurant_id', `eq.${restaurant_id}`)
  menusUrl.searchParams.set('select', 'id,name,menu_items(id,name,price_cents)')

  const menusRes = await fetch(menusUrl.toString(), {
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`,
    },
  })

  if (!menusRes.ok) {
    const body = await menusRes.text()
    throw new Error(`Failed to fetch menus: ${menusRes.status} ${menusRes.statusText} — ${body}`)
  }

  const menus = (await menusRes.json()) as MenuRow[]
  if (!Array.isArray(menus)) {
    throw new Error('Unexpected response format from menus endpoint')
  }
  return menus.map((menu) => ({
    name: menu.name,
    items: menu.menu_items.map((item) => ({
      id: item.id,
      name: item.name,
      price_cents: item.price_cents,
    })),
  }))
}
