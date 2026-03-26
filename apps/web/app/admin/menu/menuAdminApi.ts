export interface ModifierInput {
  name: string
  price_delta_cents: number
}

function buildHeaders(apiKey: string, withPreferRepresentation = false): Record<string, string> {
  const h: Record<string, string> = {
    'Content-Type': 'application/json',
    apikey: apiKey,
    Authorization: `Bearer ${apiKey}`,
  }
  if (withPreferRepresentation) h['Prefer'] = 'return=representation'
  return h
}

async function postgrestRequest(
  url: string,
  method: string,
  apiKey: string,
  body?: unknown,
  returnRepresentation = false,
): Promise<unknown> {
  const res = await fetch(url, {
    method,
    headers: buildHeaders(apiKey, returnRepresentation),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`${method} ${url} failed: ${res.status} — ${text}`)
  }
  const text = await res.text()
  return text ? JSON.parse(text) : undefined
}

export async function callCreateMenu(
  supabaseUrl: string,
  apiKey: string,
  restaurantId: string,
  name: string,
): Promise<string> {
  const rows = (await postgrestRequest(
    `${supabaseUrl}/rest/v1/menus`,
    'POST',
    apiKey,
    { restaurant_id: restaurantId, name },
    true,
  )) as Array<{ id: string }>
  if (!rows || rows.length === 0) throw new Error('Menu creation returned no data')
  return rows[0].id
}

export async function callUpdateMenu(
  supabaseUrl: string,
  apiKey: string,
  menuId: string,
  name: string,
): Promise<void> {
  await postgrestRequest(
    `${supabaseUrl}/rest/v1/menus?id=eq.${menuId}`,
    'PATCH',
    apiKey,
    { name },
  )
}

export async function callDeleteMenu(
  supabaseUrl: string,
  apiKey: string,
  menuId: string,
): Promise<void> {
  await postgrestRequest(`${supabaseUrl}/rest/v1/menus?id=eq.${menuId}`, 'DELETE', apiKey)
}

export async function callCreateMenuItem(
  supabaseUrl: string,
  apiKey: string,
  menuId: string,
  name: string,
  priceCents: number,
  modifiers: ModifierInput[],
  description?: string,
  imageUrl?: string,
  available = true,
): Promise<string> {
  const res = await fetch(`${supabaseUrl}/functions/v1/create_menu_item`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`,
      'x-demo-staff-id': '00000000-0000-0000-0000-000000000001',
    },
    body: JSON.stringify({
      menu_id: menuId,
      name,
      price_cents: priceCents,
      modifiers,
      available,
      ...(description !== undefined ? { description } : {}),
      ...(imageUrl !== undefined ? { image_url: imageUrl } : {}),
    }),
  })
  const json = (await res.json()) as { success: boolean; data?: { menu_item_id: string }; error?: string }
  if (!json.success) throw new Error(json.error ?? 'Failed to create menu item')
  if (!json.data?.menu_item_id) throw new Error('Menu item creation returned no data')
  return json.data.menu_item_id
}

export async function callUpdateMenuItem(
  supabaseUrl: string,
  apiKey: string,
  menuItemId: string,
  name: string,
  priceCents: number,
  modifiers: ModifierInput[],
  description?: string,
  imageUrl?: string,
  available = true,
): Promise<void> {
  const res = await fetch(`${supabaseUrl}/functions/v1/update_menu_item`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`,
      'x-demo-staff-id': '00000000-0000-0000-0000-000000000001',
    },
    body: JSON.stringify({
      menu_item_id: menuItemId,
      name,
      price_cents: priceCents,
      modifiers,
      available,
      ...(description !== undefined ? { description } : {}),
      ...(imageUrl !== undefined ? { image_url: imageUrl } : {}),
    }),
  })
  const json = (await res.json()) as { success: boolean; error?: string }
  if (!json.success) throw new Error(json.error ?? 'Failed to update menu item')
}

export async function callDeleteMenuItem(
  supabaseUrl: string,
  apiKey: string,
  menuItemId: string,
): Promise<void> {
  const res = await fetch(`${supabaseUrl}/functions/v1/delete_menu_item`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`,
      'x-demo-staff-id': '00000000-0000-0000-0000-000000000001',
    },
    body: JSON.stringify({ menu_item_id: menuItemId }),
  })
  const json = (await res.json()) as { success: boolean; error?: string }
  if (!json.success) throw new Error(json.error ?? 'Failed to delete menu item')
}
