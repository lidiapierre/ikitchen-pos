export interface CancelOrderResponse {
  success: boolean
  data?: { success: boolean }
  error?: string
}

export async function callCancelOrder(
  supabaseUrl: string,
  accessToken: string,
  orderId: string,
  reason: string,
): Promise<void> {
  const res = await fetch(`${supabaseUrl}/functions/v1/cancel_order`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ order_id: orderId, reason }),
  })
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`)
  }
  const json = (await res.json()) as CancelOrderResponse
  if (!json.success) {
    throw new Error(json.error ?? 'Failed to cancel order')
  }
}
