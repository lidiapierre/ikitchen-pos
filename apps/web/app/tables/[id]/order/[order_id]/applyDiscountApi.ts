export interface ApplyDiscountResponse {
  success: boolean
  data?: { discount_amount_cents: number }
  error?: string
}

export async function callApplyDiscount(
  supabaseUrl: string,
  accessToken: string,
  orderId: string,
  discountType: 'percent' | 'flat',
  discountValue: number,
): Promise<{ discount_amount_cents: number }> {
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ''
  const res = await fetch(`${supabaseUrl}/functions/v1/apply_discount`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      order_id: orderId,
      discount_type: discountType,
      discount_value: discountValue,
    }),
  })
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`)
  }
  const json = (await res.json()) as ApplyDiscountResponse
  if (!json.success) {
    throw new Error(json.error ?? 'Failed to apply discount')
  }
  return { discount_amount_cents: json.data?.discount_amount_cents ?? 0 }
}
