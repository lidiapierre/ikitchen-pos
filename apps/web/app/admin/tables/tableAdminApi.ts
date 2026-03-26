interface ActionResponse {
  success: boolean
  data?: Record<string, unknown>
  error?: string
}

function buildHeaders(accessToken: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  }
}

async function callFunction(
  supabaseUrl: string,
  accessToken: string,
  functionName: string,
  body: unknown,
): Promise<ActionResponse> {
  const res = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
    method: 'POST',
    headers: buildHeaders(accessToken),
    body: JSON.stringify(body),
  })
  const json = (await res.json().catch(() => ({ success: false, error: 'Request failed' }))) as ActionResponse
  if (!res.ok) {
    throw new Error(json.error ?? `${functionName} failed`)
  }
  return json
}

export async function callCreateTable(
  supabaseUrl: string,
  accessToken: string,
  restaurantId: string,
  label: string,
  seatCount: number,
): Promise<string> {
  const result = await callFunction(supabaseUrl, accessToken, 'create_table', {
    restaurant_id: restaurantId,
    label,
    seat_count: seatCount,
  })
  if (!result.success || !result.data || typeof result.data['table_id'] !== 'string') {
    throw new Error(result.error ?? 'Table creation returned no data')
  }
  return result.data['table_id'] as string
}

export async function callUpdateTable(
  supabaseUrl: string,
  accessToken: string,
  tableId: string,
  label: string,
  seatCount: number,
): Promise<void> {
  const result = await callFunction(supabaseUrl, accessToken, 'update_table', {
    table_id: tableId,
    label,
    seat_count: seatCount,
  })
  if (!result.success) {
    throw new Error(result.error ?? 'Failed to update table')
  }
}

export async function callDeleteTable(
  supabaseUrl: string,
  accessToken: string,
  tableId: string,
): Promise<void> {
  const result = await callFunction(supabaseUrl, accessToken, 'delete_table', {
    table_id: tableId,
  })
  if (!result.success) {
    throw new Error(result.error ?? 'Failed to delete table')
  }
}
