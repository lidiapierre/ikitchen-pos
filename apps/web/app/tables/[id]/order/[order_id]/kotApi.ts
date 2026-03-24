export async function markItemsSentToKitchen(
  supabaseUrl: string,
  apiKey: string,
  orderId: string,
  itemIds: string[],
): Promise<void> {
  if (itemIds.length === 0) return

  const res = await fetch(`${supabaseUrl}/functions/v1/mark-items-sent-to-kitchen`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      apikey: apiKey,
    },
    body: JSON.stringify({ order_id: orderId, item_ids: itemIds }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Failed to mark items as sent: ${res.status} — ${body}`)
  }
}
