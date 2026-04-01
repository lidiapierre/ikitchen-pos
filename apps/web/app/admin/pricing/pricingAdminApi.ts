const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ''

function buildHeaders(
  accessToken: string,
  extraHeaders?: Record<string, string>,
): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    apikey: publishableKey,
    Authorization: `Bearer ${accessToken}`,
    ...extraHeaders,
  }
}

async function postgrestRequest(
  url: string,
  method: string,
  accessToken: string,
  body?: unknown,
  extraHeaders?: Record<string, string>,
): Promise<unknown> {
  const res = await fetch(url, {
    method,
    headers: buildHeaders(accessToken, extraHeaders),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`${method} ${url} failed: ${res.status} — ${text}`)
  }
  const text = await res.text()
  return text ? (JSON.parse(text) as unknown) : undefined
}

export async function callCreateVatRate(
  supabaseUrl: string,
  accessToken: string,
  restaurantId: string,
  label: string,
  percentage: number,
  menuId: string | null,
): Promise<string> {
  const rows = (await postgrestRequest(
    `${supabaseUrl}/rest/v1/vat_rates`,
    'POST',
    accessToken,
    { restaurant_id: restaurantId, label, percentage, menu_id: menuId },
    { Prefer: 'return=representation' },
  )) as Array<{ id: string }>
  if (!rows || rows.length === 0) throw new Error('VAT rate creation returned no data')
  return rows[0].id
}

export async function callUpdateVatRate(
  supabaseUrl: string,
  accessToken: string,
  vatRateId: string,
  label: string,
  percentage: number,
  menuId: string | null,
): Promise<void> {
  await postgrestRequest(
    `${supabaseUrl}/rest/v1/vat_rates?id=eq.${vatRateId}`,
    'PATCH',
    accessToken,
    { label, percentage, menu_id: menuId },
  )
}

export async function callDeleteVatRate(
  supabaseUrl: string,
  accessToken: string,
  vatRateId: string,
): Promise<void> {
  await postgrestRequest(
    `${supabaseUrl}/rest/v1/vat_rates?id=eq.${vatRateId}`,
    'DELETE',
    accessToken,
  )
}

export async function callUpdateItemPrice(
  supabaseUrl: string,
  accessToken: string,
  menuItemId: string,
  priceCents: number,
): Promise<void> {
  await postgrestRequest(
    `${supabaseUrl}/rest/v1/menu_items?id=eq.${menuItemId}`,
    'PATCH',
    accessToken,
    { price_cents: priceCents },
  )
}

export async function callUpsertConfig(
  supabaseUrl: string,
  accessToken: string,
  restaurantId: string,
  key: string,
  value: string,
): Promise<void> {
  await postgrestRequest(
    `${supabaseUrl}/rest/v1/config?on_conflict=restaurant_id,key`,
    'POST',
    accessToken,
    { restaurant_id: restaurantId, key, value },
    { Prefer: 'resolution=merge-duplicates' },
  )
}
