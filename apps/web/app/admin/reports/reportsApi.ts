export interface ReportSummary {
  total_revenue_cents: number
  order_count: number
  avg_order_cents: number
  total_covers: number
}

export interface RevenueByDay {
  date: string
  revenue_cents: number
}

export interface TopItem {
  name: string
  quantity_sold: number
  revenue_cents: number
}

export interface PaymentBreakdown {
  method: string
  count: number
  revenue_cents: number
}

export interface DiscountSummary {
  discount_order_count: number
  total_discount_cents: number
  comp_order_count: number
}

export interface ReportData {
  summary: ReportSummary
  revenue_by_day: RevenueByDay[]
  top_items: TopItem[]
  payment_breakdown: PaymentBreakdown[]
  discount_summary: DiscountSummary
}

interface GetReportsResponse {
  success: boolean
  data?: ReportData
  error?: string
}

export type ReportPeriod = 'today' | 'week' | 'month' | 'custom'

export async function callGetReports(
  supabaseUrl: string,
  accessToken: string,
  period: ReportPeriod,
  from?: string,
  to?: string,
): Promise<ReportData> {
  const body: { period: ReportPeriod; from?: string; to?: string } = { period }
  if (period === 'custom' && from && to) {
    body.from = from
    body.to = to
  }

  const res = await fetch(`${supabaseUrl}/functions/v1/get_reports`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`get_reports failed: ${res.status} ${res.statusText} — ${text}`)
  }

  const json = (await res.json()) as GetReportsResponse
  if (!json.success || !json.data) {
    throw new Error(json.error ?? 'Failed to fetch reports')
  }
  return json.data
}
