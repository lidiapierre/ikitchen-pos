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

export async function callCreateTable(
  supabaseUrl: string,
  apiKey: string,
  restaurantId: string,
  label: string,
  seatCount: number,
): Promise<string> {
  const rows = (await postgrestRequest(
    `${supabaseUrl}/rest/v1/tables`,
    'POST',
    apiKey,
    { restaurant_id: restaurantId, label, seat_count: seatCount },
    true,
  )) as Array<{ id: string }>
  if (!rows || rows.length === 0) throw new Error('Table creation returned no data')
  return rows[0].id
}

export async function callUpdateTable(
  supabaseUrl: string,
  apiKey: string,
  tableId: string,
  label: string,
  seatCount: number,
): Promise<void> {
  await postgrestRequest(
    `${supabaseUrl}/rest/v1/tables?id=eq.${tableId}`,
    'PATCH',
    apiKey,
    { label, seat_count: seatCount },
  )
}

export async function callDeleteTable(
  supabaseUrl: string,
  apiKey: string,
  tableId: string,
): Promise<void> {
  await postgrestRequest(
    `${supabaseUrl}/rest/v1/tables?id=eq.${tableId}`,
    'DELETE',
    apiKey,
  )
}
