'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { JSX } from 'react'
import { fetchOrderItems, fetchOrderSummary, calcItemDiscountCents } from './orderData'
import type { OrderItem, CourseType } from './orderData'
import { callCloseOrder } from './closeOrderApi'
import { callRecordPayment } from './recordPaymentApi'
import { callVoidItem } from './voidItemApi'
import { callCancelOrder } from './cancelOrderApi'
import { callApplyDiscount } from './applyDiscountApi'
import { callApplyItemDiscount } from './applyItemDiscountApi'
import { callCompItem } from './compApi'
import { callTransferOrder } from './transferOrderApi'
import { markItemsSentToKitchen } from './kotApi'
import { callFireCourse, callServeCourse } from './fireCourseApi'
import { formatPrice, DEFAULT_CURRENCY_SYMBOL } from '@/lib/formatPrice'
import { calcVat } from '@/lib/vatCalc'
import { calcServiceCharge } from '@/lib/serviceChargeCalc'
import { fetchVatConfig, fetchOrderVatContext, fetchServiceChargePercent } from '@/lib/fetchVatConfig'
import { printKot, printBill, findPrinter } from '@/lib/kotPrint'
import type { PrinterConfig, PrinterProfile } from '@/lib/kotPrint'
import KotPrintView from '@/components/KotPrintView'
import BillPrintView from '@/components/BillPrintView'
import { supabase } from '@/lib/supabase'
import { useUser } from '@/lib/user-context'
import { callSetCovers, callSetItemSeat } from './splitBillApi'
import SplitBillPrintView from '@/components/SplitBillPrintView'
import {
  CheckCircle2,
  Flame,
  Clock,
  ShoppingBag,
  Bike,
  Printer as PrinterIcon,
  Scissors,
  AlertTriangle,
  Star,
  Check,
  X,
  Pencil,
  MessageCircle,
  Phone,
} from 'lucide-react'

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

  // Order type state (takeaway / delivery support)
  const [orderType, setOrderType] = useState<'dine_in' | 'takeaway' | 'delivery'>('dine_in')
  const [orderCustomerName, setOrderCustomerName] = useState<string | null>(null)
  const [orderDeliveryNote, setOrderDeliveryNote] = useState<string | null>(null)
  // Enhanced bill fields (issue #261)
  const [orderCustomerMobile, setOrderCustomerMobile] = useState<string | null>(null)
  const [orderBillNumber, setOrderBillNumber] = useState<string | null>(null)

  // Send Receipt modal state (issue #173)
  const [showReceiptModal, setShowReceiptModal] = useState(false)
  const [receiptMobile, setReceiptMobile] = useState<string>('')
  const [savingMobile, setSavingMobile] = useState(false)
  const [receiptMobileError, setReceiptMobileError] = useState<string | null>(null)

  // Restaurant config for enhanced bill (issue #261)
  const [restaurantName, setRestaurantName] = useState<string>('Lahore by iKitchen')
  const [restaurantAddress, setRestaurantAddress] = useState<string>('Lahore by iKitchen, Dhaka')
  const [binNumber, setBinNumber] = useState<string | undefined>(undefined)
  const [registerName, setRegisterName] = useState<string | undefined>(undefined)

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

  // Printer config state (legacy single-printer — kept for backward compat)
  const [printerConfig, setPrinterConfig] = useState<PrinterConfig | null>(null)
  // Multi-printer profiles (from `printers` table — issue #187)
  const [printers, setPrinters] = useState<PrinterProfile[]>([])

  // KOT state
  const [kotStatus, setKotStatus] = useState<string | null>(null)
  const [kotTimestamp, setKotTimestamp] = useState('')
  const [kotShowAll, setKotShowAll] = useState(false)
  const [reprintingKot, setReprintingKot] = useState(false)
  const [kotPrintError, setKotPrintError] = useState<string | null>(null)

  // Bill print state
  const [billTimestamp, setBillTimestamp] = useState('')
  const [printingBill, setPrintingBill] = useState(false)

  // Course management state
  const [firingCourse, setFiringCourse] = useState<CourseType | null>(null)
  const [servingCourse, setServingCourse] = useState<CourseType | null>(null)
  const [courseActionError, setCourseActionError] = useState<string | null>(null)
  // null = no active course print; 'starter'|'main'|'dessert' = printing that course
  const [kotCourseFilter, setKotCourseFilter] = useState<CourseType | null>(null)

  // Table label state
  const [tableLabel, setTableLabel] = useState<string>('')

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

  // Service charge config state (fetched once on load)
  const [serviceChargePercent, setServiceChargePercent] = useState(0)

  // Discount state
  const [discountType, setDiscountType] = useState<'percent' | 'flat'>('percent')
  const [discountValueStr, setDiscountValueStr] = useState<string>('')
  const [applyingDiscount, setApplyingDiscount] = useState(false)
  const [discountError, setDiscountError] = useState<string | null>(null)
  const [appliedDiscountCents, setAppliedDiscountCents] = useState(0)
  const [appliedDiscountLabel, setAppliedDiscountLabel] = useState<string | undefined>(undefined)

  // Item-level discount state
  const [discountingItem, setDiscountingItem] = useState<OrderItem | null>(null)
  const [itemDiscountType, setItemDiscountType] = useState<'percent' | 'fixed'>('percent')
  const [itemDiscountValueStr, setItemDiscountValueStr] = useState<string>('')
  const [applyingItemDiscount, setApplyingItemDiscount] = useState(false)
  const [itemDiscountError, setItemDiscountError] = useState<string | null>(null)

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
        setOrderType(summary.order_type)
        setOrderCustomerName(summary.customer_name)
        setOrderDeliveryNote(summary.delivery_note)
        setOrderCustomerMobile(summary.customer_mobile)
        setOrderBillNumber(summary.bill_number)
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
        Promise.all([
          fetchVatConfig(supabaseUrl, supabaseKey, restaurantId, menuId),
          fetchServiceChargePercent(supabaseUrl, supabaseKey, restaurantId),
          // Fetch restaurant name
          fetch(
            `${supabaseUrl}/rest/v1/restaurants?id=eq.${restaurantId}&select=name&limit=1`,
            { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } },
          ).then((r) => r.ok ? r.json() as Promise<Array<{ name: string }>> : Promise.resolve([])),
          // Fetch enhanced bill config keys in a single request
          fetch(
            `${supabaseUrl}/rest/v1/config?restaurant_id=eq.${restaurantId}&key=in.(bin_number,register_name,restaurant_address)&select=key,value`,
            { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } },
          ).then((r) => r.ok ? r.json() as Promise<Array<{ key: string; value: string }>> : Promise.resolve([])),
        ]),
      )
      .then(([config, scPercent, restaurantRows, configRows]) => {
        setVatPercent(config.vatPercent)
        setTaxInclusive(config.taxInclusive)
        setServiceChargePercent(scPercent)
        // Restaurant name
        if (Array.isArray(restaurantRows) && restaurantRows.length > 0) {
          setRestaurantName((restaurantRows as Array<{ name: string }>)[0].name)
        }
        // Enhanced bill config
        const cfgMap = new Map<string, string>()
        for (const row of (configRows as Array<{ key: string; value: string }>)) {
          cfgMap.set(row.key, row.value)
        }
        if (cfgMap.has('bin_number')) setBinNumber(cfgMap.get('bin_number'))
        if (cfgMap.has('register_name')) setRegisterName(cfgMap.get('register_name'))
        if (cfgMap.has('restaurant_address')) setRestaurantAddress(cfgMap.get('restaurant_address') ?? '')
      })
      .catch(() => {
        // Non-fatal: fall back to 0% VAT / 0% service charge (safe — no overcharging)
        setVatPercent(0)
        setTaxInclusive(false)
        setServiceChargePercent(0)
      })
      .finally(() => {
        setVatConfigLoading(false)
      })
  }

  function loadPrinterConfig(): void {
    // Load legacy printer_configs (backward compat)
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

    // Load multi-printer profiles (issue #187)
    void supabase
      .from('printers')
      .select('id, name, ip_address, port, type, enabled')
      .eq('enabled', true)
      .then(({ data }) => {
        if (data && Array.isArray(data)) {
          setPrinters(
            (data as Array<{ id: string; name: string; ip_address: string; port: number; type: string; enabled: boolean }>)
              .map((p) => ({
                id: p.id,
                name: p.name,
                ip_address: p.ip_address,
                port: p.port ?? 9100,
                type: p.type as 'kitchen' | 'cashier' | 'bar',
                enabled: p.enabled,
              })),
          )
        }
      }, () => {
        // Non-fatal: table may not exist yet — fall back to legacy config
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

  function loadTableLabel(): void {
    // For takeaway/delivery URL segments, skip DB lookup — label is derived from order type
    if (tableId === 'takeaway' || tableId === 'delivery') {
      setTableLabel(tableId === 'takeaway' ? 'TAKEAWAY' : 'DELIVERY')
      return
    }
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    if (!supabaseUrl || !supabaseKey) return
    const url = new URL(`${supabaseUrl}/rest/v1/tables`)
    url.searchParams.set('id', `eq.${tableId}`)
    url.searchParams.set('select', 'label')
    void fetch(url.toString(), {
      headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
    })
      .then((r) => r.json())
      .then((rows: Array<{ label: string }>) => {
        if (rows.length > 0 && rows[0].label) {
          setTableLabel(rows[0].label)
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
    loadTableLabel()
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

  // Exclude comp'd items from the subtotal.
  // Apply per-item discounts first (issue #254), then order-level discount below.
  const rawItemsTotalCents = items
    .filter((item) => !item.comp && !orderIsComp)
    .reduce((sum, item) => {
      const grossCents = item.quantity * item.price_cents
      const itemDiscount = calcItemDiscountCents(item)
      return sum + grossCents - itemDiscount
    }, 0)

  // Calculation order: Subtotal → Discount → Service Charge → VAT → Total
  // Step 1: apply discount to raw subtotal
  const postDiscountCents = orderIsComp
    ? 0
    : Math.max(0, rawItemsTotalCents - appliedDiscountCents)

  // Step 2: apply service charge to post-discount subtotal
  const scBreakdown = calcServiceCharge(postDiscountCents, orderIsComp ? 0 : serviceChargePercent)
  const billServiceChargeCents = scBreakdown.serviceChargeCents

  // Step 3: apply VAT to (post-discount + service charge) base
  const vatBase = postDiscountCents + billServiceChargeCents
  const vatBreakdown = calcVat(vatBase, vatPercent, taxInclusive)
  const { vatCents: billVatCents } = vatBreakdown

  // Displayed subtotal = raw items total (before any adjustments)
  const billSubtotalCents = rawItemsTotalCents

  const billTotalCents = orderIsComp ? 0 : vatBreakdown.totalCents

  // Displayed "total" in the order footer is the grand total
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

    // Empty order — just navigate back, keep the order open so the table stays occupied.
    // (Auto-cancel only happens on explicit "Close Order" — see handleCloseOrder)
    if (items.length === 0) {
      router.push('/tables')
      return
    }

    const unsentItems = items.filter((item) => !item.sent_to_kitchen)

    if (step === 'order' && unsentItems.length > 0 && supabaseUrl && supabaseKey) {
      const ts = new Date().toLocaleString()
      setKotTimestamp(ts)
      setKotStatus('Sending to kitchen…')
      setKotPrintError(null)

      // Group unsent items by their printer type (kitchen vs bar)
      const itemsByPrinterType = new Map<'kitchen' | 'bar', typeof unsentItems>()
      for (const item of unsentItems) {
        const pt: 'kitchen' | 'bar' = item.printerType === 'bar' ? 'bar' : 'kitchen'
        const group = itemsByPrinterType.get(pt) ?? []
        group.push(item)
        itemsByPrinterType.set(pt, group)
      }

      // Send each group to the correct printer
      let printErrors: string[] = []
      for (const [printerType, groupItems] of itemsByPrinterType) {
        const profile = printers.length > 0
          ? findPrinter(printers, printerType)
          : null
        const legacyConfig = printers.length === 0 ? printerConfig : null

        const result = await printKot({
          items: groupItems.map((i) => ({ name: i.name, qty: i.quantity })),
          tableId,
          orderId,
          timestamp: ts,
          printerProfile: profile,
          printerConfig: legacyConfig,
          onBeforeBrowserPrint: () => {
            // KotPrintView is already rendered — nothing extra needed
          },
        })

        if (result.errorMessage) {
          printErrors.push(`[${printerType}] ${result.errorMessage}`)
        }
      }

      if (printErrors.length > 0) {
        setKotPrintError(printErrors.join('\n\n'))
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

    // For reprints, route each item group to the correct printer
    const itemsByPrinterType = new Map<'kitchen' | 'bar', typeof items>()
    for (const item of items) {
      const pt: 'kitchen' | 'bar' = item.printerType === 'bar' ? 'bar' : 'kitchen'
      const group = itemsByPrinterType.get(pt) ?? []
      group.push(item)
      itemsByPrinterType.set(pt, group)
    }

    // If only one group and it's a browser print, use the standard flow with callbacks
    if (printers.length === 0 && printerConfig?.mode !== 'network') {
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
      if (result.errorMessage) {
        setKotPrintError(result.errorMessage)
      }
      return
    }

    // Network or multi-printer: send to each group
    let printErrors: string[] = []
    for (const [printerType, groupItems] of itemsByPrinterType) {
      const profile = printers.length > 0 ? findPrinter(printers, printerType) : null
      const legacyConfig = printers.length === 0 ? printerConfig : null

      const result = await printKot({
        items: groupItems.map((i) => ({ name: i.name, qty: i.quantity })),
        tableId,
        orderId,
        timestamp: ts,
        printerProfile: profile,
        printerConfig: legacyConfig,
      })

      if (result.errorMessage) {
        printErrors.push(`[${printerType}] ${result.errorMessage}`)
      }
    }

    setKotShowAll(false)
    setReprintingKot(false)

    if (printErrors.length > 0) {
      setKotPrintError(printErrors.join('\n\n'))
    }
  }

  // Fire a specific course: print course KOT, then mark items as sent + fired
  async function handleFireCourse(course: CourseType): Promise<void> {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    if (!supabaseUrl || !supabaseKey || !accessToken) return

    const courseItems = items.filter((i) => i.course === course && !i.sent_to_kitchen && !i.comp)
    if (courseItems.length === 0) return

    setCourseActionError(null)
    setFiringCourse(course)

    const ts = new Date().toLocaleString()
    setKotTimestamp(ts)
    setKotCourseFilter(course)

    try {
      // Group course items by printer type and send to correct printer
      const courseItemsByPrinterType = new Map<'kitchen' | 'bar', typeof courseItems>()
      for (const item of courseItems) {
        const pt: 'kitchen' | 'bar' = item.printerType === 'bar' ? 'bar' : 'kitchen'
        const group = courseItemsByPrinterType.get(pt) ?? []
        group.push(item)
        courseItemsByPrinterType.set(pt, group)
      }

      let firePrintErrors: string[] = []
      for (const [printerType, groupItems] of courseItemsByPrinterType) {
        const profile = printers.length > 0 ? findPrinter(printers, printerType) : null
        const legacyConfig = printers.length === 0 ? printerConfig : null

        const result = await printKot({
          items: groupItems.map((i) => ({ name: i.name, qty: i.quantity })),
          tableId,
          orderId,
          timestamp: ts,
          printerProfile: profile,
          printerConfig: legacyConfig,
          onBeforeBrowserPrint: () => { /* KotPrintView already rendered with courseFilter */ },
        })

        if (result.errorMessage) {
          firePrintErrors.push(`[${printerType}] ${result.errorMessage}`)
        }
      }

      if (firePrintErrors.length > 0) {
        setKotPrintError(firePrintErrors.join('\n\n'))
        setKotCourseFilter(null)
        setFiringCourse(null)
        return
      }

      // Mark items as fired in the DB
      await callFireCourse(supabaseUrl, accessToken, orderId, course)

      // Update local state optimistically
      setItems((prev) =>
        prev.map((i) =>
          i.course === course && !i.sent_to_kitchen
            ? { ...i, sent_to_kitchen: true, course_status: 'fired' }
            : i,
        ),
      )
    } catch (err) {
      setCourseActionError(err instanceof Error ? err.message : `Failed to fire ${course}`)
    } finally {
      setKotCourseFilter(null)
      setFiringCourse(null)
    }
  }

  // Mark a course as served (no KOT, just status update)
  async function handleServeCourse(course: CourseType): Promise<void> {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!supabaseUrl || !accessToken) return

    setCourseActionError(null)
    setServingCourse(course)
    try {
      await callServeCourse(supabaseUrl, accessToken, orderId, course)

      // Update local state optimistically
      setItems((prev) =>
        prev.map((i) =>
          i.course === course ? { ...i, course_status: 'served' } : i,
        ),
      )
    } catch (err) {
      setCourseActionError(err instanceof Error ? err.message : `Failed to serve ${course}`)
    } finally {
      setServingCourse(null)
    }
  }

  // Print Bill: route to cashier printer if available, otherwise browser print
  function handlePrintBill(): void {
    const ts = new Date().toLocaleString()
    setBillTimestamp(ts)
    setPrintingBill(true)

    const cashierProfile = printers.length > 0 ? findPrinter(printers, 'cashier') : null

    if (cashierProfile) {
      // Send ESC/POS bill to network cashier printer
      void printBill({
        items: items.map((i) => ({
          name: i.name,
          qty: i.quantity,
          // Apply per-item discount to the line total sent to the ESC/POS printer
          lineCents: (i.comp || orderIsComp)
            ? 0
            : i.quantity * i.price_cents - calcItemDiscountCents(i),
          comp: i.comp || orderIsComp,
        })),
        tableId,
        orderId,
        timestamp: ts,
        billOpts: {
          subtotalCents: billSubtotalCents,
          discountCents: appliedDiscountCents,
          discountLabel: appliedDiscountLabel,
          serviceChargeCents: billServiceChargeCents,
          serviceChargePercent,
          vatCents: billVatCents,
          vatPercent,
          taxInclusive,
          totalCents: billTotalCents,
          paymentMethod: billPaymentMethod,
          amountTenderedCents: billAmountTenderedCents,
          changeDueCents: billPaymentMethod === 'cash' ? changeDueCents : undefined,
          orderComp: orderIsComp,
        },
        printerProfile: cashierProfile,
        onAfterBrowserPrint: () => { setPrintingBill(false) },
      }).then((result) => {
        setPrintingBill(false)
        if (result.errorMessage) {
          setKotPrintError(`Bill print error: ${result.errorMessage}`)
        }
      }).catch(() => { setPrintingBill(false) })
      return
    }

    // Browser print fallback
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

    // Fully comped order (total = ৳0) — skip payment recording, go straight to success
    if (billTotalCents === 0) {
      setConfirmedPaymentMethod(paymentMethod)
      setStep('success')
      return
    }

    setPaying(true)
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      if (!supabaseUrl || !accessToken) {
        throw new Error('Not authenticated')
      }
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

  async function handleApplyItemDiscount(): Promise<void> {
    if (!discountingItem) return
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!supabaseUrl || !accessToken) {
      setItemDiscountError('Not authenticated')
      return
    }
    const val = parseFloat(itemDiscountValueStr)
    if (isNaN(val) || val <= 0) {
      setItemDiscountError('Please enter a valid discount value')
      return
    }
    if (itemDiscountType === 'percent' && val > 100) {
      setItemDiscountError('Percentage cannot exceed 100')
      return
    }
    setItemDiscountError(null)
    setApplyingItemDiscount(true)
    try {
      const result = await callApplyItemDiscount(supabaseUrl, accessToken, discountingItem.id, itemDiscountType, val)
      // Update the item in local state so the UI reflects the discount immediately
      setItems((prev) =>
        prev.map((i) =>
          i.id === discountingItem.id
            ? { ...i, item_discount_type: result.item_discount_type, item_discount_value: result.item_discount_value }
            : i,
        ),
      )
      setDiscountingItem(null)
      setItemDiscountValueStr('')
    } catch (err) {
      setItemDiscountError(err instanceof Error ? err.message : 'Failed to apply item discount')
    } finally {
      setApplyingItemDiscount(false)
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
      router.push('/tables')
    } catch (err) {
      setTransferError(err instanceof Error ? err.message : 'Failed to transfer order')
    } finally {
      setTransferring(false)
    }
  }

  // ─── Send Receipt (issue #173) ───────────────────────────────────────────
  function generateReceiptText(): string {
    const lines: string[] = []
    lines.push(restaurantName)
    if (restaurantAddress) lines.push(restaurantAddress)
    lines.push('')
    lines.push(`Date: ${new Date().toLocaleString()}`)
    if (orderBillNumber) lines.push(`Bill: ${orderBillNumber}`)
    lines.push('─'.repeat(32))
    for (const item of items) {
      const isComp = item.comp || orderIsComp
      const lineCents = isComp ? 0 : item.quantity * item.price_cents - calcItemDiscountCents(item)
      const priceStr = isComp ? 'Free' : formatPrice(lineCents, currencySymbol)
      lines.push(`${item.name} x${item.quantity}  ${priceStr}`)
    }
    lines.push('─'.repeat(32))
    if (!orderIsComp) {
      lines.push(`Subtotal: ${formatPrice(billSubtotalCents, currencySymbol)}`)
      if (appliedDiscountCents > 0) {
        lines.push(`Discount: -${formatPrice(appliedDiscountCents, currencySymbol)}`)
      }
      if (serviceChargePercent > 0 && billServiceChargeCents > 0) {
        lines.push(`Service Charge (${serviceChargePercent}%): ${formatPrice(billServiceChargeCents, currencySymbol)}`)
      }
      if (vatPercent > 0 && billVatCents > 0) {
        lines.push(`VAT ${vatPercent}%${taxInclusive ? ' (incl.)' : ''}: ${formatPrice(billVatCents, currencySymbol)}`)
      }
      lines.push(`Total: ${formatPrice(billTotalCents, currencySymbol)}`)
    } else {
      lines.push('Total: COMPLIMENTARY')
    }
    const pm = confirmedPaymentMethod ?? paidPaymentMethod ?? 'Unknown'
    lines.push(`Payment: ${pm.charAt(0).toUpperCase() + pm.slice(1)}`)
    lines.push('')
    lines.push('Thank you for dining with us!')
    return lines.join('\n')
  }

  function handleOpenReceiptModal(): void {
    setReceiptMobile(orderCustomerMobile ?? '')
    setReceiptMobileError(null)
    setShowReceiptModal(true)
  }

  async function handleSendReceipt(channel: 'whatsapp' | 'sms'): Promise<void> {
    const mobile = receiptMobile.trim().replace(/\s+/g, '')
    if (!mobile) {
      setReceiptMobileError('Please enter a mobile number')
      return
    }

    // Save mobile to DB if it was not already set on the order
    if (!orderCustomerMobile && mobile) {
      setSavingMobile(true)
      try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
        const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
        if (supabaseUrl && supabaseKey) {
          await fetch(`${supabaseUrl}/rest/v1/orders?id=eq.${orderId}`, {
            method: 'PATCH',
            headers: {
              apikey: supabaseKey,
              Authorization: `Bearer ${supabaseKey}`,
              'Content-Type': 'application/json',
              Prefer: 'return=minimal',
            },
            body: JSON.stringify({ customer_mobile: mobile }),
          })
          setOrderCustomerMobile(mobile)
        }
      } catch {
        // Non-fatal — still open the link
      } finally {
        setSavingMobile(false)
      }
    }

    const receiptText = generateReceiptText()
    const encodedText = encodeURIComponent(receiptText)

    // Strip leading + for wa.me (it handles international format)
    const mobileForWa = mobile.startsWith('+') ? mobile.slice(1) : mobile

    if (channel === 'whatsapp') {
      window.open(`https://wa.me/${mobileForWa}?text=${encodedText}`, '_blank', 'noopener,noreferrer')
    } else {
      // sms: link — mobile kept as-is (may include +)
      window.open(`sms:${mobile}?body=${encodedText}`, '_blank', 'noopener,noreferrer')
    }

    setShowReceiptModal(false)
  }
  // ─────────────────────────────────────────────────────────────────────────

  // Render a single item row (shared between course view and read-only view)
  function renderItemRow(item: OrderItem, inOrderStep: boolean): JSX.Element {
    const isComp = item.comp || orderIsComp
    const grossLineCents = item.quantity * item.price_cents
    const itemDiscountCents = isComp ? 0 : calcItemDiscountCents(item)
    const lineTotalCents = grossLineCents - itemDiscountCents
    const hasItemDiscount = !isComp && itemDiscountCents > 0
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
              <div className="flex flex-col items-end">
                {hasItemDiscount && (
                  <span className="text-zinc-500 line-through text-sm">{formatPrice(grossLineCents, currencySymbol)}</span>
                )}
                <span className={['font-bold', hasItemDiscount ? 'text-emerald-400' : 'text-amber-400'].join(' ')}>
                  {formatPrice(lineTotalCents, currencySymbol)}
                </span>
                {hasItemDiscount && item.item_discount_type === 'percent' && item.item_discount_value != null && (
                  <span className="text-xs text-emerald-500">-{item.item_discount_value / 100}%</span>
                )}
                {hasItemDiscount && item.item_discount_type === 'fixed' && (
                  <span className="text-xs text-emerald-500">-{formatPrice(itemDiscountCents, currencySymbol)}</span>
                )}
              </div>
            </>
          )}
          {inOrderStep && (
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
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setDiscountingItem(item)
                      setItemDiscountType('percent')
                      setItemDiscountValueStr('')
                      setItemDiscountError(null)
                    }}
                    className="min-h-[48px] min-w-[48px] px-3 rounded-lg text-sm font-semibold text-amber-400 hover:text-white hover:bg-amber-700 transition-colors"
                  >
                    {item.item_discount_type ? <Pencil size={12} aria-hidden='true' /> : '%'}
                  </button>
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
                </>
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
  }

  function renderCourseStatusBadge(course: CourseType): JSX.Element | null {
    // Derive status: if any item in course has course_status 'served', whole course is served.
    // If any is 'fired', course is fired. Otherwise waiting.
    const courseItems = items.filter((i) => i.course === course && !i.comp && !orderIsComp)
    if (courseItems.length === 0) return null

    const statuses = new Set(courseItems.map((i) => i.course_status))
    let badge: JSX.Element
    if (statuses.has('served')) {
      badge = <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-green-900/60 text-green-400 inline-flex items-center gap-1"><CheckCircle2 size={12} aria-hidden="true" />Served</span>
    } else if (statuses.has('fired')) {
      badge = <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-orange-900/60 text-orange-400 inline-flex items-center gap-1"><Flame size={12} aria-hidden="true" />Fired</span>
    } else {
      badge = <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-zinc-700 text-zinc-400 inline-flex items-center gap-1"><Clock size={12} aria-hidden="true" />Waiting</span>
    }
    return badge
  }

  const COURSE_SECTIONS: { course: CourseType; label: string }[] = [
    { course: 'starter', label: 'Starter' },
    { course: 'main', label: 'Main' },
    { course: 'dessert', label: 'Dessert' },
  ]

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

    const inOrderStep = step === 'order'

    // Group items by course, only render sections that have items
    const sections = COURSE_SECTIONS.filter(({ course }) =>
      items.some((i) => i.course === course),
    )

    return (
      <div className="space-y-6 mb-6">
        {sections.map(({ course, label }) => {
          const courseItems = items.filter((i) => i.course === course)
          const unfiredItems = courseItems.filter((i) => !i.sent_to_kitchen && !i.comp && !orderIsComp)
          const statusBadge = renderCourseStatusBadge(course)

          // All non-comp items for this course are either fired or served
          const allFired = courseItems
            .filter((i) => !i.comp && !orderIsComp)
            .every((i) => i.sent_to_kitchen)

          const allServed = courseItems
            .filter((i) => !i.comp && !orderIsComp)
            .every((i) => i.course_status === 'served')

          const isFiring = firingCourse === course
          const isServing = servingCourse === course

          return (
            <section key={course}>
              {/* Course header */}
              <div className="flex items-center gap-3 mb-3">
                <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider">{label}</h3>
                {statusBadge}
              </div>

              {/* Items */}
              <ul className="space-y-2">
                {courseItems.map((item) => renderItemRow(item, inOrderStep))}
              </ul>

              {/* Course action buttons (only in order step) */}
              {inOrderStep && !orderIsComp && (
                <div className="flex gap-2 mt-3">
                  {/* Fire Course button: only shown when there are unsent items */}
                  {unfiredItems.length > 0 && (
                    <button
                      type="button"
                      onClick={() => { void handleFireCourse(course) }}
                      disabled={isFiring || isServing}
                      className={[
                        'flex-1 min-h-[44px] rounded-xl text-sm font-semibold transition-colors border-2',
                        isFiring
                          ? 'border-orange-700 bg-orange-900/20 text-orange-400 cursor-wait'
                          : 'border-orange-600 text-orange-400 hover:bg-orange-900/30 hover:border-orange-400',
                      ].join(' ')}
                    >
                      {isFiring ? 'Firing…' : `Fire ${label}`}
                    </button>
                  )}

                  {/* Mark Served button: shown when all items are fired but not yet served */}
                  {allFired && !allServed && unfiredItems.length === 0 && (
                    <button
                      type="button"
                      onClick={() => { void handleServeCourse(course) }}
                      disabled={isServing || isFiring}
                      className={[
                        'flex-1 min-h-[44px] rounded-xl text-sm font-semibold transition-colors border-2',
                        isServing
                          ? 'border-green-700 bg-green-900/20 text-green-400 cursor-wait'
                          : 'border-green-700 text-green-400 hover:bg-green-900/30 hover:border-green-400',
                      ].join(' ')}
                    >
                      {isServing ? 'Marking…' : `${label} Served`}
                    </button>
                  )}
                </div>
              )}
            </section>
          )
        })}

        {/* Course action error */}
        {courseActionError !== null && (
          <p className="text-sm text-red-400">{courseActionError}</p>
        )}
      </div>
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
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <div className="inline-flex items-center gap-2 bg-green-900/40 border border-green-700 rounded-xl px-4 py-2">
              <span className="text-green-400 font-semibold text-base">Paid</span>
            </div>
            {orderType === 'takeaway' && (
              <div className="inline-flex items-center gap-2 bg-amber-900/40 border border-amber-700 rounded-xl px-4 py-2">
                <span className="text-amber-400 font-semibold text-base inline-flex items-center gap-1"><ShoppingBag size={16} aria-hidden="true" />Takeaway</span>
              </div>
            )}
            {orderType === 'delivery' && (
              <div className="inline-flex items-center gap-2 bg-blue-900/40 border border-blue-700 rounded-xl px-4 py-2">
                <span className="text-blue-400 font-semibold text-base inline-flex items-center gap-1"><Bike size={16} aria-hidden="true" />Delivery</span>
              </div>
            )}
          </div>
          <dl className="space-y-2 text-base">
            {orderType === 'dine_in' && (
              <div className="flex gap-3">
                <dt className="text-zinc-500">Table</dt>
                <dd className="font-semibold text-white">{tableLabel || tableId}</dd>
              </div>
            )}
            {orderType === 'delivery' && orderCustomerName && (
              <div className="flex gap-3">
                <dt className="text-zinc-500">Customer</dt>
                <dd className="font-semibold text-white">{orderCustomerName}</dd>
              </div>
            )}
            {orderType === 'delivery' && orderDeliveryNote && (
              <div className="flex gap-3">
                <dt className="text-zinc-500">Note</dt>
                <dd className="text-zinc-300">{orderDeliveryNote}</dd>
              </div>
            )}
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
      {/* KOT print component — only marked as print-area when KOT is actively printing */}
      <div className={kotStatus !== null || reprintingKot || firingCourse !== null ? 'print-area' : ''}>
        <KotPrintView
          tableLabel={tableLabel || tableId.slice(0, 8)}
          orderId={orderId}
          items={items}
          timestamp={kotTimestamp}
          showAll={kotShowAll}
          courseFilter={kotCourseFilter ?? undefined}
          orderType={orderType}
          customerName={orderCustomerName}
          deliveryNote={orderDeliveryNote}
        />
      </div>

      {/* Bill print component — only marked as print-area when bill is actively printing */}
      {!splitBillPrinting && (
        <div className={printingBill ? 'print-area' : ''}>
          <BillPrintView
            tableLabel={tableLabel || tableId.slice(0, 8)}
            orderId={orderId}
            items={items}
            subtotalCents={billSubtotalCents}
            vatPercent={vatPercent}
            taxInclusive={taxInclusive}
            vatCents={billVatCents}
            totalCents={billTotalCents}
            paymentMethod={billPaymentMethod}
            amountTenderedCents={billAmountTenderedCents}
            changeDueCents={billPaymentMethod === 'cash' ? changeDueCents : undefined}
            timestamp={billTimestamp}
            discountAmountCents={appliedDiscountCents}
            discountLabel={appliedDiscountLabel}
            orderComp={orderIsComp}
            serviceChargePercent={serviceChargePercent}
            serviceChargeCents={billServiceChargeCents}
            orderType={orderType}
            customerName={orderCustomerName}
            deliveryNote={orderDeliveryNote}
            customerMobile={orderCustomerMobile}
            restaurantName={restaurantName}
            restaurantAddress={restaurantAddress}
            binNumber={binNumber}
            billNumber={orderBillNumber ?? undefined}
            registerName={registerName}
          />
        </div>
      )}

      {/* Split bill print component — only marked as print-area when split bill is printing */}
      {splitBillPrinting && (
        <div className="print-area">
          <SplitBillPrintView
            tableLabel={tableLabel || tableId.slice(0, 8)}
            orderId={orderId}
            items={items}
            covers={covers}
            vatPercent={vatPercent}
            taxInclusive={taxInclusive}
            timestamp={splitBillTimestamp}
            evenSplit={splitBillPrintMode === 'even'}
            serviceChargePercent={serviceChargePercent}
            restaurantName={restaurantName}
            restaurantAddress={restaurantAddress}
            binNumber={binNumber}
            billNumber={orderBillNumber ?? undefined}
            registerName={registerName}
          />
        </div>
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
                className="min-h-[48px] min-w-[48px] text-zinc-400 hover:text-white flex items-center justify-center"
                aria-label="Close"
              >
                <X size={20} aria-hidden="true" />
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
                  <span className="inline-flex items-center gap-1"><PrinterIcon size={16} aria-hidden="true" />Print {covers} separate bills</span>
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
                  <span className="inline-flex items-center gap-1"><PrinterIcon size={16} aria-hidden="true" />Print by seat</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Send Receipt modal (issue #173) */}
      {showReceiptModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70">
          <div className="w-full max-w-lg bg-zinc-800 rounded-t-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-white">Send Digital Receipt</h2>
              <button
                type="button"
                onClick={() => { setShowReceiptModal(false) }}
                className="min-h-[48px] min-w-[48px] text-zinc-400 hover:text-white flex items-center justify-center"
                aria-label="Close"
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>
            <div>
              <label htmlFor="receipt-mobile" className="block text-zinc-400 text-base mb-2">
                Customer mobile number
              </label>
              <input
                id="receipt-mobile"
                type="tel"
                placeholder="+8801XXXXXXXXX"
                value={receiptMobile}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  setReceiptMobile(e.target.value)
                  setReceiptMobileError(null)
                }}
                className="w-full min-h-[48px] px-4 rounded-xl text-base bg-zinc-700 text-white border-2 border-zinc-600 focus:border-amber-400 focus:outline-none"
              />
            </div>
            {receiptMobileError !== null && (
              <p className="text-sm text-red-400">{receiptMobileError}</p>
            )}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => { void handleSendReceipt('whatsapp') }}
                disabled={savingMobile}
                className={[
                  'flex-1 min-h-[48px] min-w-[48px] px-4 rounded-xl text-base font-semibold transition-colors inline-flex items-center justify-center gap-2',
                  savingMobile
                    ? 'bg-zinc-700 text-zinc-400 cursor-wait'
                    : 'bg-green-700 hover:bg-green-600 text-white',
                ].join(' ')}
              >
                <MessageCircle size={18} aria-hidden="true" />
                WhatsApp
              </button>
              <button
                type="button"
                onClick={() => { void handleSendReceipt('sms') }}
                disabled={savingMobile}
                className={[
                  'flex-1 min-h-[48px] min-w-[48px] px-4 rounded-xl text-base font-semibold transition-colors inline-flex items-center justify-center gap-2',
                  savingMobile
                    ? 'bg-zinc-700 text-zinc-400 cursor-wait'
                    : 'bg-blue-700 hover:bg-blue-600 text-white',
                ].join(' ')}
              >
                <Phone size={18} aria-hidden="true" />
                SMS
              </button>
            </div>
            {savingMobile && (
              <p className="text-xs text-zinc-400 text-center">Saving mobile number…</p>
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
                    className="text-zinc-400 hover:text-white px-3 py-2 min-h-[48px] min-w-[48px] flex items-center justify-center"
                    aria-label="Close"
                  >
                    <X size={20} aria-hidden="true" />
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

      {/* Item-level discount dialog */}
      {discountingItem !== null && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70">
          <div className="w-full max-w-lg bg-zinc-800 rounded-t-2xl p-6 space-y-4">
            <h2 className="text-xl font-semibold text-white">Item Discount</h2>
            <p className="text-zinc-300 text-base">
              Apply discount to <span className="font-semibold text-white">{discountingItem.name}</span>
              {discountingItem.item_discount_type && (
                <span className="ml-2 text-xs text-amber-400">(already discounted — will replace)</span>
              )}
            </p>

            {/* Discount type toggle */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setItemDiscountType('percent') }}
                className={[
                  'flex-1 min-h-[44px] rounded-xl text-sm font-semibold transition-colors border-2',
                  itemDiscountType === 'percent'
                    ? 'border-amber-400 bg-amber-400/10 text-amber-400'
                    : 'border-zinc-600 text-zinc-300 hover:border-zinc-400',
                ].join(' ')}
              >
                % Off
              </button>
              <button
                type="button"
                onClick={() => { setItemDiscountType('fixed') }}
                className={[
                  'flex-1 min-h-[44px] rounded-xl text-sm font-semibold transition-colors border-2',
                  itemDiscountType === 'fixed'
                    ? 'border-amber-400 bg-amber-400/10 text-amber-400'
                    : 'border-zinc-600 text-zinc-300 hover:border-zinc-400',
                ].join(' ')}
              >
                Flat Amount
              </button>
            </div>

            <div>
              <label htmlFor="item-discount-value" className="block text-zinc-400 text-base mb-2">
                {itemDiscountType === 'percent' ? 'Percentage (e.g. 10 for 10%)' : `Amount in ${currencySymbol} (e.g. 50)`}
              </label>
              <input
                id="item-discount-value"
                type="number"
                min="0"
                max={itemDiscountType === 'percent' ? '100' : undefined}
                step={itemDiscountType === 'percent' ? '1' : '0.01'}
                placeholder={itemDiscountType === 'percent' ? '10' : '50.00'}
                value={itemDiscountValueStr}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setItemDiscountValueStr(e.target.value) }}
                className="w-full min-h-[48px] px-4 rounded-xl text-base bg-zinc-700 text-white border-2 border-zinc-600 focus:border-amber-400 focus:outline-none"
              />
            </div>

            {itemDiscountError !== null && (
              <p className="text-base text-red-400">{itemDiscountError}</p>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setDiscountingItem(null)
                  setItemDiscountValueStr('')
                  setItemDiscountError(null)
                }}
                disabled={applyingItemDiscount}
                className="flex-1 min-h-[48px] min-w-[48px] px-6 rounded-xl text-base font-semibold border-2 border-zinc-600 text-zinc-300 hover:border-zinc-400 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => { void handleApplyItemDiscount() }}
                disabled={applyingItemDiscount || itemDiscountValueStr === ''}
                className={[
                  'flex-1 min-h-[48px] min-w-[48px] px-6 rounded-xl text-base font-semibold transition-colors',
                  applyingItemDiscount || itemDiscountValueStr === ''
                    ? 'bg-zinc-700 text-zinc-400 cursor-wait'
                    : 'bg-amber-500 hover:bg-amber-400 text-zinc-900',
                ].join(' ')}
              >
                {applyingItemDiscount ? 'Applying…' : 'Apply Discount'}
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
          <p className="font-semibold mb-1 flex items-center gap-2"><AlertTriangle size={16} aria-hidden="true" />Printer error</p>
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
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {orderIsComp && (
            <div className="inline-flex items-center gap-2 bg-emerald-900/40 border border-emerald-700 rounded-xl px-4 py-2">
              <span className="text-emerald-400 font-semibold text-base inline-flex items-center gap-1"><Star size={16} aria-hidden="true" />Complimentary Order</span>
            </div>
          )}
          {orderType === 'takeaway' && (
            <div className="inline-flex items-center gap-2 bg-amber-900/40 border border-amber-700 rounded-xl px-4 py-2">
              <span className="text-amber-400 font-semibold text-base inline-flex items-center gap-1"><ShoppingBag size={16} aria-hidden="true" />Takeaway</span>
            </div>
          )}
          {orderType === 'delivery' && (
            <div className="inline-flex items-center gap-2 bg-blue-900/40 border border-blue-700 rounded-xl px-4 py-2">
              <span className="text-blue-400 font-semibold text-base inline-flex items-center gap-1"><Bike size={16} aria-hidden="true" />Delivery</span>
            </div>
          )}
        </div>
        <dl className="space-y-2 text-base">
          {orderType === 'dine_in' && (
            <div className="flex gap-3">
              <dt className="text-zinc-500">Table</dt>
              <dd className="font-semibold text-white">{tableLabel || tableId}</dd>
            </div>
          )}
          {orderType === 'delivery' && orderCustomerName && (
            <div className="flex gap-3">
              <dt className="text-zinc-500">Customer</dt>
              <dd className="font-semibold text-white">{orderCustomerName}</dd>
            </div>
          )}
          {orderType === 'delivery' && orderDeliveryNote && (
            <div className="flex gap-3">
              <dt className="text-zinc-500">Note</dt>
              <dd className="text-zinc-300">{orderDeliveryNote}</dd>
            </div>
          )}
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
                {reprintingKot ? 'Reprinting…' : <span className='inline-flex items-center gap-1'><PrinterIcon size={16} aria-hidden='true' />Reprint KOT</span>}
              </button>
            )}

            {orderType === 'dine_in' && (
              <button
                type="button"
                onClick={() => { void openTransferModal() }}
                className="w-full min-h-[48px] min-w-[48px] px-6 rounded-xl text-base font-semibold text-zinc-400 hover:text-amber-400 border-2 border-zinc-700 hover:border-amber-600 transition-colors mb-3"
              >
                ↔ Move Table
              </button>
            )}

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
              {appliedDiscountCents > 0 && (
                <div className="flex justify-between text-emerald-400">
                  <span>Discount{appliedDiscountLabel ? ` (${appliedDiscountLabel})` : ''}</span>
                  <span>-{formatPrice(appliedDiscountCents, currencySymbol)}</span>
                </div>
              )}
              {serviceChargePercent > 0 && billServiceChargeCents > 0 && !orderIsComp && (
                <div className="flex justify-between text-zinc-400">
                  <span>Service Charge ({serviceChargePercent}%)</span>
                  <span>{formatPrice(billServiceChargeCents, currencySymbol)}</span>
                </div>
              )}
              {billVatCents > 0 && (
                <div className="flex justify-between text-zinc-400">
                  <span>VAT {vatPercent}%{taxInclusive ? ' (incl.)' : ''}</span>
                  <span>{formatPrice(billVatCents, currencySymbol)}</span>
                </div>
              )}
              {orderIsComp && (
                <div className="flex justify-between text-emerald-400 font-semibold">
                  <span className="inline-flex items-center gap-1"><Star size={14} aria-hidden="true" />Complimentary</span>
                  <span>COMP</span>
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
                    Discount applied: -{formatPrice(appliedDiscountCents, currencySymbol)}
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
              {printingBill ? 'Printing…' : <span className='inline-flex items-center gap-1'><PrinterIcon size={16} aria-hidden='true' />Print Bill</span>}
            </button>

            <button
              type="button"
              onClick={() => {
                setSplitBillTab('even')
                setShowSplitBill(true)
              }}
              className="w-full min-h-[48px] min-w-[48px] px-6 rounded-xl text-base font-semibold transition-colors border-2 border-zinc-600 text-zinc-300 hover:border-amber-400 hover:text-amber-400"
            >
              <span className="inline-flex items-center gap-1"><Scissors size={16} aria-hidden="true" />Split Bill</span>
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
            <div className="mb-2 text-green-400 flex justify-center"><CheckCircle2 size={64} aria-hidden="true" /></div>
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
              {printingBill ? 'Printing…' : <span className='inline-flex items-center gap-1'><PrinterIcon size={16} aria-hidden='true' />Print Bill</span>}
            </button>
            <button
              type="button"
              onClick={handleOpenReceiptModal}
              className="w-full min-h-[48px] min-w-[48px] px-6 rounded-xl text-base font-semibold transition-colors border-2 border-zinc-600 bg-zinc-700 hover:bg-zinc-600 text-white inline-flex items-center justify-center gap-2"
            >
              <MessageCircle size={16} aria-hidden="true" />
              Send Receipt
            </button>
            <p className="text-zinc-400 text-base">Returning to tables…</p>
          </div>
        )}
      </footer>
    </main>
  )
}
