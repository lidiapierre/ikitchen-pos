'use client'

/**
 * Receipts / Bill History client component — issue #395.
 *
 * Staff (server/kitchen): shows receipts from current shift only, filtered by their user ID.
 * Admin (owner/manager): full history with date range filter, daily total summary.
 * Both roles: per-entry re-print action using existing BillPrintView.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import type { JSX } from 'react'
import { Receipt, Printer, ChevronDown, ChevronUp, Search, RefreshCw, CalendarDays } from 'lucide-react'
import { useUser } from '@/lib/user-context'
import { supabase } from '@/lib/supabase'
import {
  fetchBillHistory,
  fetchOrderForReprint,
  fetchRestaurantConfig,
} from './billHistoryApi'
import type {
  BillHistoryOrder,
  ReprintOrderData,
  RestaurantConfig,
} from './billHistoryApi'
import { formatPrice } from '@/lib/formatPrice'
import { formatDateTime, formatDate } from '@/lib/dateFormat'
import { PAYMENT_METHOD_LABELS } from '@/lib/paymentMethods'
import type { PaymentMethod } from '@/lib/paymentMethods'
import BillPrintView from '@/components/BillPrintView'
import type { SplitPaymentLine } from '@/components/BillPrintView'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const STORAGE_KEY = 'ikitchen_active_shift'

interface ShiftData {
  shift_id: string
  started_at: string
}

function loadShiftFromStorage(): ShiftData | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as ShiftData) : null
  } catch {
    return null
  }
}

function getTodayIso(): string {
  // Use local date (consistent with billHistoryApi.ts localDayRange)
  return new Date().toLocaleDateString('en-CA')
}

/** Format ISO as HH:mm for compact time-only display */
function timeOnly(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/**
 * Compute the displayed subtotal for BillPrintView (items total before order-level discount).
 * Uses rawSubtotalCents from ReprintOrderData (= final_total_cents from DB: items after per-item
 * discounts, before order-level discount / SC / VAT).
 * For tax-inclusive VAT, the subtotal is the net (ex-VAT) amount.
 */
function computeSubtotal(data: ReprintOrderData, vatPercent: number, taxInclusive: boolean): number {
  // rawSubtotalCents = sum of (qty × price - per-item discount) for non-comp items
  const itemsTotal = data.rawSubtotalCents

  if (taxInclusive && vatPercent > 0) {
    return Math.round(itemsTotal / (1 + vatPercent / 100))
  }
  return itemsTotal
}

/** Re-print modal — loads order data lazily and triggers window.print() */
function ReprintModal({
  order,
  config,
  accessToken,
  onClose,
}: {
  order: BillHistoryOrder
  config: RestaurantConfig
  accessToken: string
  onClose: () => void
}): JSX.Element {
  const [data, setData] = useState<ReprintOrderData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [printed, setPrinted] = useState(false)
  const printRef = useRef<HTMLDivElement>(null)
  const printGuardRef = useRef(false)
  const titleId = 'reprint-modal-title'

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  useEffect(() => {
    let cancelled = false
    async function load(): Promise<void> {
      try {
        const d = await fetchOrderForReprint(SUPABASE_URL, accessToken, order.id)
        if (!cancelled) setData(d)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load receipt')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [order.id, accessToken])

  function handlePrint(): void {
    if (printGuardRef.current) return
    printGuardRef.current = true
    setPrinted(true)
    // Allow hidden div to render, then print
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.print()
        printGuardRef.current = false
      })
    })
  }

  if (loading) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Loading receipt"
        className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      >
        <div className="bg-brand-navy rounded-2xl p-8 flex flex-col items-center gap-4 min-w-[260px]">
          <RefreshCw className="w-8 h-8 text-brand-gold animate-spin" />
          <p className="text-white">Loading receipt…</p>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Receipt error"
        className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      >
        <div className="bg-brand-navy rounded-2xl p-8 flex flex-col items-center gap-4 min-w-[280px]">
          <p className="text-red-400 text-sm text-center">{error ?? 'Failed to load receipt'}</p>
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2 rounded-xl bg-brand-blue text-white hover:bg-brand-blue/80 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    )
  }

  const subtotalCents = computeSubtotal(data, config.vatPercent, config.taxInclusive)
  // Build splitPayments for BillPrintView: include ALL payments (single or multi) so the
  // receipt always shows a per-method labelled breakdown, consistent with the live-payment
  // success screen fix in OrderDetailClient (issue #391).
  const splitPayments: SplitPaymentLine[] | undefined =
    data.payments.length > 0
      ? data.payments.map((p) => ({ method: p.method as PaymentMethod, amountCents: p.amount_cents }))
      : undefined

  const singlePayment = data.payments[0]
  // amountTenderedCents: physical cash handed over by the customer (for single-cash receipt)
  const cashTendered = singlePayment?.method === 'cash' ? (singlePayment.tendered_amount_cents ?? singlePayment.amount_cents) : undefined
  // changeDue: sum of all tendered amounts minus bill total — only non-zero when cash is involved
  const hasCash = data.payments.some((p) => p.method === 'cash')
  const totalTendered = data.payments.reduce((sum, p) => sum + (p.tendered_amount_cents ?? p.amount_cents), 0)
  const changeDue = hasCash && totalTendered > data.finalTotalCents
    ? totalTendered - data.finalTotalCents
    : undefined

  const billTimestamp = formatDateTime(data.createdAt)

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
    >
      {/* Hidden print area — only visible during window.print() */}
      <div ref={printRef} aria-hidden="true">
        <BillPrintView
          tableLabel={data.tableLabel}
          orderId={order.id}
          items={data.items}
          subtotalCents={subtotalCents}
          vatPercent={config.vatPercent}
          taxInclusive={config.taxInclusive}
          vatCents={data.vatCents}
          totalCents={data.finalTotalCents}
          paymentMethod={(singlePayment?.method ?? 'cash') as PaymentMethod}
          amountTenderedCents={cashTendered}
          changeDueCents={changeDue}
          splitPayments={splitPayments}
          timestamp={billTimestamp}
          discountAmountCents={data.discountAmountCents}
          orderComp={data.orderComp}
          serviceChargeCents={data.serviceChargeCents}
          serviceChargePercent={0}
          orderType={data.orderType}
          customerName={data.customerName}
          deliveryNote={data.deliveryNote}
          customerMobile={data.customerMobile}
          restaurantName={config.restaurantName}
          restaurantAddress={config.restaurantAddress}
          binNumber={config.binNumber}
          billNumber={data.billNumber ?? undefined}
          locationName={config.locationName}
          registerName={config.registerName}
          orderNumber={data.orderNumber}
          deliveryChargeCents={data.deliveryCharge}
          deliveryZoneName={data.deliveryZoneName ?? undefined}
          roundBillTotals={config.roundBillTotals}
        />
      </div>

      {/* Modal UI */}
      <div className="bg-brand-navy rounded-2xl p-6 flex flex-col gap-4 min-w-[300px] max-w-sm mx-4">
        <div className="flex items-center gap-3">
          <Receipt className="w-6 h-6 text-brand-gold" aria-hidden="true" />
          <div>
            <p id={titleId} className="text-white font-semibold">
              {data.billNumber ?? `Order #${data.orderNumber ?? order.id.slice(0, 8)}`}
            </p>
            <p className="text-white/60 text-sm">{billTimestamp}</p>
          </div>
        </div>

        <div className="bg-brand-blue rounded-xl p-3 text-sm space-y-1">
          <div className="flex justify-between text-white/80">
            <span>Table</span>
            <span className="text-white">{data.tableLabel ?? (data.orderType === 'delivery' ? 'Delivery' : 'Takeaway')}</span>
          </div>
          <div className="flex justify-between text-white/80">
            <span>Items</span>
            <span className="text-white">{data.items.length}</span>
          </div>
          <div className="flex justify-between text-white/80">
            <span>Total</span>
            <span className="text-white font-semibold">
              {formatPrice(data.finalTotalCents, config.currencySymbol, config.roundBillTotals)}
            </span>
          </div>
          <div className="flex justify-between text-white/80">
            <span>Payment</span>
            <span className="text-white">
              {data.payments.map((p) => PAYMENT_METHOD_LABELS[p.method] ?? p.method).join(' + ')}
            </span>
          </div>
        </div>

        {printed && (
          <p className="text-brand-gold text-xs text-center">Print dialog opened. Use your browser&apos;s print controls.</p>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-brand-grey text-white/70 hover:text-white hover:border-white transition-colors text-sm"
          >
            Close
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="flex-1 py-2.5 rounded-xl bg-brand-gold text-brand-navy font-semibold hover:bg-brand-gold/80 transition-colors text-sm flex items-center justify-center gap-2"
          >
            <Printer className="w-4 h-4" />
            Re-print
          </button>
        </div>
      </div>
    </div>
  )
}

