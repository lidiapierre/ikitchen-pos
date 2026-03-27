export interface ApplyItemDiscountResponse {
  success: boolean
  data?: {
    item_discount_type: 'percent' | 'fixed'
    item_discount_value: number
    discount_amount_cents: number
  }
  error?: string
}

/**
 * Apply a per-item discount to an order item.
 *
 * @param discountType  'percent' | 'fixed'
 * @param discountValue For 'percent': the percentage (e.g. 10 for 10%).
 *                      For 'fixed': the BDT amount (e.g. 50 for ৳50).
 *                      The edge function stores both as value * 100.
 */
export async function callApplyItemDiscount(
  supabaseUrl: string,
  accessToken: string,
  orderItemId: string,
  discountType: 'percent' | 'fixed',
  discountValue: number,
): Promise<{
  item_discount_type: 'percent' | 'fixed'
  item_discount_value: number
  discount_amount_cents: number
}> {
  const res = await fetch(`${supabaseUrl}/functions/v1/apply_item_discount`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      order_item_id: orderItemId,
      discount_type: discountType,
      discount_value: discountValue,
    }),
  })
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`)
  }
  const json = (await res.json()) as ApplyItemDiscountResponse
  if (!json.success) {
    throw new Error(json.error ?? 'Failed to apply item discount')
  }
  return {
    item_discount_type: json.data?.item_discount_type ?? discountType,
    item_discount_value: json.data?.item_discount_value ?? 0,
    discount_amount_cents: json.data?.discount_amount_cents ?? 0,
  }
}
