/**
 * Waive or restore the delivery fee for an order (issue #382).
 * Updates orders.delivery_charge directly.
 */

const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ''

/**
 * Update the delivery charge on an order.
 * Pass 0 to waive the fee; pass the original charge to restore it.
 */
export async function callUpdateDeliveryCharge(
  supabaseUrl: string,
  accessToken: string,
  orderId: string,
  deliveryChargeCents: number,
): Promise<void> {
  const res = await fetch(`${supabaseUrl}/rest/v1/orders?id=eq.${orderId}`, {
    method: 'PATCH',
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ delivery_charge: deliveryChargeCents }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Failed to update delivery charge: ${res.status} — ${body}`)
  }
}