/** Single receipt row */
function ReceiptRow({
  order,
  currencySymbol,
  roundBillTotals,
  onReprint,
}: {
  order: BillHistoryOrder
  currencySymbol: string
  roundBillTotals: boolean
  onReprint: (order: BillHistoryOrder) => void
}): JSX.Element {
  const [expanded, setExpanded] = useState(false)

  const orderTypeLabel =
    order.order_type === 'delivery' ? 'Delivery' :
    order.order_type === 'takeaway' ? 'Takeaway' : 'Dine In'

  return (
    <div className="bg-white border border-brand-grey rounded-2xl overflow-hidden">
      {/* Main row */}
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Time + Bill # */}
        <div className="w-20 shrink-0">
          <p className="text-sm font-mono font-semibold text-brand-navy">{timeOnly(order.created_at)}</p>
          {order.bill_number && (
            <p className="text-xs text-brand-navy/50 truncate">{order.bill_number}</p>
          )}
        </div>

        {/* Table / type */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-brand-navy truncate">
            {order.order_type === 'dine_in'
              ? (order.table_label ?? 'Table')
              : orderTypeLabel}
            {order.order_comp && (
              <span className="ml-2 text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">COMP</span>
            )}
          </p>
          <p className="text-xs text-brand-navy/60">
            {order.payment_summary}
            {order.server_name && ` · ${order.server_name}`}
          </p>
        </div>

        {/* Total */}
        <div className="text-right shrink-0 mr-2">
          <p className="text-sm font-semibold text-brand-navy">
            {order.order_comp
              ? 'COMP'
              : formatPrice(order.final_total_cents, currencySymbol, roundBillTotals)}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            aria-label="Re-print receipt"
            onClick={() => onReprint(order)}
            className="p-2 rounded-lg text-brand-navy/60 hover:text-brand-navy hover:bg-brand-offwhite transition-colors"
            data-testid="reprint-btn"
          >
            <Printer className="w-4 h-4" />
          </button>
          <button
            type="button"
            aria-label={expanded ? 'Collapse receipt details' : 'Expand receipt details'}
            onClick={() => setExpanded((e) => !e)}
            className="p-2 rounded-lg text-brand-navy/60 hover:text-brand-navy hover:bg-brand-offwhite transition-colors"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-brand-grey bg-brand-offwhite/40 px-4 py-3 text-xs space-y-1.5 text-brand-navy/80">
          <div className="flex justify-between">
            <span>Date &amp; Time</span>
            <span>{formatDateTime(order.created_at)}</span>
          </div>
          <div className="flex justify-between">
            <span>Order Type</span>
            <span>{orderTypeLabel}</span>
          </div>
          {order.order_number != null && (
            <div className="flex justify-between">
              <span>Order #</span>
              <span>#{String(order.order_number).padStart(3, '0')}</span>
            </div>
          )}
          {order.discount_amount_cents > 0 && (
            <div className="flex justify-between">
              <span>Discount</span>
              <span>-{formatPrice(order.discount_amount_cents, currencySymbol, roundBillTotals)}</span>
            </div>
          )}
          {order.payments.length > 0 && (
            <div className="flex justify-between">
              <span>Payment breakdown</span>
              <span>
                {order.payments.map((p) => `${PAYMENT_METHOD_LABELS[p.method] ?? p.method} ${formatPrice(p.amount_cents, currencySymbol, roundBillTotals)}`).join(' | ')}
              </span>
            </div>
          )}
          {order.customer_name && (
            <div className="flex justify-between">
              <span>Customer</span>
              <span>{order.customer_name}</span>
            </div>
          )}
          {order.customer_mobile && (
            <div className="flex justify-between">
              <span>Mobile</span>
              <span>{order.customer_mobile}</span>
            </div>
          )}
          {order.delivery_charge > 0 && (
            <div className="flex justify-between">
              <span>Delivery Charge</span>
              <span>{formatPrice(order.delivery_charge, currencySymbol, roundBillTotals)}</span>
            </div>
          )}
          <div className="pt-1 border-t border-brand-grey flex justify-between font-semibold text-brand-navy">
            <span>Total Paid</span>
            <span>{order.order_comp ? 'COMPLIMENTARY' : formatPrice(order.final_total_cents, currencySymbol, roundBillTotals)}</span>
          </div>
        </div>
      )}
    </div>
  )
}

