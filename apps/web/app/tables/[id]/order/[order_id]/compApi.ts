export interface CompItemResponse {
  success: boolean
  error?: string
}

export async function callCompItem(
  supabaseUrl: string,
  accessToken: string,
  params: {
    orderItemId?: string
    orderId?: string
    reason: string
  },
): Promise<void> {
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ''
  const body: Record<string, string> = { reason: params.reason }
  if (params.orderItemId) body['order_item_id'] = params.orderItemId
  if (params.orderId) body['order_id'] = params.orderId

  const res = await fetch(`${supabaseUrl}/functions/v1/comp_item`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`)
  }
  const json = (await res.json()) as CompItemResponse
  if (!json.success) {
    throw new Error(json.error ?? 'Failed to comp item')
  }
}
