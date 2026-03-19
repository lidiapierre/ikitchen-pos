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
): Promise<string> {
  const rows = (await postgrestRequest(
    `${supabaseUrl}/rest/v1/menu_items`,
    'POST',
    apiKey,
    {
      menu_id: menuId,
      name,
      price_cents: priceCents,
      ...(description !== undefined ? { description } : {}),
      ...(imageUrl !== undefined ? { image_url: imageUrl } : {}),
    },
    true,
  )) as Array<{ id: string }>
  if (!rows || rows.length === 0) throw new Error('Menu item creation returned no data')
  const menuItemId = rows[0].id

  if (modifiers.length > 0) {
    await postgrestRequest(
      `${supabaseUrl}/rest/v1/modifiers`,
      'POST',
      apiKey,
      modifiers.map((m) => ({
        menu_item_id: menuItemId,
        name: m.name,
        price_delta_cents: m.price_delta_cents,
      })),
    )
  }

  return menuItemId
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
): Promise<void> {
  await postgrestRequest(
    `${supabaseUrl}/rest/v1/menu_items?id=eq.${menuItemId}`,
    'PATCH',
    apiKey,
    {
      name,
      price_cents: priceCents,
      ...(description !== undefined ? { description } : {}),
      ...(imageUrl !== undefined ? { image_url: imageUrl } : {}),
    },
  )

  // Replace modifiers: delete existing then insert updated set
  await postgrestRequest(
    `${supabaseUrl}/rest/v1/modifiers?menu_item_id=eq.${menuItemId}`,
    'DELETE',
    apiKey,
  )

  if (modifiers.length > 0) {
    await postgrestRequest(
      `${supabaseUrl}/rest/v1/modifiers`,
      'POST',
      apiKey,
      modifiers.map((m) => ({
        menu_item_id: menuItemId,
        name: m.name,
        price_delta_cents: m.price_delta_cents,
      })),
    )
  }
}

export async function callDeleteMenuItem(
  supabaseUrl: string,
  apiKey: string,
  menuItemId: string,
): Promise<void> {
  // Modifiers cascade-delete via ON DELETE CASCADE in the schema
  await postgrestRequest(
    `${supabaseUrl}/rest/v1/menu_items?id=eq.${menuItemId}`,
    'DELETE',
    apiKey,
  )
}
