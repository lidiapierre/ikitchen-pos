export interface CloseOrderResponse {
  success: boolean
  data?: { final_total_cents: number; service_charge_cents: number; bill_number: string | null }
  error?: string
}

export async function callCloseOrder(
  supabaseUrl: string,
  accessToken: string,
  orderId: string,
): Promise<{ billNumber: string | null }> {
  const res = await fetch(`${supabaseUrl}/functions/v1/close_order`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ order_id: orderId }),
  })
  if (!res.ok) {
    let errMsg = `HTTP ${res.status}`
    try {
      errMsg = ((await res.json()) as { error?: string }).error ?? errMsg
    } catch { /* ignore non-JSON error bodies */ }
    if (res.status === 409) {
      throw new Error('Order is no longer open — it may have already been closed')
    }
    throw new Error(errMsg)
  }
  const json = (await res.json()) as CloseOrderResponse
  if (!json.success) {
    throw new Error(json.error ?? 'Failed to close order')
  }
  return { billNumber: json.data?.bill_number ?? null }
}
