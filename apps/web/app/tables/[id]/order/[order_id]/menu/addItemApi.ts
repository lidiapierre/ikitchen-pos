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
  accessToken: string,
  orderId: string,
  menuItemId: string,
  modifierIds?: string[],
  course?: string,
): Promise<AddItemResult> {
  const body: Record<string, unknown> = { order_id: orderId, menu_item_id: menuItemId }
  if (modifierIds !== undefined && modifierIds.length > 0) {
    body['modifier_ids'] = modifierIds
  }
  if (course !== undefined && course !== 'main') {
    body['course'] = course
  }
  const res = await fetch(`${supabaseUrl}/functions/v1/add_item_to_order`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  })
  const json = (await res.json()) as AddItemToOrderResponse
  if (!json.success || !json.data) {
    throw new Error(json.error ?? 'Failed to add item')
  }
  return { order_item_id: json.data.order_item_id, order_total: json.data.order_total }
}
