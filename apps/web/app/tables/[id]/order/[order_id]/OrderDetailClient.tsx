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
import { callApplyDiscount } from './applyDiscountApi'
import { callCompItem } from './compApi'
import { callTransferOrder } from './transferOrderApi'
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

const COMP_REASONS = ['VIP', 'Complaint resolution', 'Staff meal', 'Event', 'Other'] as const

interface OrderDetailClientProps {
  tableId: string
  orderId: string
  currencySymbol?: string
}

export default function OrderDetailClient({ tableId, orderId, currencySymbol = DEFAULT_CURRENCY_SYMBOL }: OrderDetailClientProps): JSX.Element {
  const router = useRouter()
  const { accessToken, isAdmin } = useUser()
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

  // Transfer table state
  interface AvailableTable { id: string; label: string }
  const [showTransferModal, setShowTransferModal] = useState(false)
  const [availableTables, setAvailableTables] = useState<AvailableTable[]>([])
  const [transferTablesLoading, setTransferTablesLoading] = useState(false)
  const [transferTablesError, setTransferTablesError] = useState<string | null>(null)
  const [transferTarget, setTransferTarget] = useState<AvailableTable | null>(null)
  const [transferring, setTransferring] = useState(false)
  const [transferError, setTransferError] = useState<string | null>(null)

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

  // Discount state
  const [discountType, setDiscountType] = useState<'percent' | 'flat'>('percent')
  const [discountValueStr, setDiscountValueStr] = useState<string>('')
  const [applyingDiscount, setApplyingDiscount] = useState(false)
  const [discountError, setDiscountError] = useState<string | null>(null)
  const [appliedDiscountCents, setAppliedDiscountCents] = useState(0)
  const [appliedDiscountLabel, setAppliedDiscountLabel] = useState<string | undefined>(undefined)

  // Comp state
  const [compingItem, setCompingItem] = useState<OrderItem | null>(null)
  const [showOrderCompDialog, setShowOrderCompDialog] = useState(false)
  const [compReason, setCompReason] = useState<string>(COMP_REASONS[0])
  const [compingInProgress, setCompingInProgress] = useState(false)
  const [compError, setCompError] = useState<string | null>(null)
  const [orderIsComp, setOrderIsComp] = useState(false)

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

  // Exclude comp'd items from the subtotal
  const rawItemsTotalCents = items
    .filter((item) => !item.comp && !orderIsComp)
    .reduce((sum, item) => sum + item.quantity * item.price_cents, 0)

  // VAT breakdown (uses fetched config; calcVat is a pure function)
  const vatBreakdown = calcVat(rawItemsTotalCents, vatPercent, taxInclusive)
  const { subtotalCents: billSubtotalCents, vatCents: billVatCents, totalCents: billTotalCentsBeforeDiscount } = vatBreakdown

  // Apply discount and order comp
  const effectiveBillTotalCents = orderIsComp
    ? 0
    : Math.max(0, billTotalCentsBeforeDiscount - appliedDiscountCents)

  const billTotalCents = effectiveBillTotalCents

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

    // Empty order — auto-cancel and go straight back, no KOT needed
    if (items.length === 0 && supabaseUrl && accessToken) {
      try {
        await callCancelOrder(supabaseUrl, accessToken, orderId, 'Empty order — no items added')
      } catch {
        // Non-fatal: navigate anyway
      }
      router.push('/tables')
      return
    }

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

    router.push('/tables')
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
      // Empty order — cancel directly, no payment needed
      if (items.length === 0) {
        await callCancelOrder(supabaseUrl, accessToken, orderId, 'Empty order — no items added')
        router.push('/tables')
        return
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

    // For cash: amount tendered must cover the effective total (after discount/comp)
    const amountCentsToTender = paymentMethod === 'cash'
      ? Math.round(parseFloat(amountTenderedDollars || '0') * 100)
      : billTotalCents

    // If order is comp'd, allow 0 payment
    if (!orderIsComp && paymentMethod === 'cash' && amountCentsToTender < billTotalCents) {
      setPaymentError('Amount tendered must be at least the order total')
      return
    }

    setPaying(true)
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      if (!supabaseUrl || !accessToken) {
        throw new Error('Not authenticated')
      }
      // Pass the effective total (after discount/comp) as the final amount
      const effectiveAmount = orderIsComp ? 0 : amountCentsToTender
      const result = await callRecordPayment(supabaseUrl, accessToken, orderId, effectiveAmount, paymentMethod, billTotalCents)
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
      router.push('/tables')
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : 'Failed to cancel order')
    } finally {
      setCancelling(false)
    }
  }

  async function handleApplyDiscount(): Promise<void> {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!supabaseUrl || !accessToken) {
      setDiscountError('Not authenticated')
      return
    }
    const val = parseFloat(discountValueStr)
    if (isNaN(val) || val <= 0) {
      setDiscountError('Please enter a valid discount value')
      return
    }
    setDiscountError(null)
    setApplyingDiscount(true)
    try {
      const result = await callApplyDiscount(supabaseUrl, accessToken, orderId, discountType, val)
      setAppliedDiscountCents(result.discount_amount_cents)
      const label = discountType === 'percent' ? `${val}%` : `flat ৳${val.toFixed(2)}`
      setAppliedDiscountLabel(label)
    } catch (err) {
      setDiscountError(err instanceof Error ? err.message : 'Failed to apply discount')
    } finally {
      setApplyingDiscount(false)
    }
  }

  async function handleCompItem(): Promise<void> {
    if (!compingItem) return
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!supabaseUrl || !accessToken) {
      setCompError('Not authenticated')
      return
    }
    setCompError(null)
    setCompingInProgress(true)
    try {
      await callCompItem(supabaseUrl, accessToken, { orderItemId: compingItem.id, reason: compReason })
      setCompingItem(null)
      loadItems()
    } catch (err) {
      setCompError(err instanceof Error ? err.message : 'Failed to comp item')
    } finally {
      setCompingInProgress(false)
    }
  }

  async function handleCompOrder(): Promise<void> {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!supabaseUrl || !accessToken) {
      setCompError('Not authenticated')
      return
    }
    setCompError(null)
    setCompingInProgress(true)
    try {
      await callCompItem(supabaseUrl, accessToken, { orderId, reason: compReason })
      setOrderIsComp(true)
      setShowOrderCompDialog(false)
    } catch (err) {
      setCompError(err instanceof Error ? err.message : 'Failed to comp order')
    } finally {
      setCompingInProgress(false)
    }
  }

  async function openTransferModal(): Promise<void> {
    setTransferTarget(null)
    setTransferError(null)
    setTransferTablesError(null)
    setShowTransferModal(true)
    setTransferTablesLoading(true)

    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
      if (!supabaseUrl || !supabaseKey) throw new Error('API not configured')

      // Fetch all tables
      const tablesUrl = new URL(`${supabaseUrl}/rest/v1/tables`)
      tablesUrl.searchParams.set('select', 'id,label')
      tablesUrl.searchParams.set('order', 'label')
      const tablesRes = await fetch(tablesUrl.toString(), {
        headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
      })
      if (!tablesRes.ok) throw new Error('Failed to fetch tables')
      const allTables = (await tablesRes.json()) as AvailableTable[]

      // Fetch open orders to determine occupied tables
      const ordersUrl = new URL(`${supabaseUrl}/rest/v1/orders`)
      ordersUrl.searchParams.set('select', 'table_id')
      ordersUrl.searchParams.set('status', 'eq.open')
      const ordersRes = await fetch(ordersUrl.toString(), {
        headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
      })
      if (!ordersRes.ok) throw new Error('Failed to fetch orders')
      const openOrders = (await ordersRes.json()) as Array<{ table_id: string | null }>
      const occupiedTableIds = new Set(openOrders.map((o) => o.table_id).filter(Boolean))

      // Filter: exclude current table and occupied tables
      const available = allTables.filter(
        (t) => t.id !== tableId && !occupiedTableIds.has(t.id),
      )
      setAvailableTables(available)
    } catch (err) {
      setTransferTablesError(err instanceof Error ? err.message : 'Failed to load tables')
    } finally {
      setTransferTablesLoading(false)
    }
  }

  async function handleTransfer(): Promise<void> {
    if (!transferTarget) return
    setTransferError(null)
    setTransferring(true)
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      if (!supabaseUrl || !accessToken) throw new Error('Not authenticated')
      await callTransferOrder(supabaseUrl, accessToken, orderId, transferTarget.id)
      setShowTransferModal(false)
      router.push(`/tables/${transferTarget.id}/order/${orderId}`)
    } catch (err) {
      setTransferError(err instanceof Error ? err.message : 'Failed to transfer order')
    } finally {
      setTransferring(false)
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
          const isComp = item.comp || orderIsComp
          const lineTotalCents = item.quantity * item.price_cents
          return (
            <li
              key={item.id}
              className={[
                'bg-zinc-800 rounded-xl px-4 py-3 text-base',
                isComp ? 'opacity-70' : '',
              ].join(' ')}
            >
              <div className="flex items-center justify-between gap-4">
                <span className={['font-semibold text-white flex-1', isComp ? 'line-through' : ''].join(' ')}>
                  {item.name}
                  {isComp && (
                    <span className="ml-2 text-xs font-bold text-emerald-400 no-underline not-italic" style={{ textDecoration: 'none' }}>
                      COMP
                    </span>
                  )}
                </span>
                <span className="text-zinc-400">×{item.quantity}</span>
                {isComp ? (
                  <span className="text-emerald-400 text-sm italic">Complimentary</span>
                ) : (
                  <>
                    <span className="text-zinc-400">{formatPrice(item.price_cents, currencySymbol)} each</span>
                    <span className="font-bold text-amber-400">{formatPrice(lineTotalCents, currencySymbol)}</span>
                  </>
                )}
                {step === 'order' && (
                  <div className="flex gap-1">
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
                    {isAdmin && !item.comp && !orderIsComp && (
                      <button
                        type="button"
                        onClick={() => {
                          setCompingItem(item)
                          setCompReason(COMP_REASONS[0])
                          setCompError(null)
                        }}
                        className="min-h-[48px] min-w-[48px] px-3 rounded-lg text-sm font-semibold text-emerald-400 hover:text-white hover:bg-emerald-700 transition-colors"
                      >
                        Comp
                      </button>
                    )}
                  </div>
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
      {!splitBillPrinting && (
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
          discountAmountCents={appliedDiscountCents}
          discountLabel={appliedDiscountLabel}
          orderComp={orderIsComp}
        />
      )}

      {/* Split bill print component — hidden on screen, visible only when split bill printing */}
      {splitBillPrinting && (
        <SplitBillPrintView
          tableId={tableId}
          orderId={orderId}
          items={items}
          covers={covers}
          vatPercent={vatPercent}
          taxInclusive={taxInclusive}
          timestamp={splitBillTimestamp}
          evenSplit={splitBillPrintMode === 'even'}
        />
      )}

      {/* Split bill modal */}
      {showSplitBill && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70">
          <div className="w-full max-w-lg bg-zinc-900 rounded-t-2xl p-6 space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-white">Split Bill</h2>
              <button
                type="button"
                onClick={() => { setShowSplitBill(false) }}
                className="min-h-[48px] min-w-[48px] text-zinc-400 hover:text-white text-2xl"
              >
                ✕
              </button>
            </div>

            {/* Tab toggle */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setSplitBillTab('even') }}
                className={[
                  'flex-1 min-h-[48px] rounded-xl text-base font-semibold transition-colors border-2',
                  splitBillTab === 'even'
                    ? 'border-amber-400 bg-amber-400/10 text-amber-400'
                    : 'border-zinc-600 text-zinc-300 hover:border-zinc-400',
                ].join(' ')}
              >
                Even Split
              </button>
              <button
                type="button"
                onClick={() => { setSplitBillTab('seat') }}
                className={[
                  'flex-1 min-h-[48px] rounded-xl text-base font-semibold transition-colors border-2',
                  splitBillTab === 'seat'
                    ? 'border-amber-400 bg-amber-400/10 text-amber-400'
                    : 'border-zinc-600 text-zinc-300 hover:border-zinc-400',
                ].join(' ')}
              >
                By Seat
              </button>
            </div>

            {splitBillTab === 'even' ? (
              <div className="space-y-4">
                <p className="text-zinc-400 text-base">
                  Split <span className="text-white font-bold">{totalFormatted}</span> between{' '}
                  <span className="text-white font-bold">{covers}</span> {covers === 1 ? 'person' : 'people'}
                </p>
                <div className="bg-zinc-800 rounded-xl px-4 py-4 text-center">
                  <p className="text-zinc-400 text-sm mb-1">Each person pays</p>
                  <p className="text-3xl font-bold text-amber-400">
                    {formatPrice(Math.ceil(totalCents / Math.max(1, covers)), currencySymbol)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowSplitBill(false)
                    handlePrintSplitBill('even')
                  }}
                  className="w-full min-h-[48px] px-6 rounded-xl text-base font-semibold bg-amber-500 hover:bg-amber-400 text-zinc-900 transition-colors"
                >
                  🖨 Print {covers} separate bills
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-zinc-400 text-sm">Assign each item to a seat (1–{covers}). Tap a seat number to assign.</p>
                <ul className="space-y-2">
                  {items.map((item) => {
                    const lineCents = item.quantity * item.price_cents
                    return (
                      <li key={item.id} className="bg-zinc-800 rounded-xl px-4 py-3">
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <span className="font-semibold text-white text-sm flex-1">{item.name}</span>
                          <span className="text-zinc-400 text-sm">×{item.quantity}</span>
                          <span className="text-amber-400 text-sm font-bold">{formatPrice(lineCents, currencySymbol)}</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
                              if (!supabaseUrl || !accessToken) return
                              setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, seat: null } : i))
                              void callSetItemSeat(supabaseUrl, accessToken, item.id, null).catch(() => { /* non-fatal */ })
                            }}
                            className={[
                              'min-h-[40px] px-3 rounded-lg text-xs font-semibold transition-colors border',
                              item.seat === null
                                ? 'border-zinc-400 bg-zinc-600 text-white'
                                : 'border-zinc-600 text-zinc-400 hover:border-zinc-400',
                            ].join(' ')}
                          >
                            Unassigned
                          </button>
                          {Array.from({ length: covers }, (_, i) => i + 1).map((seatNum) => (
                            <button
                              key={seatNum}
                              type="button"
                              onClick={() => {
                                const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
                                if (!supabaseUrl || !accessToken) return
                                setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, seat: seatNum } : i))
                                void callSetItemSeat(supabaseUrl, accessToken, item.id, seatNum).catch(() => { /* non-fatal */ })
                              }}
                              className={[
                                'min-h-[40px] min-w-[40px] rounded-lg text-xs font-semibold transition-colors border',
                                item.seat === seatNum
                                  ? 'border-amber-400 bg-amber-400/20 text-amber-400'
                                  : 'border-zinc-600 text-zinc-400 hover:border-zinc-400',
                              ].join(' ')}
                            >
                              {seatNum}
                            </button>
                          ))}
                        </div>
                      </li>
                    )
                  })}
                </ul>

                {/* Per-seat totals */}
                {covers > 0 && (
                  <div className="bg-zinc-800 rounded-xl px-4 py-3 space-y-1">
                    <p className="text-zinc-400 text-sm font-semibold mb-2">Per-seat totals</p>
                    {Array.from({ length: covers }, (_, i) => i + 1).map((seatNum) => {
                      const seatTotal = items
                        .filter((i) => i.seat === seatNum && !i.comp)
                        .reduce((sum, i) => sum + i.quantity * i.price_cents, 0)
                      return (
                        <div key={seatNum} className="flex justify-between text-sm">
                          <span className="text-zinc-400">Seat {seatNum}</span>
                          <span className="text-white font-semibold">{formatPrice(seatTotal, currencySymbol)}</span>
                        </div>
                      )
                    })}
                    {items.some((i) => i.seat === null) && (
                      <div className="flex justify-between text-sm">
                        <span className="text-zinc-500">Unassigned</span>
                        <span className="text-zinc-400">
                          {formatPrice(
                            items.filter((i) => i.seat === null && !i.comp).reduce((sum, i) => sum + i.quantity * i.price_cents, 0),
                            currencySymbol,
                          )}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setShowSplitBill(false)
                    handlePrintSplitBill('seat')
                  }}
                  className="w-full min-h-[48px] px-6 rounded-xl text-base font-semibold bg-amber-500 hover:bg-amber-400 text-zinc-900 transition-colors"
                >
                  🖨 Print by seat
                </button>
              </div>
            )}
          </div>
        </div>
      )}

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

      {/* Transfer table modal */}
      {showTransferModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70">
          <div className="w-full max-w-lg bg-zinc-800 rounded-t-2xl p-6 space-y-4 max-h-[80vh] overflow-y-auto">
            {transferTarget === null ? (
              <>
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold text-white">Move Table</h2>
                  <button
                    type="button"
                    onClick={() => { setShowTransferModal(false) }}
                    className="text-zinc-400 hover:text-white text-base px-3 py-2 min-h-[48px] min-w-[48px]"
                  >
                    ✕
                  </button>
                </div>
                <p className="text-zinc-400 text-base">Select a table to move this order to:</p>
                {transferTablesLoading && (
                  <p className="text-zinc-400 text-base">Loading tables…</p>
                )}
                {transferTablesError !== null && (
                  <p className="text-red-400 text-base">{transferTablesError}</p>
                )}
                {!transferTablesLoading && transferTablesError === null && availableTables.length === 0 && (
                  <p className="text-zinc-500 text-base">No available tables to move to.</p>
                )}
                {!transferTablesLoading && availableTables.length > 0 && (
                  <div className="grid grid-cols-2 gap-3">
                    {availableTables.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => { setTransferTarget(t); setTransferError(null) }}
                        className="min-h-[80px] rounded-xl bg-zinc-700 hover:bg-zinc-600 border-2 border-zinc-600 hover:border-amber-400 flex flex-col items-center justify-center gap-1 transition-colors"
                      >
                        <span className="text-white font-bold text-lg">{t.label}</span>
                        <span className="text-xs font-semibold text-green-400 bg-green-900/40 px-2 py-0.5 rounded-full">Empty</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <>
                <h2 className="text-xl font-semibold text-white">Confirm Move</h2>
                <p className="text-zinc-300 text-base">
                  Move order to{' '}
                  <span className="font-semibold text-white">{transferTarget.label}</span>?
                </p>
                {transferError !== null && (
                  <p className="text-red-400 text-base">{transferError}</p>
                )}
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => { setTransferTarget(null); setTransferError(null) }}
                    disabled={transferring}
                    className="flex-1 min-h-[48px] min-w-[48px] px-6 rounded-xl text-base font-semibold border-2 border-zinc-600 text-zinc-300 hover:border-zinc-400 transition-colors disabled:opacity-50"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={() => { void handleTransfer() }}
                    disabled={transferring}
                    className={[
                      'flex-1 min-h-[48px] min-w-[48px] px-6 rounded-xl text-base font-semibold transition-colors',
                      transferring
                        ? 'bg-zinc-700 text-zinc-400 cursor-wait'
                        : 'bg-amber-500 hover:bg-amber-400 text-zinc-900',
                    ].join(' ')}
                  >
                    {transferring ? 'Moving…' : 'Confirm'}
                  </button>
                </div>
              </>
            )}
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

      {/* Comp item dialog */}
      {compingItem !== null && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70">
          <div className="w-full max-w-lg bg-zinc-800 rounded-t-2xl p-6 space-y-4">
            <h2 className="text-xl font-semibold text-white">Comp Item</h2>
            <p className="text-zinc-300 text-base">
              Mark <span className="font-semibold text-white">{compingItem.name}</span> as complimentary?
            </p>
            <div>
              <label htmlFor="comp-reason" className="block text-zinc-400 text-base mb-2">
                Reason
              </label>
              <select
                id="comp-reason"
                value={compReason}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => { setCompReason(e.target.value) }}
                className="w-full min-h-[48px] px-4 rounded-xl text-base bg-zinc-700 text-white border-2 border-zinc-600 focus:border-emerald-400 focus:outline-none"
              >
                {COMP_REASONS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            {compError !== null && (
              <p className="text-base text-red-400">{compError}</p>
            )}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setCompingItem(null)
                  setCompError(null)
                }}
                disabled={compingInProgress}
                className="flex-1 min-h-[48px] min-w-[48px] px-6 rounded-xl text-base font-semibold border-2 border-zinc-600 text-zinc-300 hover:border-zinc-400 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => { void handleCompItem() }}
                disabled={compingInProgress}
                className={[
                  'flex-1 min-h-[48px] min-w-[48px] px-6 rounded-xl text-base font-semibold transition-colors',
                  compingInProgress
                    ? 'bg-zinc-700 text-zinc-400 cursor-wait'
                    : 'bg-emerald-700 hover:bg-emerald-600 text-white',
                ].join(' ')}
              >
                {compingInProgress ? 'Comping…' : 'Confirm Comp'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Comp entire order dialog */}
      {showOrderCompDialog && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70">
          <div className="w-full max-w-lg bg-zinc-800 rounded-t-2xl p-6 space-y-4">
            <h2 className="text-xl font-semibold text-white">Comp Entire Order</h2>
            <p className="text-zinc-300 text-base">This will mark the entire order as complimentary (no charge).</p>
            <div>
              <label htmlFor="order-comp-reason" className="block text-zinc-400 text-base mb-2">
                Reason
              </label>
              <select
                id="order-comp-reason"
                value={compReason}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => { setCompReason(e.target.value) }}
                className="w-full min-h-[48px] px-4 rounded-xl text-base bg-zinc-700 text-white border-2 border-zinc-600 focus:border-emerald-400 focus:outline-none"
              >
                {COMP_REASONS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            {compError !== null && (
              <p className="text-base text-red-400">{compError}</p>
            )}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowOrderCompDialog(false)
                  setCompError(null)
                }}
                disabled={compingInProgress}
                className="flex-1 min-h-[48px] min-w-[48px] px-6 rounded-xl text-base font-semibold border-2 border-zinc-600 text-zinc-300 hover:border-zinc-400 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => { void handleCompOrder() }}
                disabled={compingInProgress}
                className={[
                  'flex-1 min-h-[48px] min-w-[48px] px-6 rounded-xl text-base font-semibold transition-colors',
                  compingInProgress
                    ? 'bg-zinc-700 text-zinc-400 cursor-wait'
                    : 'bg-emerald-700 hover:bg-emerald-600 text-white',
                ].join(' ')}
              >
                {compingInProgress ? 'Comping…' : 'Confirm Comp Order'}
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
        {orderIsComp && (
          <div className="inline-flex items-center gap-2 bg-emerald-900/40 border border-emerald-700 rounded-xl px-4 py-2 mb-4">
            <span className="text-emerald-400 font-semibold text-base">★ Complimentary Order</span>
          </div>
        )}
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
          {orderIsComp ? (
            <span className="text-2xl font-bold text-emerald-400">COMPLIMENTARY</span>
          ) : (
            <span className="text-2xl font-bold text-white">{totalFormatted}</span>
          )}
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
              onClick={() => { void openTransferModal() }}
              className="w-full min-h-[48px] min-w-[48px] px-6 rounded-xl text-base font-semibold text-zinc-400 hover:text-amber-400 border-2 border-zinc-700 hover:border-amber-600 transition-colors mb-3"
            >
              ↔ Move Table
            </button>

            <button
              type="button"
              onClick={() => {
                setCancelReason('')
                setCancelError(null)
                setShowCancelDialog(true)
              }}
              className="w-full min-h-[48px] min-w-[48px] px-6 rounded-xl text-base font-semibold text-zinc-400 hover:text-red-400 border-2 border-zinc-700 hover:border-red-700 transition-colors mb-3"
            >
              Cancel order
            </button>

            {/* Comp entire order (owner only) */}
            {isAdmin && !orderIsComp && (
              <button
                type="button"
                onClick={() => {
                  setCompReason(COMP_REASONS[0])
                  setCompError(null)
                  setShowOrderCompDialog(true)
                }}
                className="w-full min-h-[48px] min-w-[48px] px-6 rounded-xl text-base font-semibold text-emerald-400 hover:text-white border-2 border-emerald-800 hover:border-emerald-600 hover:bg-emerald-900/40 transition-colors"
              >
                Comp entire order
              </button>
            )}

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
              {appliedDiscountCents > 0 && (
                <div className="flex justify-between text-emerald-400">
                  <span>Discount{appliedDiscountLabel ? ` (${appliedDiscountLabel})` : ''}</span>
                  <span>-{formatPrice(appliedDiscountCents, currencySymbol)}</span>
                </div>
              )}
              {orderIsComp && (
                <div className="flex justify-between text-emerald-400 font-semibold">
                  <span>★ Complimentary</span>
                  <span>-{formatPrice(billTotalCentsBeforeDiscount, currencySymbol)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-white border-t border-zinc-700 pt-1.5 mt-1">
                <span>Total</span>
                {orderIsComp ? (
                  <span className="text-emerald-400">COMPLIMENTARY</span>
                ) : (
                  <span>{formatPrice(billTotalCents, currencySymbol)}</span>
                )}
              </div>
            </div>

            {/* Apply Discount section (owner only) */}
            {isAdmin && !orderIsComp && (
              <div className="bg-zinc-800/60 rounded-xl px-4 py-3 space-y-3">
                <p className="text-zinc-300 text-sm font-semibold">Apply Discount</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => { setDiscountType('percent') }}
                    className={[
                      'flex-1 min-h-[44px] rounded-xl text-sm font-semibold transition-colors border-2',
                      discountType === 'percent'
                        ? 'border-amber-400 bg-amber-400/10 text-amber-400'
                        : 'border-zinc-600 text-zinc-300 hover:border-zinc-400',
                    ].join(' ')}
                  >
                    % Discount
                  </button>
                  <button
                    type="button"
                    onClick={() => { setDiscountType('flat') }}
                    className={[
                      'flex-1 min-h-[44px] rounded-xl text-sm font-semibold transition-colors border-2',
                      discountType === 'flat'
                        ? 'border-amber-400 bg-amber-400/10 text-amber-400'
                        : 'border-zinc-600 text-zinc-300 hover:border-zinc-400',
                    ].join(' ')}
                  >
                    Flat Amount
                  </button>
                </div>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="0"
                    step={discountType === 'percent' ? '1' : '0.01'}
                    placeholder={discountType === 'percent' ? '10' : '50.00'}
                    value={discountValueStr}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setDiscountValueStr(e.target.value) }}
                    className="flex-1 min-h-[48px] px-4 rounded-xl text-base bg-zinc-700 text-white border-2 border-zinc-600 focus:border-amber-400 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => { void handleApplyDiscount() }}
                    disabled={applyingDiscount || discountValueStr === ''}
                    className={[
                      'min-h-[48px] px-5 rounded-xl text-sm font-semibold transition-colors',
                      applyingDiscount || discountValueStr === ''
                        ? 'bg-zinc-700 text-zinc-400 cursor-wait'
                        : 'bg-amber-500 hover:bg-amber-400 text-zinc-900',
                    ].join(' ')}
                  >
                    {applyingDiscount ? '…' : 'Apply'}
                  </button>
                </div>
                {discountError !== null && (
                  <p className="text-sm text-red-400">{discountError}</p>
                )}
                {appliedDiscountCents > 0 && (
                  <p className="text-sm text-emerald-400">
                    ✓ Discount applied: -{formatPrice(appliedDiscountCents, currencySymbol)}
                  </p>
                )}
              </div>
            )}

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

            {paymentMethod === 'cash' && !orderIsComp && (
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
              {paying ? 'Recording…' : orderIsComp ? 'Confirm (Complimentary)' : `Confirm Payment · ${totalFormatted}`}
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
              onClick={() => {
                setSplitBillTab('even')
                setShowSplitBill(true)
              }}
              className="w-full min-h-[48px] min-w-[48px] px-6 rounded-xl text-base font-semibold transition-colors border-2 border-zinc-600 text-zinc-300 hover:border-amber-400 hover:text-amber-400"
            >
              ✂ Split Bill
            </button>

            <button
              type="button"
              onClick={() => { router.push('/tables') }}
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
