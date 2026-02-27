export interface AddItemToOrderResponse {
  success: boolean
  data?: { order_item_id: string; order_total: number }
  error?: string
}

export interface AddItemResult {
  order_item_id: string
  order_total: number
}

export async function callAddItemToOrder(
  supabaseUrl: string,
  apiKey: string,
  authToken: string,
  orderId: string,
  menuItemId: string,
  quantity: number = 1,
): Promise<AddItemResult> {
  const res = await fetch(`${supabaseUrl}/functions/v1/add_item_to_order`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: apiKey,
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({ order_id: orderId, menu_item_id: menuItemId, quantity }),
  })
  const json = (await res.json()) as AddItemToOrderResponse
  if (!json.success || !json.data) {
    throw new Error(json.error ?? 'Failed to add item')
  }
  return { order_item_id: json.data.order_item_id, order_total: json.data.order_total }
}
