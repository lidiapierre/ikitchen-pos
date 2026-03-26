export interface VoidItemResponse {
  success: boolean
  data?: { success: boolean; order_total: number }
  error?: string
}

export async function callVoidItem(
  supabaseUrl: string,
  accessToken: string,
  orderItemId: string,
  reason: string,
): Promise<void> {
  if (!accessToken) throw new Error('Not authenticated — please log in and try again.')
  const res = await fetch(`${supabaseUrl}/functions/v1/void_item`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ order_item_id: orderItemId, reason }),
  })
  if (!res.ok) {
    let errMsg = `HTTP ${res.status}`
    try {
      const body = (await res.json()) as { error?: string; message?: string }
      errMsg = body.error ?? body.message ?? errMsg
    } catch { /* ignore */ }
    throw new Error(errMsg)
  }
  const json = (await res.json()) as VoidItemResponse
  if (!json.success) {
    throw new Error(json.error ?? 'Failed to void item')
  }
}
