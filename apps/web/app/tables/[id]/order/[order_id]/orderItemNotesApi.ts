/**
 * Update the free-text notes on a single order item (issue #272).
 *
 * Calls the `update_order_item_notes` edge function via PATCH.
 * Pass `notes: null` or `notes: ''` to clear an existing note.
 */
export async function updateOrderItemNotes(
  supabaseUrl: string,
  accessToken: string,
  orderItemId: string,
  notes: string | null,
): Promise<void> {
  const res = await fetch(`${supabaseUrl}/functions/v1/update_order_item_notes`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ order_item_id: orderItemId, notes }),
  })
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`)
  }
  const json = (await res.json()) as { success: boolean; error?: string }
  if (!json.success) {
    throw new Error(json.error ?? 'Failed to update order item notes')
  }
}
