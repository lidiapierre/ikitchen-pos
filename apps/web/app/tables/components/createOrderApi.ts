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
  apiKey: string,
  tableId: number,
): Promise<CreateOrderResult> {
  const res = await fetch(`${supabaseUrl}/functions/v1/create_order`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: apiKey,
    },
    body: JSON.stringify({ table_id: tableId, staff_id: 'placeholder-staff' }),
  })
  const json = (await res.json()) as CreateOrderResponse
  if (!json.success || !json.data) {
    throw new Error(json.error ?? 'Failed to create order')
  }
  return { order_id: json.data.order_id }
}
