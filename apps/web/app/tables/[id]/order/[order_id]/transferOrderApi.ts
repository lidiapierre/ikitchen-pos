export async function callTransferOrder(
  supabaseUrl: string,
  accessToken: string,
  orderId: string,
  targetTableId: string,
): Promise<void> {
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ''
  const res = await fetch(`${supabaseUrl}/functions/v1/transfer_order`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ order_id: orderId, target_table_id: targetTableId }),
  })

  if (!res.ok) {
    let message = 'Failed to transfer order'
    try {
      const data = (await res.json()) as { error?: string }
      if (data.error) message = data.error
    } catch {
      // ignore parse error
    }
    throw new Error(message)
  }
}
