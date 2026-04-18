export interface CloseOrderResponse {
  success: boolean
  data?: {
    final_total_cents: number
    service_charge_cents: number
    /** VAT amount (cents) stored by close_order — 0 for tax-inclusive or when no VAT rate is configured. */
    vat_cents: number
    /** VAT rate (%) used to compute vat_cents — 0 when not applicable or idempotent early-return. */
    vat_percent: number
    bill_number: string | null
  }
  error?: string
}

export async function callCloseOrder(
  supabaseUrl: string,
  accessToken: string,
  orderId: string,
): Promise<{ billNumber: string | null; vatCents: number; vatPercent: number; serviceChargeCents: number }> {
  const res = await fetch(`${supabaseUrl}/functions/v1/close_order`, {
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
    if (res.status === 409) {
      throw new Error('Order is no longer open — it may have already been closed')
    }
    throw new Error(errMsg)
  }
  const json = (await res.json()) as CloseOrderResponse
  if (!json.success) {
    throw new Error(json.error ?? 'Failed to close order')
  }
  return {
    billNumber: json.data?.bill_number ?? null,
    vatCents: json.data?.vat_cents ?? 0,
    vatPercent: json.data?.vat_percent ?? 0,
    serviceChargeCents: json.data?.service_charge_cents ?? 0,
  }
}
