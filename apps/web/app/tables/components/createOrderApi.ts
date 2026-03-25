export interface CreateOrderResponse {
  success: boolean
  data?: { order_id: string; status: string }
  error?: string
}

export interface CreateOrderResult {
  order_id: string
}

export async function callCreateOrder(
  supabaseUrl: string,
  accessToken: string,
  tableId: string,
): Promise<CreateOrderResult> {
  const res = await fetch(`${supabaseUrl}/functions/v1/create_order`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ table_id: tableId }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`create_order failed: ${res.status} ${res.statusText} — ${body}`)
  }
  const json = (await res.json()) as CreateOrderResponse
  if (!json.success || !json.data) {
    throw new Error(json.error ?? 'Failed to create order')
  }
  return { order_id: json.data.order_id }
}
