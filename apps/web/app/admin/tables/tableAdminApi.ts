interface ActionResponse {
  success: boolean
  data?: Record<string, unknown>
  error?: string
}

function buildHeaders(apiKey: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  }
}

async function callFunction(
  supabaseUrl: string,
  apiKey: string,
  functionName: string,
  body: unknown,
): Promise<ActionResponse> {
  const res = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
    method: 'POST',
    headers: buildHeaders(apiKey),
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
  apiKey: string,
  restaurantId: string,
  label: string,
  seatCount: number,
): Promise<string> {
  const result = await callFunction(supabaseUrl, apiKey, 'create_table', {
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
  apiKey: string,
  tableId: string,
  label: string,
  seatCount: number,
): Promise<void> {
  const result = await callFunction(supabaseUrl, apiKey, 'update_table', {
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
  apiKey: string,
  tableId: string,
): Promise<void> {
  const result = await callFunction(supabaseUrl, apiKey, 'delete_table', {
    table_id: tableId,
  })
  if (!result.success) {
    throw new Error(result.error ?? 'Failed to delete table')
  }
}
