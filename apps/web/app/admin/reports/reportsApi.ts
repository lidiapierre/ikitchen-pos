export interface ReportSummary {
  total_revenue_cents: number
  order_count: number
  avg_order_cents: number
  total_covers: number
  total_service_charge_cents: number
}

export interface RevenueByDay {
  date: string
  revenue_cents: number
  order_count?: number
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

export interface CompDetailItem {
  type: 'item' | 'order'
  item_name: string
  quantity: number
  unit_price_cents: number
  total_value_cents: number
  reason: string | null
  authorised_by: string | null
  date: string
}

export interface CompByItem {
  item_name: string
  quantity: number
  total_value_cents: number
  count: number
}

export interface CompDetail {
  items: CompDetailItem[]
  total_comp_value_cents: number
  comp_item_value_cents: number
  comp_order_value_cents: number
  top_comped_items: CompByItem[]
}

export interface StaffPerformanceRow {
  server_id: string
  staff_name: string
  role: string
  total_orders: number
  total_revenue_cents: number
  avg_ticket_cents: number
}

export interface ReportData {
  summary: ReportSummary
  revenue_by_day: RevenueByDay[]
  top_items: TopItem[]
  payment_breakdown: PaymentBreakdown[]
  discount_summary: DiscountSummary
  comp_detail?: CompDetail
  staff_performance?: StaffPerformanceRow[]
}

interface GetReportsResponse {
  success: boolean
  data?: ReportData
  error?: string
}

export type ReportPeriod = 'today' | 'week' | 'month' | 'custom'

export interface ExportOrderRow {
  order_id: string
  table_label: string | null
  created_at: string
  final_total_cents: number
  payment_methods: string
  discount_amount_cents: number
  order_comp: boolean
}

interface ExportOrdersResponse {
  success: boolean
  data?: ExportOrderRow[]
  error?: string
}

export async function callExportOrders(
  supabaseUrl: string,
  accessToken: string,
  period: ReportPeriod,
  from?: string,
  to?: string,
  restaurantId?: string,
): Promise<ExportOrderRow[]> {
  const body: { period: ReportPeriod; from?: string; to?: string; restaurant_id?: string } = { period }
  if (period === 'custom' && from && to) {
    body.from = from
    body.to = to
  }
  if (restaurantId) {
    body.restaurant_id = restaurantId
  }

  const res = await fetch(`${supabaseUrl}/functions/v1/export_orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`export_orders failed: ${res.status} ${res.statusText} — ${text}`)
  }

  const json = (await res.json()) as ExportOrdersResponse
  if (!json.success || !json.data) {
    throw new Error(json.error ?? 'Failed to export orders')
  }
  return json.data
}

export async function callGetReports(
  supabaseUrl: string,
  accessToken: string,
  period: ReportPeriod,
  from?: string,
  to?: string,
  restaurantId?: string,
): Promise<ReportData> {
  const body: { period: ReportPeriod; from?: string; to?: string; restaurant_id?: string } = { period }
  if (period === 'custom' && from && to) {
    body.from = from
    body.to = to
  }
  if (restaurantId) {
    body.restaurant_id = restaurantId
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
