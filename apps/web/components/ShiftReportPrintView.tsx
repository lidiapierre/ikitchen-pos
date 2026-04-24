/**
 * ShiftReportPrintView — 80mm thermal print component for the shift close report.
 *
 * Rendered hidden in the DOM (print:block) like BillPrintView / SplitBillPrintView.
 * The parent wraps this in a `.print-area` container so global print CSS applies.
 *
 * Issue #449 — printable shift close report.
 */

import type { JSX } from 'react'
import { formatPrice, DEFAULT_CURRENCY_SYMBOL } from '@/lib/formatPrice'
import type { ShiftReportData } from '@/app/admin/reports/shiftReportApi'

export interface ShiftReportPrintViewProps {
  data: ShiftReportData
  restaurantName: string
  /** Display name of the staff member who triggered the print. */
  printedBy: string
  /** ISO string of when the print was triggered. */
  printedAt: string
  /** Human-readable "from" label (local time). */
  fromLabel: string
  /** Human-readable "to" label (local time). */
  toLabel: string
}

/** Thin separator line used between report sections. */
function Dashes(): JSX.Element {
  return <p className="text-center tracking-widest">{'- '.repeat(20)}</p>
}

/** A key/value row on the thermal receipt. */
function Row({ label, value, bold = false }: { label: string; value: string; bold?: boolean }): JSX.Element {
  return (
    <div className={['flex justify-between text-xs leading-snug', bold ? 'font-bold' : ''].join(' ').trim()}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  )
}

/** Section header — centred, separated by dashes. */
function SectionHeader({ title }: { title: string }): JSX.Element {
  return (
    <div className="text-center my-1">
      <p className="font-semibold text-xs uppercase tracking-wide">{title}</p>
    </div>
  )
}

export default function ShiftReportPrintView({
  data,
  restaurantName,
  printedBy,
  printedAt,
  fromLabel,
  toLabel,
}: ShiftReportPrintViewProps): JSX.Element {
  const sym = DEFAULT_CURRENCY_SYMBOL
  const fmt = (cents: number): string => formatPrice(cents, sym)

  return (
    <div
      aria-hidden="true"
      className="hidden print:block font-mono text-black bg-white p-2 w-full text-xs"
    >
      {/* ---- HEADER ---- */}
      <div className="text-center mb-1">
        {restaurantName && (
          <p className="font-bold text-sm">{restaurantName}</p>
        )}
        <p className="font-semibold">SHIFT CLOSE REPORT</p>
      </div>

      <div className="space-y-0.5 mb-1">
        <Row label="From" value={fromLabel} />
        <Row label="To" value={toLabel} />
        <Row label="Printed By" value={printedBy} />
        <Row label="Printed At" value={printedAt} />
      </div>

      <Dashes />

      {/* ---- ORDERS SUMMARY ---- */}
      <SectionHeader title="Orders Summary" />
      <div className="space-y-0.5 mb-1">
        <Row label="Total Orders" value={String(data.total_orders)} />
        <Row label="Total Covers" value={String(data.total_covers)} />
        <Row label="Avg Order Value" value={fmt(data.avg_order_value_cents)} />
      </div>

      <Dashes />

      {/* ---- SALES BREAKDOWN ---- */}
      <SectionHeader title="Sales Breakdown" />
      <div className="space-y-0.5 mb-1">
        <Row label="Gross Sales" value={fmt(data.gross_sales_cents)} />
        {data.discounts_cents > 0 && (
          <Row label="Discounts" value={`-${fmt(data.discounts_cents)}`} />
        )}
        {data.complimentary_cents > 0 && (
          <Row label="Complimentary" value={`-${fmt(data.complimentary_cents)}`} />
        )}
        <Row label="Net Sales" value={fmt(data.net_sales_cents)} bold />
      </div>

      <Dashes />

      {/* ---- VAT SUMMARY ---- */}
      <SectionHeader title="VAT Summary" />
      <div className="space-y-0.5 mb-1">
        <Row label="Subtotal (excl. VAT)" value={fmt(data.subtotal_excl_vat_cents)} />
        <Row label="VAT" value={fmt(data.vat_amount_cents)} />
        <Row label="Total (incl. VAT)" value={fmt(data.total_incl_vat_cents)} bold />
      </div>

      <Dashes />

      {/* ---- PAYMENT METHOD BREAKDOWN ---- */}
      <SectionHeader title="Payment Methods" />
      <div className="space-y-0.5 mb-1">
        {data.cash_cents > 0 && (
          <Row label="Cash" value={fmt(data.cash_cents)} />
        )}
        {data.card_cents > 0 && (
          <Row label="Card / POS" value={fmt(data.card_cents)} />
        )}
        {data.mobile_cents > 0 && (
          <Row label="Mobile" value={fmt(data.mobile_cents)} />
        )}
        {data.other_cents > 0 && (
          <Row label="Other" value={fmt(data.other_cents)} />
        )}
        {data.complimentary_cents > 0 && (
          <Row label="Complimentary" value={fmt(data.complimentary_cents)} />
        )}
        <Row label="Total Collected" value={fmt(data.total_collected_cents)} bold />
      </div>

      {/* ---- FOOTER ---- */}
      <Dashes />
      <p className="text-center font-semibold mt-1">End of Shift Report</p>
    </div>
  )
}
