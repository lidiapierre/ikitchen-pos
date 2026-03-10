interface ActionResult<T = undefined> {
  success: boolean
  data?: T
  error?: string
}

export interface ModifierInput {
  name: string
  price_delta_cents: number
}

function actionUrl(supabaseUrl: string, action: string): string {
  return `${supabaseUrl}/functions/v1/${action}`
}

function headers(apiKey: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    apikey: apiKey,
    Authorization: `Bearer ${apiKey}`,
  }
}

export async function callCreateMenu(
  supabaseUrl: string,
  apiKey: string,
  restaurantId: string,
  name: string,
): Promise<string> {
  const res = await fetch(actionUrl(supabaseUrl, 'create_menu'), {
    method: 'POST',
    headers: headers(apiKey),
    body: JSON.stringify({ restaurant_id: restaurantId, name }),
  })
  const json = (await res.json()) as ActionResult<{ menu_id: string }>
  if (!json.success || !json.data) throw new Error(json.error ?? 'Failed to create menu')
  return json.data.menu_id
}

export async function callUpdateMenu(
  supabaseUrl: string,
  apiKey: string,
  menuId: string,
  name: string,
): Promise<void> {
  const res = await fetch(actionUrl(supabaseUrl, 'update_menu'), {
    method: 'POST',
    headers: headers(apiKey),
    body: JSON.stringify({ menu_id: menuId, name }),
  })
  const json = (await res.json()) as ActionResult
  if (!json.success) throw new Error(json.error ?? 'Failed to update menu')
}

export async function callDeleteMenu(
  supabaseUrl: string,
  apiKey: string,
  menuId: string,
): Promise<void> {
  const res = await fetch(actionUrl(supabaseUrl, 'delete_menu'), {
    method: 'POST',
    headers: headers(apiKey),
    body: JSON.stringify({ menu_id: menuId }),
  })
  const json = (await res.json()) as ActionResult
  if (!json.success) throw new Error(json.error ?? 'Failed to delete menu')
}

export async function callCreateMenuItem(
  supabaseUrl: string,
  apiKey: string,
  menuId: string,
  name: string,
  priceCents: number,
  modifiers: ModifierInput[],
): Promise<string> {
  const res = await fetch(actionUrl(supabaseUrl, 'create_menu_item'), {
    method: 'POST',
    headers: headers(apiKey),
    body: JSON.stringify({ menu_id: menuId, name, price_cents: priceCents, modifiers }),
  })
  const json = (await res.json()) as ActionResult<{ menu_item_id: string }>
  if (!json.success || !json.data) throw new Error(json.error ?? 'Failed to create menu item')
  return json.data.menu_item_id
}

export async function callUpdateMenuItem(
  supabaseUrl: string,
  apiKey: string,
  menuItemId: string,
  name: string,
  priceCents: number,
  modifiers: ModifierInput[],
): Promise<void> {
  const res = await fetch(actionUrl(supabaseUrl, 'update_menu_item'), {
    method: 'POST',
    headers: headers(apiKey),
    body: JSON.stringify({ menu_item_id: menuItemId, name, price_cents: priceCents, modifiers }),
  })
  const json = (await res.json()) as ActionResult
  if (!json.success) throw new Error(json.error ?? 'Failed to update menu item')
}

export async function callDeleteMenuItem(
  supabaseUrl: string,
  apiKey: string,
  menuItemId: string,
): Promise<void> {
  const res = await fetch(actionUrl(supabaseUrl, 'delete_menu_item'), {
    method: 'POST',
    headers: headers(apiKey),
    body: JSON.stringify({ menu_item_id: menuItemId }),
  })
  const json = (await res.json()) as ActionResult
  if (!json.success) throw new Error(json.error ?? 'Failed to delete menu item')
}
