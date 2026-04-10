/**
 * API client for the mark_order_due edge function (issue #370).
 * Transitions a dine-in order from 'open' → 'due' (deferred payment / tab).
 * Throws if the request fails or the server returns success: false.
 */

export async function callMarkOrderDue(
  supabaseUrl: string,
  accessToken: string,
  orderId: string,
): Promise<void> {
  const res = await fetch(`${supabaseUrl}/functions/v1/mark_order_due`, {
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
    throw new Error(json.error ?? 'Failed to mark order as due')
  }
}
