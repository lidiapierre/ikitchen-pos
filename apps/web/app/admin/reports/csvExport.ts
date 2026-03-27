import type { ReportData, ReportPeriod } from './reportsApi'
import { formatPrice, DEFAULT_CURRENCY_SYMBOL } from '@/lib/formatPrice'

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

function escapeCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  // Wrap in quotes if it contains comma, quote, or newline
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function buildCSV(headers: string[], rows: Array<Array<string | number | null | undefined>>): string {
  const lines: string[] = [headers.map(escapeCell).join(',')]
  for (const row of rows) {
    lines.push(row.map(escapeCell).join(','))
  }
  return lines.join('\n')
}

export function downloadCSV(csvContent: string, filename: string): void {
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

// ---------------------------------------------------------------------------
// Filename helpers
// ---------------------------------------------------------------------------

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

export function makeFilename(section: string, period: ReportPeriod, customFrom?: string, customTo?: string): string {
  const periodLabel =
    period === 'custom' && customFrom && customTo
      ? `${customFrom}_to_${customTo}`
      : period
  return `ikitchen-report-${section}-${periodLabel}-${todayISO()}.csv`
}

// ---------------------------------------------------------------------------
// Per-section export helpers
// ---------------------------------------------------------------------------

export function exportRevenueByDay(data: ReportData, period: ReportPeriod, customFrom?: string, customTo?: string): void {
  const headers = ['Date', 'Order Count', 'Revenue']
  const rows = data.revenue_by_day.map(r => [
    r.date,
    (r as { date: string; revenue_cents: number; order_count?: number }).order_count ?? '',
    formatPrice(r.revenue_cents, DEFAULT_CURRENCY_SYMBOL),
  ])
  downloadCSV(buildCSV(headers, rows), makeFilename('revenue-by-day', period, customFrom, customTo))
}

export function exportTopItems(data: ReportData, period: ReportPeriod, customFrom?: string, customTo?: string): void {
  const headers = ['Rank', 'Item', 'Qty Sold', 'Revenue']
  const rows = data.top_items.map((item, idx) => [
    idx + 1,
    item.name,
    item.quantity_sold,
    formatPrice(item.revenue_cents, DEFAULT_CURRENCY_SYMBOL),
  ])
  downloadCSV(buildCSV(headers, rows), makeFilename('top-items', period, customFrom, customTo))
}

export function exportPaymentBreakdown(data: ReportData, period: ReportPeriod, customFrom?: string, customTo?: string): void {
  const headers = ['Payment Method', 'Order Count', 'Revenue']
  const rows = data.payment_breakdown.map(p => [
    p.method,
    p.count,
    formatPrice(p.revenue_cents, DEFAULT_CURRENCY_SYMBOL),
  ])
  downloadCSV(buildCSV(headers, rows), makeFilename('payment-breakdown', period, customFrom, customTo))
}

export function exportCompDetail(data: ReportData, period: ReportPeriod, customFrom?: string, customTo?: string): void {
  if (!data.comp_detail) return
  const headers = ['Date', 'Type', 'Item', 'Qty', 'Unit Price', 'Total Value', 'Reason', 'Authorised By']
  const rows = data.comp_detail.items.map(item => [
    item.date.slice(0, 10),
    item.type,
    item.item_name,
    item.quantity,
    formatPrice(item.unit_price_cents, DEFAULT_CURRENCY_SYMBOL),
    formatPrice(item.total_value_cents, DEFAULT_CURRENCY_SYMBOL),
    item.reason ?? '',
    item.authorised_by ?? '',
  ])
  downloadCSV(buildCSV(headers, rows), makeFilename('comp-detail', period, customFrom, customTo))
}

// ---------------------------------------------------------------------------
// Full order list (data comes from export_orders edge function)
// ---------------------------------------------------------------------------

export interface ExportOrderRow {
  order_id: string
  table_label: string | null
  created_at: string
  final_total_cents: number
  payment_methods: string
  discount_amount_cents: number
  order_comp: boolean
}

export function exportOrderList(
  orders: ExportOrderRow[],
  period: ReportPeriod,
  customFrom?: string,
  customTo?: string,
): void {
  const headers = ['Order ID', 'Table', 'Date', 'Total', 'Payment Method', 'Discount', 'Comp']
  const rows = orders.map(o => [
    o.order_id,
    o.table_label ?? '',
    o.created_at.slice(0, 19).replace('T', ' '),
    formatPrice(o.final_total_cents, DEFAULT_CURRENCY_SYMBOL),
    o.payment_methods,
    o.discount_amount_cents > 0 ? formatPrice(o.discount_amount_cents, DEFAULT_CURRENCY_SYMBOL) : '',
    o.order_comp ? 'Yes' : 'No',
  ])
  downloadCSV(buildCSV(headers, rows), makeFilename('orders', period, customFrom, customTo))
}
