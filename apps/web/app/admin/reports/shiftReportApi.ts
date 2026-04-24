/** API types and fetch helper for the shift close report (issue #449). */

export interface ShiftReportData {
  /** UTC ISO datetime strings for the queried range */
  from: string
  to: string

  /** Orders summary */
  total_orders: number
  total_covers: number
  avg_order_value_cents: number

  /** Sales breakdown (all in cents) */
  gross_sales_cents: number
  discounts_cents: number
  complimentary_cents: number
  net_sales_cents: number

  /** VAT summary (all in cents) */
  subtotal_excl_vat_cents: number
  vat_amount_cents: number
  total_incl_vat_cents: number

  /** Payment method breakdown (all in cents) */
  cash_cents: number
  card_cents: number
  mobile_cents: number
  other_cents: number
  total_collected_cents: number
}

interface GetShiftReportResponse {
  success: boolean
  data?: ShiftReportData
  error?: string
}

/** Fetch shift report data from the get_shift_report edge function. */
export async function callGetShiftReport(
  supabaseUrl: string,
  accessToken: string,
  from: string,
  to: string,
): Promise<ShiftReportData> {
  const res = await fetch(`${supabaseUrl}/functions/v1/get_shift_report`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ from, to }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`get_shift_report failed: ${res.status} ${res.statusText} — ${text}`)
  }

  const json = (await res.json()) as GetShiftReportResponse
  if (!json.success || !json.data) {
    throw new Error(json.error ?? 'Failed to fetch shift report')
  }
  return json.data
}
