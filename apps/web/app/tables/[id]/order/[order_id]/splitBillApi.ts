export async function callSetCovers(
  supabaseUrl: string,
  accessToken: string,
  orderId: string,
  covers: number,
): Promise<void> {
  const res = await fetch(`${supabaseUrl}/functions/v1/set_covers`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '',
    },
    body: JSON.stringify({ order_id: orderId, covers }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`set_covers failed: ${res.status} — ${body}`)
  }
}

export async function callSetItemSeat(
  supabaseUrl: string,
  accessToken: string,
  orderItemId: string,
  seat: number | null,
): Promise<void> {
  const res = await fetch(`${supabaseUrl}/functions/v1/set_item_seat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '',
    },
    body: JSON.stringify({ order_item_id: orderItemId, seat }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`set_item_seat failed: ${res.status} — ${body}`)
  }
}
