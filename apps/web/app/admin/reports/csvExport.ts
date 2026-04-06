import type { ReportData, ReportPeriod } from './reportsApi'
import { formatPrice, DEFAULT_CURRENCY_SYMBOL } from '@/lib/formatPrice'
import { formatDateTime, isoDateToDDMMYYYY } from '@/lib/dateFormat'

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
    isoDateToDDMMYYYY(r.date),
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
    isoDateToDDMMYYYY(item.date),
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
// Accounting export — per-day financial summary CSV
// ---------------------------------------------------------------------------

/**
 * Exports a per-day accounting CSV with revenue broken down by payment method.
 * Payment method totals are available only at the aggregate level from the
 * reports API, so per-day values are proportionally distributed from the
 * aggregate. Where a single day is selected the values are exact.
 */
export function exportAccountingCSV(
  data: ReportData,
  period: ReportPeriod,
  customFrom?: string,
  customTo?: string,
): void {
  const headers = [
    'date',
    'total_orders',
    'total_revenue_cents',
    'cash_revenue_cents',
    'card_revenue_cents',
    'comp_revenue_cents',
    'vat_collected_cents',
    'service_charge_cents',
    'net_revenue_cents',
  ]

  // Build payment-method lookup from aggregate breakdown
  const paymentMap: Record<string, number> = {}
  for (const p of data.payment_breakdown) {
    paymentMap[p.method.toLowerCase()] = p.revenue_cents
  }

  const totalRevenueCents = data.summary.total_revenue_cents
  const totalServiceCharge = data.summary.total_service_charge_cents ?? 0
  const totalComp = data.comp_detail?.total_comp_value_cents ?? 0

  // Aggregate cash / card (sum everything that is not 'comp')
  const cashRevenue = paymentMap['cash'] ?? 0
  const cardRevenue =
    Object.entries(paymentMap)
      .filter(([method]) => method !== 'cash' && method !== 'comp')
      .reduce((sum, [, v]) => sum + v, 0)

  const rows = data.revenue_by_day.map(day => {
    const proportion = totalRevenueCents > 0 ? day.revenue_cents / totalRevenueCents : 0
    const dayCash = Math.round(cashRevenue * proportion)
    const dayCard = Math.round(cardRevenue * proportion)
    const dayComp = Math.round(totalComp * proportion)
    const daySvc = Math.round(totalServiceCharge * proportion)
    // VAT is not tracked in the current data model
    const dayVat = 0
    const dayNet = day.revenue_cents - daySvc - dayVat

    return [
      isoDateToDDMMYYYY(day.date),
      (day as { date: string; revenue_cents: number; order_count?: number }).order_count ?? '',
      day.revenue_cents,
      dayCash,
      dayCard,
      dayComp,
      dayVat,
      daySvc,
      dayNet,
    ]
  })

  downloadCSV(buildCSV(headers, rows), makeFilename('accounting', period, customFrom, customTo))
}

// ---------------------------------------------------------------------------
// Daily summary — human-readable text export
// ---------------------------------------------------------------------------

function pad(str: string, len: number): string {
  return str.length >= len ? str : str + ' '.repeat(len - str.length)
}

/**
 * Exports a human-readable financial summary for the selected period as a
 * plain-text file (.txt). Covers total sales, payment breakdown, top 5 items,
 * discounts & comps, and average order value.
 */
export function exportDailySummary(
  data: ReportData,
  period: ReportPeriod,
  customFrom?: string,
  customTo?: string,
): void {
  const periodLabel =
    period === 'custom' && customFrom && customTo
      ? `${customFrom} to ${customTo}`
      : period.charAt(0).toUpperCase() + period.slice(1)

  const divider = '─'.repeat(44)

  const lines: string[] = [
    'iKitchen POS — Financial Summary',
    divider,
    `Period   : ${periodLabel}`,
    `Generated: ${formatDateTime(new Date().toISOString())}`,
    '',
    'SALES OVERVIEW',
    divider,
    `${pad('Total Revenue:', 22)} ${formatPrice(data.summary.total_revenue_cents, DEFAULT_CURRENCY_SYMBOL)}`,
    `${pad('Total Orders:', 22)} ${data.summary.order_count}`,
    `${pad('Avg Order Value:', 22)} ${formatPrice(data.summary.avg_order_cents, DEFAULT_CURRENCY_SYMBOL)}`,
    `${pad('Total Covers:', 22)} ${data.summary.total_covers}`,
  ]

  if ((data.summary.total_service_charge_cents ?? 0) > 0) {
    lines.push(
      `${pad('Service Charge:', 22)} ${formatPrice(data.summary.total_service_charge_cents, DEFAULT_CURRENCY_SYMBOL)}`,
    )
  }

  lines.push('', 'PAYMENT BREAKDOWN', divider)
  if (data.payment_breakdown.length === 0) {
    lines.push('  No payment data')
  } else {
    for (const p of data.payment_breakdown) {
      const label = p.method.charAt(0).toUpperCase() + p.method.slice(1)
      lines.push(
        `${pad(label + ':', 22)} ${formatPrice(p.revenue_cents, DEFAULT_CURRENCY_SYMBOL).padStart(12)}  (${p.count} orders)`,
      )
    }
  }

  lines.push('', 'TOP 5 ITEMS', divider)
  const top5 = data.top_items.slice(0, 5)
  if (top5.length === 0) {
    lines.push('  No item data')
  } else {
    top5.forEach((item, idx) => {
      const rank = `${idx + 1}.`
      const name = pad(item.name, 28)
      lines.push(`  ${rank.padEnd(4)}${name}  ${String(item.quantity_sold).padStart(4)} qty  ${formatPrice(item.revenue_cents, DEFAULT_CURRENCY_SYMBOL)}`)
    })
  }

  if (data.comp_detail || data.discount_summary.discount_order_count > 0) {
    lines.push('', 'COMPS & DISCOUNTS', divider)
    if (data.comp_detail) {
      lines.push(
        `${pad('Total Comp Value:', 22)} ${formatPrice(data.comp_detail.total_comp_value_cents, DEFAULT_CURRENCY_SYMBOL)}`,
        `${pad('  Item comps:', 22)} ${formatPrice(data.comp_detail.comp_item_value_cents, DEFAULT_CURRENCY_SYMBOL)}`,
        `${pad('  Order comps:', 22)} ${formatPrice(data.comp_detail.comp_order_value_cents, DEFAULT_CURRENCY_SYMBOL)}`,
      )
    }
    if (data.discount_summary.discount_order_count > 0) {
      lines.push(
        `${pad('Discounted Orders:', 22)} ${data.discount_summary.discount_order_count}`,
        `${pad('Total Discounts:', 22)} ${formatPrice(data.discount_summary.total_discount_cents, DEFAULT_CURRENCY_SYMBOL)}`,
      )
    }
  }

  lines.push('', divider, 'Generated by iKitchen POS')

  const content = lines.join('\n')
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = makeFilename('daily-summary', period, customFrom, customTo).replace('.csv', '.txt')
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
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
    formatDateTime(o.created_at),
    formatPrice(o.final_total_cents, DEFAULT_CURRENCY_SYMBOL),
    o.payment_methods,
    o.discount_amount_cents > 0 ? formatPrice(o.discount_amount_cents, DEFAULT_CURRENCY_SYMBOL) : '',
    o.order_comp ? 'Yes' : 'No',
  ])
  downloadCSV(buildCSV(headers, rows), makeFilename('orders', period, customFrom, customTo))
}
