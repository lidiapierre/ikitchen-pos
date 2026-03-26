'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { JSX } from 'react'
import { fetchOrderItems, fetchOrderSummary } from './orderData'
import type { OrderItem } from './orderData'
import { callCloseOrder } from './closeOrderApi'
import { callRecordPayment } from './recordPaymentApi'
import { callVoidItem } from './voidItemApi'
import { callCancelOrder } from './cancelOrderApi'
import { markItemsSentToKitchen } from './kotApi'
import { formatPrice, DEFAULT_CURRENCY_SYMBOL } from '@/lib/formatPrice'
import { calcVat } from '@/lib/vatCalc'
import { fetchVatConfig, fetchOrderVatContext } from '@/lib/fetchVatConfig'
import { printKot } from '@/lib/kotPrint'
import type { PrinterConfig } from '@/lib/kotPrint'
import KotPrintView from '@/components/KotPrintView'
import BillPrintView from '@/components/BillPrintView'
import { supabase } from '@/lib/supabase'
import { useUser } from '@/lib/user-context'
import { callSetCovers, callSetItemSeat } from './splitBillApi'
import SplitBillPrintView from '@/components/SplitBillPrintView'

interface OrderDetailClientProps {
  tableId: string
  orderId: string
  currencySymbol?: string
}

