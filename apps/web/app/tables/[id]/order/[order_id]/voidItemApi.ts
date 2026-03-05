export interface VoidItemResponse {
  success: boolean
  data?: { success: boolean; order_total: number }
  error?: string
}

export async function callVoidItem(
  supabaseUrl: string,
  apiKey: string,
  orderItemId: string,
  reason: string,
): Promise<void> {
  const res = await fetch(`${supabaseUrl}/functions/v1/void_item`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      apikey: apiKey,
      'x-demo-staff-id': '00000000-0000-0000-0000-000000000010',
    },
    body: JSON.stringify({ order_item_id: orderItemId, reason }),
  })
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`)
  }
  const json = (await res.json()) as VoidItemResponse
  if (!json.success) {
    throw new Error(json.error ?? 'Failed to void item')
  }
}
