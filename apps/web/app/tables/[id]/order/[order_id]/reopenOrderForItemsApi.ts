/**
 * API client for the reopen_order_for_items edge function (issue #394).
 * Transitions a billed dine-in order from 'pending_payment' → 'open'
 * so that additional items can be added after the bill has been generated.
 * Sets post_bill_mode = true on the order so new items are flagged as post-bill additions.
 * Access: server+ only (viewers cannot perform this action).
 * Throws if the request fails or the server returns success: false.
 */

export async function callReopenOrderForItems(
  supabaseUrl: string,
  accessToken: string,
  orderId: string,
): Promise<void> {
  const res = await fetch(`${supabaseUrl}/functions/v1/reopen_order_for_items`, {
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
    throw new Error(errMsg)
  }
  const json = (await res.json()) as { success: boolean; error?: string }
  if (!json.success) {
    throw new Error(json.error ?? 'Failed to reopen order for items')
  }
}