export default function OrderDetailClient({ tableId, orderId, currencySymbol = DEFAULT_CURRENCY_SYMBOL }: OrderDetailClientProps): JSX.Element {
  const router = useRouter()
  const { accessToken } = useUser()
  const [closing, setClosing] = useState(false)
  const [closeError, setCloseError] = useState<string | null>(null)
  const [items, setItems] = useState<OrderItem[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [step, setStep] = useState<'order' | 'payment' | 'change' | 'success'>('order')
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card'>('cash')
  const [paying, setPaying] = useState(false)
  const [paymentError, setPaymentError] = useState<string | null>(null)
  const [changeDueCents, setChangeDueCents] = useState(0)
  const [amountTenderedDollars, setAmountTenderedDollars] = useState<string>('')
  const [confirmedPaymentMethod, setConfirmedPaymentMethod] = useState<string | null>(null)

  // Paid order state (for orders already paid when navigated to directly)
  const [orderIsPaid, setOrderIsPaid] = useState(false)
  const [paidPaymentMethod, setPaidPaymentMethod] = useState<string | null>(null)
  const [statusLoading, setStatusLoading] = useState(true)

  // Void item state
  const [voidingItem, setVoidingItem] = useState<OrderItem | null>(null)
  const [voidReason, setVoidReason] = useState('')
  const [voidingInProgress, setVoidingInProgress] = useState(false)
  const [voidError, setVoidError] = useState<string | null>(null)

  // Cancel order state
  const [showCancelDialog, setShowCancelDialog] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelling, setCancelling] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)

  // Printer config state
  const [printerConfig, setPrinterConfig] = useState<PrinterConfig | null>(null)

  // KOT state
  const [kotStatus, setKotStatus] = useState<string | null>(null)
  const [kotTimestamp, setKotTimestamp] = useState('')
  const [kotShowAll, setKotShowAll] = useState(false)
  const [reprintingKot, setReprintingKot] = useState(false)
  const [kotPrintError, setKotPrintError] = useState<string | null>(null)

  // Bill print state
  const [billTimestamp, setBillTimestamp] = useState('')
  const [printingBill, setPrintingBill] = useState(false)

  // Covers / split bill state
  const [covers, setCovers] = useState(1)
  const [showSplitBill, setShowSplitBill] = useState(false)
  const [splitBillTab, setSplitBillTab] = useState<'even' | 'seat'>('even')
  const [splitBillPrinting, setSplitBillPrinting] = useState(false)
  const [splitBillPrintMode, setSplitBillPrintMode] = useState<'even' | 'seat'>('even')
  const [splitBillTimestamp, setSplitBillTimestamp] = useState('')
  const coversDebounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  // VAT config state (fetched once on load)
  const [vatPercent, setVatPercent] = useState(0)
  const [taxInclusive, setTaxInclusive] = useState(false)
  const [vatConfigLoading, setVatConfigLoading] = useState(true)

  function loadItems(): void {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    if (!supabaseUrl || !supabaseKey) {
      setFetchError('API not configured')
      setLoading(false)
      return
    }

    setLoading(true)
    setFetchError(null)
    fetchOrderItems(supabaseUrl, supabaseKey, orderId)
      .then((data) => {
        setItems(data)
      })
      .catch((err: unknown) => {
        setFetchError(err instanceof Error ? err.message : 'Failed to load order items')
      })
      .finally(() => {
        setLoading(false)
      })
  }

  function loadOrderStatus(): void {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    if (!supabaseUrl || !supabaseKey) {
      setStatusLoading(false)
      return
    }

    fetchOrderSummary(supabaseUrl, supabaseKey, orderId)
      .then((summary) => {
        if (summary.status === 'paid') {
          setOrderIsPaid(true)
          setPaidPaymentMethod(summary.payment_method)
        }
      })
      .catch(() => {
        // Non-fatal: fall back to normal order view if status check fails
      })
      .finally(() => {
        setStatusLoading(false)
      })
  }

  function loadVatConfig(): void {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    if (!supabaseUrl || !supabaseKey) {
      setVatConfigLoading(false)
      return
    }

    setVatConfigLoading(true)
    fetchOrderVatContext(supabaseUrl, supabaseKey, orderId)
      .then(({ restaurantId, menuId }) =>
        fetchVatConfig(supabaseUrl, supabaseKey, restaurantId, menuId),
      )
      .then((config) => {
        setVatPercent(config.vatPercent)
        setTaxInclusive(config.taxInclusive)
      })
      .catch(() => {
        // Non-fatal: fall back to 0% VAT (safe — no overcharging)
        setVatPercent(0)
        setTaxInclusive(false)
      })
      .finally(() => {
        setVatConfigLoading(false)
      })
  }

  function loadPrinterConfig(): void {
    void supabase
      .from('printer_configs')
      .select('mode, ip, port')
      .single()
      .then(({ data }) => {
        if (data) {
          setPrinterConfig({
            mode: (data as { mode: string; ip: string | null; port: number | null }).mode as 'browser' | 'network',
            ip: (data as { mode: string; ip: string | null; port: number | null }).ip,
            port: (data as { mode: string; ip: string | null; port: number | null }).port,
          })
        }
      }, () => {
        // Non-fatal: fall back to browser mode
      })
  }

  function loadCovers(): void {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    if (!supabaseUrl || !supabaseKey) return
    const url = new URL(`${supabaseUrl}/rest/v1/orders`)
    url.searchParams.set('id', `eq.${orderId}`)
    url.searchParams.set('select', 'covers')
    void fetch(url.toString(), {
      headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
    })
      .then((r) => r.json())
      .then((rows: Array<{ covers: number | null }>) => {
        if (rows.length > 0 && rows[0].covers != null) {
          setCovers(rows[0].covers)
        }
      })
      .catch(() => { /* non-fatal */ })
  }

  useEffect(() => {
    loadItems()
    loadOrderStatus()
    loadVatConfig()
    loadPrinterConfig()
    loadCovers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId])

  // Auto-navigate to /tables after success state is shown for 1.5s
  // Paused while bill is printing (printingBill) to avoid tearing down page during print dialog
  useEffect(() => {
    if (step !== 'success') return
    if (printingBill) return
    const timer = setTimeout(() => {
      router.push('/tables')
    }, 1500)
    return () => { clearTimeout(timer) }
  }, [step, router, printingBill])

  const rawItemsTotalCents = items.reduce((sum, item) => sum + item.quantity * item.price_cents, 0)

  // VAT breakdown (uses fetched config; calcVat is a pure function)
  const vatBreakdown = calcVat(rawItemsTotalCents, vatPercent, taxInclusive)
  const { subtotalCents: billSubtotalCents, vatCents: billVatCents, totalCents: billTotalCents } = vatBreakdown

  // Displayed "total" in the order footer is the VAT-inclusive grand total
  const totalCents = billTotalCents
  const totalFormatted = formatPrice(totalCents, currencySymbol)

  const billPaymentMethod = (confirmedPaymentMethod ?? paymentMethod) as 'cash' | 'card'
  const billAmountTenderedCents = paymentMethod === 'cash'
    ? Math.round(parseFloat(amountTenderedDollars || '0') * 100)
    : undefined

  function handleCoversChange(newCovers: number): void {
    const clamped = Math.max(1, Math.min(20, newCovers))
    setCovers(clamped)
    if (coversDebounceRef.current) clearTimeout(coversDebounceRef.current)
    coversDebounceRef.current = setTimeout(() => {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      if (!supabaseUrl || !accessToken) return
      void callSetCovers(supabaseUrl, accessToken, orderId, clamped).catch(() => { /* non-fatal */ })
    }, 500)
  }

  function handlePrintSplitBill(mode: 'even' | 'seat'): void {
    setSplitBillPrintMode(mode)
    setSplitBillTimestamp(new Date().toLocaleString())
    setSplitBillPrinting(true)
    setTimeout(() => {
      window.print()
      window.addEventListener('afterprint', () => {
        setSplitBillPrinting(false)
      }, { once: true })
    }, 200)
  }

  // KOT: send kitchen ticket for unsent items, then navigate back to tables
  async function handleBackToTables(): Promise<void> {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

    const unsentItems = items.filter((item) => !item.sent_to_kitchen)

    if (step === 'order' && unsentItems.length > 0 && supabaseUrl && supabaseKey) {
      const ts = new Date().toLocaleString()
      setKotTimestamp(ts)
      setKotStatus('Sending to kitchen…')
      setKotPrintError(null)

      const result = await printKot({
        items: unsentItems.map((i) => ({ name: i.name, qty: i.quantity })),
        tableId,
        orderId,
        timestamp: ts,
        printerConfig,
        onBeforeBrowserPrint: () => {
          // KotPrintView is already rendered — nothing extra needed
        },
      })

      if (!result.success && result.errorMessage) {
        setKotPrintError(result.errorMessage)
        setKotStatus(null)
        return
      }

      try {
        await markItemsSentToKitchen(supabaseUrl, supabaseKey, orderId, unsentItems.map((i) => i.id))
      } catch {
        // Non-fatal: navigate anyway so staff are not blocked
      }
    }

    router.push(`/tables/${tableId}`)
  }

  // Reprint KOT: show all items (no side effects — does NOT call markItemsSentToKitchen)
  async function handleReprintKot(): Promise<void> {
    const ts = new Date().toLocaleString()
    setKotTimestamp(ts)
    setKotShowAll(true)
    setReprintingKot(true)
    setKotPrintError(null)

    const result = await printKot({
      items: items.map((i) => ({ name: i.name, qty: i.quantity })),
      tableId,
      orderId,
      timestamp: ts,
      printerConfig,
      onBeforeBrowserPrint: () => {
        // KotPrintView showAll is already set above
      },
      onAfterBrowserPrint: () => {
        setKotShowAll(false)
        setReprintingKot(false)
      },
    })

    if (result.method === 'network') {
      setKotShowAll(false)
      setReprintingKot(false)
    }

    if (!result.success && result.errorMessage) {
      setKotPrintError(result.errorMessage)
    }
  }

  // Print Bill: capture timestamp and trigger print dialog
  function handlePrintBill(): void {
    setBillTimestamp(new Date().toLocaleString())
    setPrintingBill(true)
    setTimeout(() => {
      window.print()
      window.addEventListener('afterprint', () => {
        setPrintingBill(false)
      }, { once: true })
    }, 200)
  }

  async function handleCloseOrder(): Promise<void> {
    setCloseError(null)
    setClosing(true)
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      if (!supabaseUrl || !accessToken) {
        throw new Error('Not authenticated')
      }
      await callCloseOrder(supabaseUrl, accessToken, orderId)
      setStep('payment')
    } catch (err) {
      setCloseError(err instanceof Error ? err.message : 'Failed to close order')
    } finally {
      setClosing(false)
    }
  }

  async function handleRecordPayment(): Promise<void> {
    setPaymentError(null)

    // For cash: amount tendered must cover the VAT-inclusive total
    const amountCentsToTender = paymentMethod === 'cash'
      ? Math.round(parseFloat(amountTenderedDollars || '0') * 100)
      : billTotalCents
    if (paymentMethod === 'cash' && amountCentsToTender < billTotalCents) {
      setPaymentError('Amount tendered must be at least the order total')
      return
    }

    setPaying(true)
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      if (!supabaseUrl || !accessToken) {
        throw new Error('Not authenticated')
      }
      // Pass the VAT-inclusive total as the final amount to record_payment
      const result = await callRecordPayment(supabaseUrl, accessToken, orderId, amountCentsToTender, paymentMethod, billTotalCents)
      setConfirmedPaymentMethod(paymentMethod)
      if (paymentMethod === 'cash') {
        setChangeDueCents(result.change_due)
        setStep('change')
      } else {
        setStep('success')
      }
    } catch (err) {
      setPaymentError(err instanceof Error ? err.message : 'Failed to record payment')
    } finally {
      setPaying(false)
    }
  }

  async function handleVoidItem(): Promise<void> {
    if (!voidingItem) return
    setVoidError(null)
    setVoidingInProgress(true)
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      if (!supabaseUrl || !accessToken) {
        throw new Error('Not authenticated')
      }
      await callVoidItem(supabaseUrl, accessToken, voidingItem.id, voidReason)
      setVoidingItem(null)
      setVoidReason('')
      loadItems()
    } catch (err) {
      setVoidError(err instanceof Error ? err.message : 'Failed to void item')
    } finally {
      setVoidingInProgress(false)
    }
  }

  async function handleCancelOrder(): Promise<void> {
    setCancelError(null)
    setCancelling(true)
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      if (!supabaseUrl || !accessToken) {
        throw new Error('Not authenticated')
      }
      await callCancelOrder(supabaseUrl, accessToken, orderId, cancelReason)
      router.push(`/tables/${tableId}`)
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : 'Failed to cancel order')
    } finally {
      setCancelling(false)
    }
  }

  function renderItems(): JSX.Element {
    if (loading) {
      return <p className="text-zinc-400 text-base">Loading items…</p>
    }
    if (fetchError !== null) {
      return <p className="text-red-400 text-base">{fetchError}</p>
    }
    if (items.length === 0) {
      return <p className="text-zinc-500 text-base">No items yet — tap Add Items to start</p>
    }
    return (
      <ul className="space-y-2 mb-6">
        {items.map((item) => {
          const lineTotalCents = item.quantity * item.price_cents
          return (
            <li
              key={item.id}
              className="bg-zinc-800 rounded-xl px-4 py-3 text-base"
            >
              <div className="flex items-center justify-between gap-4">
                <span className="font-semibold text-white flex-1">{item.name}</span>
                <span className="text-zinc-400">×{item.quantity}</span>
                <span className="text-zinc-400">{formatPrice(item.price_cents, currencySymbol)} each</span>
                <span className="font-bold text-amber-400">{formatPrice(lineTotalCents, currencySymbol)}</span>
                {step === 'order' && (
                  <button
                    type="button"
                    onClick={() => {
                      setVoidingItem(item)
                      setVoidReason('')
                      setVoidError(null)
                    }}
                    className="min-h-[48px] min-w-[48px] px-3 rounded-lg text-sm font-semibold text-red-400 hover:text-white hover:bg-red-700 transition-colors"
                  >
                    Void
                  </button>
                )}
              </div>
              {item.modifier_names.length > 0 && (
                <ul className="mt-1 space-y-0.5 pl-2">
                  {item.modifier_names.map((modName) => (
                    <li key={modName} className="text-base text-zinc-400">
                      + {modName}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ul>
    )
  }

  // Read-only items list for paid orders
  function renderReadOnlyItems(): JSX.Element {
    if (loading) {
      return <p className="text-zinc-400 text-base">Loading items…</p>
    }
    if (fetchError !== null) {
      return <p className="text-red-400 text-base">{fetchError}</p>
    }
    if (items.length === 0) {
      return <p className="text-zinc-500 text-base">No items on this order.</p>
    }
    return (
      <ul className="space-y-2 mb-6">
        {items.map((item) => {
          const lineTotalCents = item.quantity * item.price_cents
          return (
            <li
              key={item.id}
              className="bg-zinc-800 rounded-xl px-4 py-3 text-base"
            >
              <div className="flex items-center justify-between gap-4">
                <span className="font-semibold text-white flex-1">{item.name}</span>
                <span className="text-zinc-400">×{item.quantity}</span>
                <span className="text-zinc-400">{formatPrice(item.price_cents, currencySymbol)} each</span>
                <span className="font-bold text-amber-400">{formatPrice(lineTotalCents, currencySymbol)}</span>
              </div>
              {item.modifier_names.length > 0 && (
                <ul className="mt-1 space-y-0.5 pl-2">
                  {item.modifier_names.map((modName) => (
                    <li key={modName} className="text-base text-zinc-400">
                      + {modName}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ul>
    )
  }

  // Paid read-only view (for orders already paid when navigated to directly)
  if (!statusLoading && orderIsPaid && step === 'order') {
    return (
      <main className="min-h-screen bg-zinc-900 p-6 flex flex-col">
        <Link
          href="/tables"
          className="inline-flex items-center gap-2 text-zinc-400 hover:text-white text-base mb-8 min-h-[48px] min-w-[48px]"
        >
          ← Back to tables
        </Link>

        <header className="mb-6">
          <h1 className="text-2xl font-bold text-white mb-4">Order</h1>
          <div className="inline-flex items-center gap-2 bg-green-900/40 border border-green-700 rounded-xl px-4 py-2 mb-4">
            <span className="text-green-400 font-semibold text-base">Paid</span>
          </div>
          <dl className="space-y-2 text-base">
            <div className="flex gap-3">
              <dt className="text-zinc-500">Table</dt>
              <dd className="font-semibold text-white">{tableId}</dd>
            </div>
            <div className="flex gap-3">
              <dt className="text-zinc-500">Order ID</dt>
              <dd className="font-mono text-sm text-zinc-300">{orderId}</dd>
            </div>
            {paidPaymentMethod !== null && (
              <div className="flex gap-3">
                <dt className="text-zinc-500">Payment method</dt>
                <dd className="font-semibold text-white capitalize">{paidPaymentMethod}</dd>
              </div>
            )}
          </dl>
        </header>

        <section className="flex-1">
          <h2 className="text-lg font-semibold text-white mb-4">Items</h2>
          {renderReadOnlyItems()}
        </section>

        <footer className="mt-6 pt-4 border-t border-zinc-700">
          <div className="flex items-center justify-between mb-6">
            <span className="text-lg text-zinc-400">Total</span>
            <span className="text-2xl font-bold text-white">{totalFormatted}</span>
          </div>
          <Link
            href="/tables"
            className="w-full inline-flex items-center justify-center min-h-[48px] min-w-[48px] px-6 rounded-xl text-base font-semibold bg-zinc-700 hover:bg-zinc-600 text-white transition-colors"
          >
            Back to tables
          </Link>
        </footer>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-zinc-900 p-6 flex flex-col">
      {/* KOT print component — hidden on screen, visible only when printing */}
      <KotPrintView
        tableId={tableId}
        orderId={orderId}
        items={items}
        timestamp={kotTimestamp}
        showAll={kotShowAll}
      />

      {/* Bill print component — hidden on screen, visible only when printing */}
      <BillPrintView
        tableId={tableId}
        orderId={orderId}
        items={items}
        subtotalCents={billSubtotalCents}
        vatPercent={vatPercent}
        taxInclusive={taxInclusive}
        totalCents={billTotalCents}
        paymentMethod={billPaymentMethod}
        amountTenderedCents={billAmountTenderedCents}
        changeDueCents={billPaymentMethod === 'cash' ? changeDueCents : undefined}
        timestamp={billTimestamp}
      />

      {/* Void item dialog */}
      {voidingItem !== null && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70">
          <div className="w-full max-w-lg bg-zinc-800 rounded-t-2xl p-6 space-y-4">
            <h2 className="text-xl font-semibold text-white">Void Item</h2>
            <p className="text-zinc-300 text-base">
              Void <span className="font-semibold text-white">{voidingItem.name}</span>?
            </p>
            <div>
              <label htmlFor="void-reason" className="block text-zinc-400 text-base mb-2">
                Reason
              </label>
              <input
                id="void-reason"
                type="text"
                placeholder="e.g. wrong item ordered"
                value={voidReason}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setVoidReason(e.target.value) }}
                className="w-full min-h-[48px] px-4 rounded-xl text-base bg-zinc-700 text-white border-2 border-zinc-600 focus:border-amber-400 focus:outline-none"
              />
            </div>
            {voidError !== null && (
              <p className="text-base text-red-400">{voidError}</p>
            )}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setVoidingItem(null)
                  setVoidReason('')
                  setVoidError(null)
                }}
                disabled={voidingInProgress}
                className="flex-1 min-h-[48px] min-w-[48px] px-6 rounded-xl text-base font-semibold border-2 border-zinc-600 text-zinc-300 hover:border-zinc-400 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => { void handleVoidItem() }}
                disabled={voidingInProgress || voidReason.trim() === ''}
                className={[
                  'flex-1 min-h-[48px] min-w-[48px] px-6 rounded-xl text-base font-semibold transition-colors',
                  voidingInProgress || voidReason.trim() === ''
                    ? 'bg-zinc-700 text-zinc-400 cursor-wait'
                    : 'bg-red-700 hover:bg-red-600 text-white',
                ].join(' ')}
              >
                {voidingInProgress ? 'Voiding…' : 'Confirm Void'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel order dialog */}
      {showCancelDialog && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70">
          <div className="w-full max-w-lg bg-zinc-800 rounded-t-2xl p-6 space-y-4">
            <h2 className="text-xl font-semibold text-white">Cancel Order</h2>
            <p className="text-zinc-300 text-base">This will cancel the entire order. Please provide a reason.</p>
            <div>
              <label htmlFor="cancel-reason" className="block text-zinc-400 text-base mb-2">
                Reason
              </label>
              <input
                id="cancel-reason"
                type="text"
                placeholder="e.g. customer left"
                value={cancelReason}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setCancelReason(e.target.value) }}
                className="w-full min-h-[48px] px-4 rounded-xl text-base bg-zinc-700 text-white border-2 border-zinc-600 focus:border-amber-400 focus:outline-none"
              />
            </div>
            {cancelError !== null && (
              <p className="text-base text-red-400">{cancelError}</p>
            )}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowCancelDialog(false)
                  setCancelReason('')
                  setCancelError(null)
                }}
                disabled={cancelling}
                className="flex-1 min-h-[48px] min-w-[48px] px-6 rounded-xl text-base font-semibold border-2 border-zinc-600 text-zinc-300 hover:border-zinc-400 transition-colors disabled:opacity-50"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => { void handleCancelOrder() }}
                disabled={cancelling || cancelReason.trim() === ''}
                className={[
                  'flex-1 min-h-[48px] min-w-[48px] px-6 rounded-xl text-base font-semibold transition-colors',
                  cancelling || cancelReason.trim() === ''
                    ? 'bg-zinc-700 text-zinc-400 cursor-wait'
                    : 'bg-red-700 hover:bg-red-600 text-white',
                ].join(' ')}
              >
                {cancelling ? 'Cancelling…' : 'Confirm Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => { void handleBackToTables() }}
        disabled={kotStatus !== null}
        className="inline-flex items-center gap-2 text-zinc-400 hover:text-white text-base mb-8 min-h-[48px] min-w-[48px] disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {kotStatus !== null ? kotStatus : '← Back to tables'}
      </button>

      {kotPrintError && (
        <div className="mb-4 p-4 rounded-xl bg-red-900/60 border border-red-700 text-red-200 text-sm whitespace-pre-wrap">
          <p className="font-semibold mb-1">⚠️ Printer error</p>
          <p>{kotPrintError}</p>
          <button
            type="button"
            onClick={() => setKotPrintError(null)}
            className="mt-2 text-xs text-red-400 hover:text-red-200 underline"
          >
            Dismiss
          </button>
        </div>
      )}

      <header className="mb-6">
        <h1 className="text-2xl font-bold text-white mb-4">Order</h1>
        <dl className="space-y-2 text-base">
          <div className="flex gap-3">
            <dt className="text-zinc-500">Table</dt>
            <dd className="font-semibold text-white">{tableId}</dd>
          </div>
          <div className="flex gap-3">
            <dt className="text-zinc-500">Order ID</dt>
            <dd className="font-mono text-sm text-zinc-300">{orderId}</dd>
          </div>
        </dl>
        {/* Covers field — always visible in order step */}
        {step === 'order' && (
          <div className="flex items-center gap-3 mt-4">
            <span className="text-zinc-400 text-base">Covers:</span>
            <button
              type="button"
              onClick={() => { handleCoversChange(covers - 1) }}
              disabled={covers <= 1}
              className="min-h-[48px] min-w-[48px] rounded-xl bg-zinc-800 text-white text-xl font-bold hover:bg-zinc-700 transition-colors disabled:opacity-40"
              aria-label="Decrease covers"
            >
              −
            </button>
            <span className="text-white font-bold text-xl w-8 text-center">{covers}</span>
            <button
              type="button"
              onClick={() => { handleCoversChange(covers + 1) }}
              disabled={covers >= 20}
              className="min-h-[48px] min-w-[48px] rounded-xl bg-zinc-800 text-white text-xl font-bold hover:bg-zinc-700 transition-colors disabled:opacity-40"
              aria-label="Increase covers"
            >
              +
            </button>
          </div>
        )}
      </header>

      <section className="flex-1">
        <h2 className="text-lg font-semibold text-white mb-4">Items</h2>
        {renderItems()}
      </section>

      <footer className="mt-6 pt-4 border-t border-zinc-700">
        <div className="flex items-center justify-between mb-6">
          <span className="text-lg text-zinc-400">Total</span>
          <span className="text-2xl font-bold text-white">{totalFormatted}</span>
        </div>

        {step === 'order' && !statusLoading ? (
          <>
            <div className="flex gap-4 mb-3">
              <Link
                href={`/tables/${tableId}/order/${orderId}/menu`}
                className="flex-1 inline-flex items-center justify-center min-h-[48px] min-w-[48px] px-6 rounded-xl border-2 border-zinc-600 text-white text-base font-semibold hover:border-zinc-400 transition-colors"
              >
                Add Items
              </Link>
              <button
                type="button"
                onClick={() => { void handleCloseOrder() }}
                disabled={closing}
                className={[
                  'flex-1 min-h-[48px] min-w-[48px] px-6 rounded-xl text-base font-semibold transition-colors',
                  closing
                    ? 'bg-zinc-700 text-zinc-400 cursor-wait'
                    : 'bg-red-700 hover:bg-red-600 text-white',
                ].join(' ')}
              >
                {closing ? 'Closing…' : 'Close Order'}
              </button>
            </div>

            {items.length >= 1 && (
              <button
                type="button"
                onClick={handleReprintKot}
                disabled={reprintingKot}
                className={[
                  'w-full min-h-[48px] min-w-[48px] px-6 rounded-xl text-base font-semibold transition-colors mb-3',
                  reprintingKot
                    ? 'bg-zinc-700 text-zinc-400 cursor-wait'
                    : 'bg-zinc-700 hover:bg-zinc-600 text-white border-2 border-zinc-600',
                ].join(' ')}
              >
                {reprintingKot ? 'Reprinting…' : '🖨 Reprint KOT'}
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setCancelReason('')
                setCancelError(null)
                setShowCancelDialog(true)
              }}
              className="w-full min-h-[48px] min-w-[48px] px-6 rounded-xl text-base font-semibold text-zinc-400 hover:text-red-400 border-2 border-zinc-700 hover:border-red-700 transition-colors"
            >
              Cancel order
            </button>

            {closeError !== null && (
              <p className="mt-4 text-base text-red-400">{closeError}</p>
            )}
          </>
        ) : step === 'payment' ? (
          <div className="space-y-5">
            <h2 className="text-xl font-semibold text-white">Record Payment</h2>
            {/* Order total breakdown */}
            <div className="bg-zinc-800 rounded-xl px-4 py-3 text-sm space-y-1.5">
              <div className="flex justify-between text-zinc-400">
                <span>Subtotal</span>
                <span>{formatPrice(billSubtotalCents, currencySymbol)}</span>
              </div>
              {billVatCents > 0 && (
                <div className="flex justify-between text-zinc-400">
                  <span>VAT {vatPercent}%{taxInclusive ? ' (incl.)' : ''}</span>
                  <span>{formatPrice(billVatCents, currencySymbol)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-white border-t border-zinc-700 pt-1.5 mt-1">
                <span>Total</span>
                <span>{formatPrice(billTotalCents, currencySymbol)}</span>
              </div>
            </div>

            <div>
              <p className="text-zinc-400 text-base mb-3">Payment method</p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => { setPaymentMethod('cash') }}
                  className={[
                    'flex-1 min-h-[48px] min-w-[48px] rounded-xl text-base font-semibold transition-colors border-2',
                    paymentMethod === 'cash'
                      ? 'border-amber-400 bg-amber-400/10 text-amber-400'
                      : 'border-zinc-600 text-zinc-300 hover:border-zinc-400',
                  ].join(' ')}
                >
                  Cash
                </button>
                <button
                  type="button"
                  onClick={() => { setPaymentMethod('card') }}
                  className={[
                    'flex-1 min-h-[48px] min-w-[48px] rounded-xl text-base font-semibold transition-colors border-2',
                    paymentMethod === 'card'
                      ? 'border-amber-400 bg-amber-400/10 text-amber-400'
                      : 'border-zinc-600 text-zinc-300 hover:border-zinc-400',
                  ].join(' ')}
                >
                  Card
                </button>
              </div>
            </div>

            {paymentMethod === 'cash' && (
              <div>
                <p className="text-zinc-400 text-base mb-2">Amount tendered</p>
                <input
                  type="number"
                  min={(billTotalCents / 100).toFixed(2)}
                  step="0.01"
                  placeholder={(billTotalCents / 100).toFixed(2)}
                  value={amountTenderedDollars}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setAmountTenderedDollars(e.target.value) }}
                  className="w-full min-h-[48px] px-4 rounded-xl text-base bg-zinc-800 text-white border-2 border-zinc-600 focus:border-amber-400 focus:outline-none"
                />
              </div>
            )}

            <button
              type="button"
              onClick={() => { void handleRecordPayment() }}
              disabled={paying}
              className={[
                'w-full min-h-[48px] min-w-[48px] px-6 rounded-xl text-base font-semibold transition-colors',
                paying
                  ? 'bg-zinc-700 text-zinc-400 cursor-wait'
                  : 'bg-amber-500 hover:bg-amber-400 text-zinc-900',
              ].join(' ')}
            >
              {paying ? 'Recording…' : `Confirm Payment · ${totalFormatted}`}
            </button>

            <button
              type="button"
              onClick={handlePrintBill}
              disabled={printingBill}
              className={[
                'w-full min-h-[48px] min-w-[48px] px-6 rounded-xl text-base font-semibold transition-colors border-2 border-zinc-600',
                printingBill
                  ? 'bg-zinc-700 text-zinc-400 cursor-wait'
                  : 'bg-zinc-700 hover:bg-zinc-600 text-white',
              ].join(' ')}
            >
              {printingBill ? 'Printing…' : '🖨 Print Bill'}
            </button>

            <button
              type="button"
              onClick={() => { router.push(`/tables/${tableId}`) }}
              className="w-full min-h-[48px] min-w-[48px] px-6 rounded-xl text-base font-semibold text-zinc-400 hover:text-white transition-colors"
            >
              Cancel
            </button>

            {paymentError !== null && (
              <p className="text-base text-red-400">{paymentError}</p>
            )}
          </div>
        ) : step === 'change' ? (
          <div className="space-y-5">
            <h2 className="text-xl font-semibold text-white">Change Due</h2>
            <p className="text-4xl font-bold text-amber-400">
              {formatPrice(changeDueCents, currencySymbol)}
            </p>
            <button
              type="button"
              onClick={() => { setStep('success') }}
              className="w-full min-h-[48px] min-w-[48px] px-6 rounded-xl text-base font-semibold bg-amber-500 hover:bg-amber-400 text-zinc-900 transition-colors"
            >
              Done
            </button>
          </div>
        ) : (
          <div className="space-y-5 text-center py-4">
            <div className="text-5xl mb-2">✓</div>
            <h2 className="text-2xl font-bold text-green-400">Payment recorded — order closed</h2>
            {confirmedPaymentMethod !== null && (
              <p className="text-zinc-400 text-base capitalize">Paid by {confirmedPaymentMethod}</p>
            )}
            <button
              type="button"
              onClick={handlePrintBill}
              disabled={printingBill}
              className={[
                'w-full min-h-[48px] min-w-[48px] px-6 rounded-xl text-base font-semibold transition-colors border-2 border-zinc-600',
                printingBill
                  ? 'bg-zinc-700 text-zinc-400 cursor-wait'
                  : 'bg-zinc-700 hover:bg-zinc-600 text-white',
              ].join(' ')}
            >
              {printingBill ? 'Printing…' : '🖨 Print Bill'}
            </button>
            <p className="text-zinc-400 text-base">Returning to tables…</p>
          </div>
        )}
      </footer>
    </main>
  )
}
