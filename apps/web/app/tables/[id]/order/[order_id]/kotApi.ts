export async function markItemsSentToKitchen(
  supabaseUrl: string,
  apiKey: string,
  itemIds: string[],
): Promise<void> {
  if (itemIds.length === 0) return

  const url = new URL(`${supabaseUrl}/rest/v1/order_items`)
  url.searchParams.set('id', `in.(${itemIds.join(',')})`)

  const res = await fetch(url.toString(), {
    method: 'PATCH',
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ sent_to_kitchen: true }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Failed to mark items as sent to kitchen: ${res.status} ${res.statusText} — ${body}`)
  }
}
