export interface CloseOrderResponse {
  success: boolean
  data?: { success: boolean; final_total: number }
  error?: string
}

export async function callCloseOrder(
  supabaseUrl: string,
  accessToken: string,
  orderId: string,
): Promise<void> {
  const res = await fetch(`${supabaseUrl}/functions/v1/close_order`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ order_id: orderId }),
  })
  const json = (await res.json()) as CloseOrderResponse
  // Treat non-OK responses as errors, but 409 with a clear message
  // gets a user-friendly fallback (issue #318)
  if (!res.ok) {
    if (res.status === 409) {
      throw new Error('Order is no longer open — it may have already been closed')
    }
    throw new Error(json.error ?? `HTTP ${res.status}`)
  }
  if (!json.success) {
    throw new Error(json.error ?? 'Failed to close order')
  }
}
