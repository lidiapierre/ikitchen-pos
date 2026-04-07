/**
 * Update the quantity of a single order item (issue #368).
 *
 * Calls the `update_order_item_quantity` edge function via PATCH.
 * quantity must be a positive integer (≥1). Callers should trigger the
 * void flow instead when reducing quantity to 0.
 */
export async function updateOrderItemQuantity(
  supabaseUrl: string,
  accessToken: string,
  orderItemId: string,
  quantity: number,
): Promise<void> {
  const res = await fetch(`${supabaseUrl}/functions/v1/update_order_item_quantity`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ order_item_id: orderItemId, quantity }),
  })
  if (!res.ok) {
    let errMsg = `HTTP ${res.status}`
    try {
      const body = (await res.json()) as { error?: string }
      errMsg = body.error ?? errMsg
    } catch { /* ignore parse failures */ }
    throw new Error(errMsg)
  }
  const json = (await res.json()) as { success: boolean; error?: string }
  if (!json.success) {
    throw new Error(json.error ?? 'Failed to update order item quantity')
  }
}
