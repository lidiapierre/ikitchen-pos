/**
 * Waive or restore the delivery fee for an order (issue #382).
 * Calls the waive_delivery_fee edge function (admin role required).
 */

/**
 * Update the delivery charge on a delivery order via the Action API.
 * Pass 0 to waive the fee; pass the original charge to restore it.
 * Requires admin/owner role — enforced server-side.
 */
export async function callUpdateDeliveryCharge(
  supabaseUrl: string,
  accessToken: string,
  orderId: string,
  deliveryChargeCents: number,
): Promise<void> {
  const res = await fetch(`${supabaseUrl}/functions/v1/waive_delivery_fee`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ order_id: orderId, delivery_charge_cents: deliveryChargeCents }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    let message = `Failed to update delivery charge: ${res.status}`
    try {
      const json = JSON.parse(body) as { error?: string }
      if (json.error) message = json.error
    } catch { /* ignore */ }
    throw new Error(message)
  }
}
