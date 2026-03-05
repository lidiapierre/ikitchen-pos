export interface CloseOrderResponse {
  success: boolean
  data?: { success: boolean; final_total: number }
  error?: string
}

export async function callCloseOrder(
  supabaseUrl: string,
  apiKey: string,
  orderId: string,
): Promise<void> {
  const res = await fetch(`${supabaseUrl}/functions/v1/close_order`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      apikey: apiKey,
      'x-demo-staff-id': '00000000-0000-0000-0000-000000000010',
    },
    body: JSON.stringify({ order_id: orderId }),
  })
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`)
  }
  const json = (await res.json()) as CloseOrderResponse
  if (!json.success) {
    throw new Error(json.error ?? 'Failed to close order')
  }
}