export default function ReceiptsClient(): JSX.Element {
  const { isAdmin, loading: userLoading, accessToken } = useUser()
  const [orders, setOrders] = useState<BillHistoryOrder[]>([])
  const [totalDailyCents, setTotalDailyCents] = useState(0)
  const [truncated, setTruncated] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [config, setConfig] = useState<RestaurantConfig | null>(null)

  // Filters — controlled inputs (admin date picker / range toggle)
  const [selectedDate, setSelectedDate] = useState(getTodayIso())
  const [fromDate, setFromDate] = useState(getTodayIso())
  const [toDate, setToDate] = useState(getTodayIso())
  const [useRange, setUseRange] = useState(false)

  // Committed params — only updated on Search button click so the load
  // callback doesn't re-fire on every keystroke / date picker change.
  const [committedParams, setCommittedParams] = useState({
    selectedDate: getTodayIso(),
    fromDate: getTodayIso(),
    toDate: getTodayIso(),
    useRange: false,
  })

  // Bill number search — client-side filter applied on top of the loaded orders list.
  // Works for all order types (dine-in, takeaway, delivery).
  const [billSearch, setBillSearch] = useState('')

  // Re-print state
  const [reprintOrder, setReprintOrder] = useState<BillHistoryOrder | null>(null)

  // Current user ID for staff shift filtering (resolved from supabase session)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  // Lazy initialiser reads localStorage once at mount — no useEffect + setState needed.
  // loadShiftFromStorage() already guards against SSR (typeof window check).
  const [shiftData] = useState<ShiftData | null>(() => loadShiftFromStorage())

  const load = useCallback(async () => {
    if (!accessToken) return
    // Guard: non-admin views must wait for currentUserId to resolve
    // before fetching — otherwise the serverId filter is skipped and all
    // restaurant orders would briefly be visible to staff.
    if (!isAdmin && !currentUserId) return
    setLoading(true)
    setError(null)
    try {
      const params: Parameters<typeof fetchBillHistory>[0] = {
        supabaseUrl: SUPABASE_URL,
        accessToken,
      }

      if (!isAdmin) {
        // Staff: filter to their own orders, on the shift date
        if (currentUserId) params.serverId = currentUserId
        if (shiftData) {
          // Convert UTC ISO timestamp to local date — avoids off-by-one for UTC+N restaurants
          params.date = new Date(shiftData.started_at).toLocaleDateString('en-CA')
        } else {
          params.date = getTodayIso()
        }
      } else {
        // Admin: use committed params so the load only fires on explicit Search,
        // not on every date input change.
        if (committedParams.useRange) {
          params.from = committedParams.fromDate
          params.to = committedParams.toDate
        } else {
          params.date = committedParams.selectedDate
        }
      }

      const result = await fetchBillHistory(params)
      setOrders(result.orders)
      setTotalDailyCents(result.total_daily_cents)
      setTruncated(result.truncated)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load receipts')
    } finally {
      setLoading(false)
    }
  }, [accessToken, isAdmin, currentUserId, shiftData, committedParams])

  // Resolve current user ID for staff shift filtering.
  // Must resolve before non-admin fetches fire (the load guard checks this).
  useEffect(() => {
    async function fetchUserId(): Promise<void> {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setError('Could not identify the current user. Please log out and back in.')
        return
      }
      setCurrentUserId(user.id)
    }
    void fetchUserId()
  }, [])

  // Load config once
  useEffect(() => {
    if (!accessToken) return
    fetchRestaurantConfig(SUPABASE_URL, accessToken)
      .then((c) => setConfig(c))
      .catch(() => {/* non-fatal */})
  }, [accessToken])

  // Initial load
  useEffect(() => {
    if (userLoading) return
    void load()
  }, [load, userLoading])

  const currencySymbol = config?.currencySymbol ?? '৳'
  const roundBillTotals = config?.roundBillTotals ?? false

  // Client-side bill-number filter — applied after the server fetch.
  // Trims whitespace and matches case-insensitively anywhere in bill_number.
  // An empty search shows all loaded orders (no network round-trip needed).
  // useMemo avoids re-running .filter() on renders triggered by unrelated state
  // (e.g. reprintOrder modal toggling).
  const billSearchTrimmed = billSearch.trim().toUpperCase()
  const filteredOrders = useMemo(
    () => billSearchTrimmed
      ? orders.filter((o) => (o.bill_number ?? '').toUpperCase().includes(billSearchTrimmed))
      : orders,
    [orders, billSearchTrimmed],
  )

  if (userLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <RefreshCw className="w-8 h-8 text-brand-gold animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-brand-offwhite">
      {/* Header */}
      <div className="bg-brand-navy border-b border-brand-blue px-4 py-4">
        <div className="max-w-3xl mx-auto flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <Receipt className="w-6 h-6 text-brand-gold" aria-hidden="true" />
            <h1 className="text-xl font-bold text-white font-heading">
              {isAdmin ? 'Bill History' : 'Shift Receipts'}
            </h1>
          </div>

          {/* Admin filters */}
          {isAdmin && (
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-white/70 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={useRange}
                  onChange={(e) => setUseRange(e.target.checked)}
                  className="rounded"
                />
                Date range
              </label>

              {!useRange ? (
                <div className="flex items-center gap-2">
                  <CalendarDays className="w-4 h-4 text-brand-gold" aria-hidden="true" />
                  <input
                    type="date"
                    value={selectedDate}
                    max={getTodayIso()}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="bg-brand-blue text-white border border-brand-grey rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-brand-gold"
                  />
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <CalendarDays className="w-4 h-4 text-brand-gold" aria-hidden="true" />
                  <input
                    type="date"
                    value={fromDate}
                    max={toDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    className="bg-brand-blue text-white border border-brand-grey rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-brand-gold"
                  />
                  <span className="text-white/60 text-sm">to</span>
                  <input
                    type="date"
                    value={toDate}
                    min={fromDate}
                    max={getTodayIso()}
                    onChange={(e) => setToDate(e.target.value)}
                    className="bg-brand-blue text-white border border-brand-grey rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-brand-gold"
                  />
                </div>
              )}

              <button
                type="button"
                onClick={() => {
                  // Commit the current date inputs so load re-fires via useEffect([load]).
                  // Do NOT call load() directly here — committedParams hasn't updated yet
                  // (React batches the setState, so load() would see the stale values).
                  setCommittedParams({ selectedDate, fromDate, toDate, useRange })
                }}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-brand-gold text-brand-navy font-semibold text-sm hover:bg-brand-gold/80 transition-colors disabled:opacity-50"
              >
                <Search className="w-4 h-4" />
                Search
              </button>
            </div>
          )}

          {/* Bill number search — visible to both admin and staff for all order types */}
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-brand-gold shrink-0" aria-hidden="true" />
            <input
              type="search"
              value={billSearch}
              onChange={(e) => setBillSearch(e.target.value)}
              placeholder="Search by bill number…"
              aria-label="Search by bill number"
              className="bg-brand-blue text-white border border-brand-grey rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-brand-gold placeholder:text-white/40 w-52"
            />
            {billSearch && (
              <button
                type="button"
                onClick={() => setBillSearch('')}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center text-white/50 hover:text-white text-sm transition-colors"
                aria-label="Clear bill number search"
              >
                ✕
              </button>
            )}
          </div>

          {/* Staff: show shift info */}
          {!isAdmin && shiftData && (
            <p className="text-white/60 text-sm">
              Shift started: {formatDateTime(shiftData.started_at)}
              {' · '}showing your bills only
            </p>
          )}
          {!isAdmin && !shiftData && (
            <p className="text-white/60 text-sm">Today&apos;s receipts — your orders only</p>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-4 py-4">
        {/* Summary card */}
        {!loading && orders.length > 0 && (
          <div className="bg-white border border-brand-grey rounded-2xl p-4 mb-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-brand-navy/60 uppercase tracking-wide font-medium">
                {isAdmin && !committedParams.useRange
                  ? formatDate(committedParams.selectedDate)
                  : isAdmin
                  ? `${formatDate(committedParams.fromDate)} — ${formatDate(committedParams.toDate)}`
                  : 'Shift Total'}
              </p>
              <p className="text-2xl font-bold text-brand-navy mt-1">
                {formatPrice(totalDailyCents, currencySymbol, roundBillTotals)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-brand-navy/60">
                {billSearchTrimmed
                  ? `${filteredOrders.length} of ${orders.length} bill${orders.length !== 1 ? 's' : ''}`
                  : `${orders.length} bill${orders.length !== 1 ? 's' : ''}`}
              </p>
              <button
                type="button"
                onClick={() => {
                  // Refresh re-runs the SAME (committed) search, not the uncommitted inputs.
                  // Spread into a new object so React sees a state change and load re-fires.
                  setCommittedParams((p) => ({ ...p }))
                }}
                disabled={loading}
                className="mt-1 flex items-center gap-1.5 text-xs text-brand-navy/60 hover:text-brand-navy transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>
        )}

        {/* Truncation warning — shown when daily count exceeds the query limit */}
        {truncated && !loading && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 mb-4 text-amber-800 text-sm flex gap-2">
            <span>⚠️</span>
            <span>
              Only the first 100 receipts are shown. The daily total above may be incomplete.
              Use a narrower date range to see all results.
            </span>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-4 text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center gap-3 py-16 text-brand-navy/50">
            <RefreshCw className="w-8 h-8 animate-spin" />
            <p className="text-sm">Loading receipts…</p>
          </div>
        )}

        {/* Empty state — no receipts loaded at all */}
        {!loading && !error && orders.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-16 text-brand-navy/50">
            <Receipt className="w-12 h-12" />
            <p className="text-base font-medium">No receipts found</p>
            <p className="text-sm text-center">
              {isAdmin
                ? 'No paid orders for the selected date range.'
                : 'No receipts found for your current shift.'}
            </p>
          </div>
        )}

        {/* Empty state — receipts loaded but bill-number filter matches nothing */}
        {!loading && !error && orders.length > 0 && filteredOrders.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-16 text-brand-navy/50">
            <Search className="w-12 h-12" />
            <p className="text-base font-medium">No match</p>
            <p className="text-sm text-center">
              No bill found with number &ldquo;{billSearch.trim()}&rdquo; in the current date range.
            </p>
            <p className="text-xs text-center text-brand-navy/40">
              {isAdmin ? 'Try a different date range if the bill was issued on another day.' : 'The bill may be outside your current shift window.'}
            </p>
            <button
              type="button"
              onClick={() => setBillSearch('')}
              className="text-brand-gold text-sm hover:underline"
            >
              Clear search
            </button>
          </div>
        )}

        {/* Order list — filtered by bill number when a search term is entered */}
        {!loading && filteredOrders.length > 0 && (
          <div className="flex flex-col gap-2">
            {filteredOrders.map((order) => (
              <ReceiptRow
                key={order.id}
                order={order}
                currencySymbol={currencySymbol}
                roundBillTotals={roundBillTotals}
                onReprint={(o) => setReprintOrder(o)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Re-print modal — only render when we have a valid token to avoid a 401 */}
      {reprintOrder && config && accessToken && (
        <ReprintModal
          order={reprintOrder}
          config={config}
          accessToken={accessToken}
          onClose={() => setReprintOrder(null)}
        />
      )}
    </div>
  )
}
