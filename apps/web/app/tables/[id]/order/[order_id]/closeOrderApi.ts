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
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ order_id: orderId }),
  })
  const json = (await res.json()) as CloseOrderResponse
  if (!json.success) {
    throw new Error(json.error ?? 'Failed to close order')
  }
}
