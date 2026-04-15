'use client'

import React, { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { JSX } from 'react'
import { fetchOrderItems, fetchOrderSummary, calcItemDiscountCents } from './orderData'
import type { OrderItem, CourseType, PaymentLine } from './orderData'
import { callCloseOrder } from './closeOrderApi'
import { callMarkOrderDue } from './markOrderDueApi'
import { callReopenOrderForItems } from './reopenOrderForItemsApi'
import { callRecordSplitPayment } from './recordPaymentApi'
import type { SplitPaymentEntry } from './recordPaymentApi'
import { callVoidItem } from './voidItemApi'
import { callCancelOrder } from './cancelOrderApi'
import { callApplyDiscount } from './applyDiscountApi'
import { callApplyItemDiscount } from './applyItemDiscountApi'
import { updateOrderItemNotes } from './orderItemNotesApi'
import { updateOrderItemQuantity } from './updateQuantityApi'
import { callCompItem } from './compApi'
import { callTransferOrder } from './transferOrderApi'
import { callMergeTables } from './mergeTablesApi'
import { callUnmergeTables } from './unmergeTablesApi'
import { fetchServerList, callReassignOrderServer } from './reassignServerApi'
import type { ServerOption } from './reassignServerApi'
import { markItemsSentToKitchen } from './kotApi'
import { callFireCourse, callServeCourse } from './fireCourseApi'
import { formatPrice, DEFAULT_CURRENCY_SYMBOL } from '@/lib/formatPrice'
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from '@/lib/paymentMethods'
import type { PaymentMethod } from '@/lib/paymentMethods'
import { calcVat, shouldApplyVat } from '@/lib/vatCalc'
import { calcServiceCharge, shouldApplyServiceCharge } from '@/lib/serviceChargeCalc'
import { fetchVatConfig, fetchOrderVatContext, fetchServiceChargeConfig, fetchVatApplyConfig } from '@/lib/fetchVatConfig'
import { callUpdateDeliveryCharge } from './waiveDeliveryFeeApi'
import { printKot, printBill, findPrinter } from '@/lib/kotPrint'
import type { PrinterConfig, PrinterProfile, PrintResult } from '@/lib/kotPrint'
import KotPrintView from '@/components/KotPrintView'
import BillPrintView from '@/components/BillPrintView'
import type { SplitPaymentLine } from '@/components/BillPrintView'
import { supabase } from '@/lib/supabase'
import { useUser } from '@/lib/user-context'
import { formatDateTime, formatDateTimeShort } from '@/lib/dateFormat'
import { useToast } from '@/hooks/useToast'
import { ToastContainer } from '@/components/ui/Toast'
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
  CalendarDays,
  UserCheck,
  UserPlus,
  Search,
  Banknote,
  UserCog,
  Tag,
} from 'lucide-react'

const COMP_REASONS = ['VIP', 'Complaint resolution', 'Staff meal', 'Event', 'Other'] as const

function ordinalSuffixForBadge(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return `${n}th`
  const rem = n % 10
  if (rem === 1) return `${n}st`
  if (rem === 2) return `${n}nd`
  if (rem === 3) return `${n}rd`
  return `${n}th`
}

interface OrderDetailClientProps {
  tableId: string
  orderId: string
  currencySymbol?: string
}

export default function OrderDetailClient({ tableId, orderId, currencySymbol = DEFAULT_CURRENCY_SYMBOL }: OrderDetailClientProps): JSX.Element {
  const router = useRouter()
  const { accessToken, isAdmin } = useUser()
  const { toasts, addToast, dismissToast } = useToast()
  const [closing, setClosing] = useState(false)
  const [closeError, setCloseError] = useState<string | null>(null)
  const [items, setItems] = useState<OrderItem[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [step, setStep] = useState<'order' | 'bill_preview' | 'payment' | 'change' | 'success'>('order')
  const [paying, setPaying] = useState(false)
  const [paymentError, setPaymentError] = useState<string | null>(null)
  const [changeDueCents, setChangeDueCents] = useState(0)
  const [confirmedPaymentMethod, setConfirmedPaymentMethod] = useState<string | null>(null)

  // Split payment builder state (issue #280)
  const [splitPayments, setSplitPayments] = useState<SplitPaymentEntry[]>([])
  const [splitEntryMethod, setSplitEntryMethod] = useState<PaymentMethod>('cash')
  const [splitEntryAmountStr, setSplitEntryAmountStr] = useState<string>('')
  const [splitEntryError, setSplitEntryError] = useState<string | null>(null)
  // Confirmed split payments for bill/receipt display
  const [confirmedSplitPayments, setConfirmedSplitPayments] = useState<SplitPaymentLine[]>([])

  // Paid order state (for orders already paid when navigated to directly)
  const [orderIsPaid, setOrderIsPaid] = useState(false)
  const [paidPaymentMethod, setPaidPaymentMethod] = useState<string | null>(null)
  /** Full per-method breakdown for orders already paid (loaded from DB via fetchOrderSummary) */
  const [paidPaymentLines, setPaidPaymentLines] = useState<PaymentLine[]>([])
  const [statusLoading, setStatusLoading] = useState(true)

  // Order type state (takeaway / delivery support)
  const [orderType, setOrderType] = useState<'dine_in' | 'takeaway' | 'delivery'>('dine_in')
  const [orderCustomerName, setOrderCustomerName] = useState<string | null>(null)
  const [orderDeliveryNote, setOrderDeliveryNote] = useState<string | null>(null)
  // Enhanced bill fields (issue #261)
  const [orderCustomerMobile, setOrderCustomerMobile] = useState<string | null>(null)
  const [orderBillNumber, setOrderBillNumber] = useState<string | null>(null)
  // Sequential order number (issue #349)
  const [orderNumber, setOrderNumber] = useState<number | null>(null)
  // Scheduled pickup/delivery time (issue #352)
  const [orderScheduledTime, setOrderScheduledTime] = useState<string | null>(null)
  // Delivery zone info (issue #353)
  const [orderDeliveryZoneName, setOrderDeliveryZoneName] = useState<string | null>(null)
  const [orderDeliveryChargeCents, setOrderDeliveryChargeCents] = useState<number>(0)

  // Linked reservation info (issue #277)
  const [orderReservationId, setOrderReservationId] = useState<string | null>(null)
  interface ReservationInfo { customer_name: string; party_size: number; notes: string | null }
  const [orderReservationInfo, setOrderReservationInfo] = useState<ReservationInfo | null>(null)

  // Linked customer (issue #276) — dine-in "Link customer" section
  interface LinkedCustomer { id: string; name: string | null; mobile: string; visit_count: number }
  const [linkedCustomer, setLinkedCustomer] = useState<LinkedCustomer | null>(null)
  const [showLinkCustomer, setShowLinkCustomer] = useState(false)
  const [linkMobileSearch, setLinkMobileSearch] = useState('')
  const [linkSearchResults, setLinkSearchResults] = useState<LinkedCustomer[]>([])
  const [linkSearching, setLinkSearching] = useState(false)
  const [linkError, setLinkError] = useState<string | null>(null)
  const linkSearchTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  // Send Receipt modal state (issue #173)
  const [showReceiptModal, setShowReceiptModal] = useState(false)
  const [receiptMobile, setReceiptMobile] = useState<string>('')
  const [savingMobile, setSavingMobile] = useState(false)
  const [receiptMobileError, setReceiptMobileError] = useState<string | null>(null)

  // Customer CRM lookup badge (issue #172)
  interface CustomerLookup { visit_count: number; total_spend_cents: number }
  const [customerLookup, setCustomerLookup] = useState<CustomerLookup | null>(null)
  const customerLookupDebounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

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

  // Merge tables state (issue #274)
  interface MergeableTable { id: string; label: string; order_id: string }
  const [mergeLabel, setMergeLabel] = useState<string | null>(null)
  const [showMergeModal, setShowMergeModal] = useState(false)
  const [mergeableTables, setMergeableTables] = useState<MergeableTable[]>([])
  const [mergeTablesLoading, setMergeTablesLoading] = useState(false)
  const [mergeTablesError, setMergeTablesError] = useState<string | null>(null)
  const [mergeTarget, setMergeTarget] = useState<MergeableTable | null>(null)
  const [merging, setMerging] = useState(false)
  const [mergeError, setMergeError] = useState<string | null>(null)
  // Unmerge state
  const [showUnmergeConfirm, setShowUnmergeConfirm] = useState(false)
  const [unmerging, setUnmerging] = useState(false)
  const [unmergeError, setUnmergeError] = useState<string | null>(null)

  // Reassign server state
  const [showReassignModal, setShowReassignModal] = useState(false)
  const [serverOptions, setServerOptions] = useState<ServerOption[]>([])
  const [reassignTarget, setReassignTarget] = useState<string>('')
  const [reassigning, setReassigning] = useState(false)
  const [reassignError, setReassignError] = useState<string | null>(null)
  const [reassignServersLoading, setReassignServersLoading] = useState(false)

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
  // True when the KOT being sent is adding items to an already-running table (issue #374)
  const [kotIsNewAddition, setKotIsNewAddition] = useState(false)

  // Bill print state
  const [billTimestamp, setBillTimestamp] = useState('')
  const [printingBill, setPrintingBill] = useState(false)
  // Pre-payment bill print state (issue #370) — true while printing a "DUE BILL" before payment
  const [printingPreBill, setPrintingPreBill] = useState(false)
  // Post-bill mode (issue #394) — true when order was reopened after bill was generated
  const [postBillMode, setPostBillMode] = useState(false)
  const [reopeningForItems, setReopeningForItems] = useState(false)
  const [reopenForItemsError, setReopenForItemsError] = useState<string | null>(null)
  // Mark-as-Due state (issue #370) — dine-in only
  const [orderIsDue, setOrderIsDue] = useState(false)
  const [markingDue, setMarkingDue] = useState(false)
  const [markDueError, setMarkDueError] = useState<string | null>(null)

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

  // Bill rounding setting (issue #371) — fetched once on load
  const [roundBillTotals, setRoundBillTotals] = useState(false)

  // Service charge config state (fetched once on load)
  const [serviceChargePercent, setServiceChargePercent] = useState(0)
  const [serviceChargeApplyDineIn, setServiceChargeApplyDineIn] = useState(true)
  const [serviceChargeApplyTakeaway, setServiceChargeApplyTakeaway] = useState(false)
  const [serviceChargeApplyDelivery, setServiceChargeApplyDelivery] = useState(false)

  // VAT per-order-type config state (issue #382)
  const [vatApplyDineIn, setVatApplyDineIn] = useState(true)
  const [vatApplyTakeaway, setVatApplyTakeaway] = useState(true)
  const [vatApplyDelivery, setVatApplyDelivery] = useState(false)

  // Free delivery override state (issue #382) — tracks whether fee has been waived for this order
  const [deliveryFeeWaived, setDeliveryFeeWaived] = useState(false)
  const [waivingDeliveryFee, setWaivingDeliveryFee] = useState(false)
  const [waiveDeliveryFeeError, setWaiveDeliveryFeeError] = useState<string | null>(null)
  // Original delivery charge to allow restoring after waiver
  const [originalDeliveryChargeCents, setOriginalDeliveryChargeCents] = useState<number>(0)

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

  // Per-item note editing state (issue #272)
  const [editingNoteItemId, setEditingNoteItemId] = useState<string | null>(null)
  const [noteInputValue, setNoteInputValue] = useState('')
  const noteCommittingRef = useRef(false)

  // Quantity editing state (issue #368)
  const [qtyEditingId, setQtyEditingId] = useState<string | null>(null)
  const [qtyEditStr, setQtyEditStr] = useState('')
  // Ref-based guard: prevents duplicate commits when Enter unmounts the input and fires onBlur (stale closure problem)
  const qtyCommittingRef = useRef(false)
  // Per-item debounce state for +/− button taps (issue #389)
  // Stores { originalItems snapshot for rollback, pending timeout, final target qty } per item id
  const qtyButtonDebounceRef = useRef<Map<string, { originalItems: OrderItem[]; timeout: ReturnType<typeof setTimeout>; targetQty: number }>>(new Map())

  // Guards to prevent duplicate print triggers from rapid double-clicks (issue #372)
  const kotSendGuardRef = useRef(false)
  const billPrintGuardRef = useRef(false)
  const kotReprintGuardRef = useRef(false)

  // Comp state
  const [compingItem, setCompingItem] = useState<OrderItem | null>(null)
  const [showOrderCompDialog, setShowOrderCompDialog] = useState(false)
  const [compReason, setCompReason] = useState<string>(COMP_REASONS[0])
  const [compingInProgress, setCompingInProgress] = useState(false)
  const [compError, setCompError] = useState<string | null>(null)
  const [orderIsComp, setOrderIsComp] = useState(false)

  function loadItems(): void {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!supabaseUrl || !accessToken) {
      setFetchError('API not configured')
      setLoading(false)
      return
    }

    setLoading(true)
    setFetchError(null)
    fetchOrderItems(supabaseUrl, accessToken, orderId)
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
    if (!supabaseUrl || !accessToken) {
      setStatusLoading(false)
      return
    }

    fetchOrderSummary(supabaseUrl, accessToken, orderId)
      .then((summary) => {
        if (summary.status === 'paid') {
          setOrderIsPaid(true)
          setPaidPaymentMethod(summary.payment_method)
          // Store full payment breakdown for audit trail display (issue #391)
          setPaidPaymentLines(summary.payment_lines ?? [])
        }
        // If order is 'due' (deferred payment / tab), flag it so UI shows "Settle Bill" (issue #370)
        if (summary.status === 'due') {
          setOrderIsDue(true)
        }
        // If order is already pending_payment (e.g. user navigated back without paying),
        // skip directly to the payment step (issue #318)
        if (summary.status === 'pending_payment') {
          setSplitPayments([])
          setSplitEntryMethod('cash')
          setSplitEntryAmountStr('')
          setSplitEntryError(null)
          setStep('payment')
        }
        // Track post-bill mode (issue #394) — order was reopened for item additions after billing
        setPostBillMode(summary.post_bill_mode ?? false)
        setOrderType(summary.order_type)
        setOrderCustomerName(summary.customer_name)
        setOrderDeliveryNote(summary.delivery_note)
        setOrderCustomerMobile(summary.customer_mobile)
        setOrderBillNumber(summary.bill_number)
        setOrderReservationId(summary.reservation_id)
        setOrderNumber(summary.order_number)
        setOrderScheduledTime(summary.scheduled_time)
        setOrderDeliveryZoneName(summary.delivery_zone_name)
        setOrderDeliveryChargeCents(summary.delivery_charge)
        setOriginalDeliveryChargeCents(summary.delivery_charge)
        // Merge label (issue #274) — stored separately; displayed as mergeLabel ?? tableLabel
        setMergeLabel(summary.merge_label)
        // Note: We do NOT infer deliveryFeeWaived from delivery_charge === 0 here,
        // because a delivery zone itself may have a 0-charge (free zone). The waived
        // state starts as false; once the user clicks "Waive Delivery Fee" the
        // originalDeliveryChargeCents is used to restore on toggle (issue #382).
        // Fetch linked customer info if customer_id is set (issue #276)
        if (summary.customer_id) {
          const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
          const pubKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ''
          if (supaUrl) {
            fetch(`${supaUrl}/rest/v1/customers?id=eq.${encodeURIComponent(summary.customer_id)}&select=id,name,mobile,visit_count&limit=1`, {
              headers: { apikey: pubKey, Authorization: `Bearer ${accessToken}` },
            })
              .then((r) => r.ok ? r.json() : Promise.resolve([]))
              .then((rows: unknown) => {
                const list = rows as Array<{ id: string; name: string | null; mobile: string; visit_count: number }>
                if (list.length > 0) setLinkedCustomer(list[0])
              })
              .catch(() => { /* Non-fatal */ })
          }
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
    if (!supabaseUrl || !accessToken) {
      setVatConfigLoading(false)
      return
    }

    setVatConfigLoading(true)
    fetchOrderVatContext(supabaseUrl, accessToken, orderId)
      .then(({ restaurantId, menuId }) =>
        Promise.all([
          fetchVatConfig(supabaseUrl, accessToken, restaurantId, menuId),
          fetchServiceChargeConfig(supabaseUrl, accessToken, restaurantId),
          fetchVatApplyConfig(supabaseUrl, accessToken, restaurantId),
          // Fetch restaurant name
          fetch(
            `${supabaseUrl}/rest/v1/restaurants?id=eq.${restaurantId}&select=name&limit=1`,
            { headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '', Authorization: `Bearer ${accessToken}` } },
          ).then((r) => r.ok ? r.json() as Promise<Array<{ name: string }>> : Promise.resolve([])),
          // Fetch enhanced bill config keys in a single request
          fetch(
            `${supabaseUrl}/rest/v1/config?restaurant_id=eq.${restaurantId}&key=in.(bin_number,register_name,restaurant_address,round_bill_totals)&select=key,value`,
            { headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '', Authorization: `Bearer ${accessToken}` } },
          ).then((r) => r.ok ? r.json() as Promise<Array<{ key: string; value: string }>> : Promise.resolve([])),
        ]),
      )
      .then(([config, scConfig, vatApplyConfig, restaurantRows, configRows]) => {
        setVatPercent(config.vatPercent)
        setTaxInclusive(config.taxInclusive)
        setServiceChargePercent(scConfig.percent)
        setServiceChargeApplyDineIn(scConfig.applyDineIn)
        setServiceChargeApplyTakeaway(scConfig.applyTakeaway)
        setServiceChargeApplyDelivery(scConfig.applyDelivery)
        // VAT per-order-type apply flags (issue #382)
        setVatApplyDineIn(vatApplyConfig.applyDineIn)
        setVatApplyTakeaway(vatApplyConfig.applyTakeaway)
        setVatApplyDelivery(vatApplyConfig.applyDelivery)
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
        if (cfgMap.has('round_bill_totals')) setRoundBillTotals(cfgMap.get('round_bill_totals') === 'true')
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
    if (!supabaseUrl || !accessToken) return
    const url = new URL(`${supabaseUrl}/rest/v1/orders`)
    url.searchParams.set('id', `eq.${orderId}`)
    url.searchParams.set('select', 'covers')
    void fetch(url.toString(), {
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '', Authorization: `Bearer ${accessToken}` },
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
    if (!supabaseUrl || !accessToken) return
    const url = new URL(`${supabaseUrl}/rest/v1/tables`)
    url.searchParams.set('id', `eq.${tableId}`)
    url.searchParams.set('select', 'label')
    void fetch(url.toString(), {
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '', Authorization: `Bearer ${accessToken}` },
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
    if (!accessToken) {
      // No auth token yet — clear loading states so the UI doesn't hang
      // on the initial render before the UserProvider resolves the session.
      setLoading(false)
      setStatusLoading(false)
      return
    }
    loadItems()
    loadOrderStatus()
    loadVatConfig()
    loadPrinterConfig()
    loadCovers()
    loadTableLabel()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, accessToken])

  // Fetch reservation info when order has a linked reservation (issue #277)
  useEffect(() => {
    if (!orderReservationId || !accessToken) return
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!supabaseUrl) return
    const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ''
    const url = new URL(`${supabaseUrl}/rest/v1/reservations`)
    url.searchParams.set('id', `eq.${orderReservationId}`)
    url.searchParams.set('select', 'customer_name,party_size,notes')
    url.searchParams.set('limit', '1')
    void fetch(url.toString(), {
      headers: { apikey: publishableKey, Authorization: `Bearer ${accessToken}` },
    })
      .then(async (res) => {
        if (!res.ok) return
        const rows = (await res.json()) as Array<{ customer_name: string; party_size: number; notes: string | null }>
        if (rows.length > 0) {
          setOrderReservationInfo({
            customer_name: rows[0].customer_name,
            party_size: rows[0].party_size,
            notes: rows[0].notes,
          })
        }
      })
      .catch(() => { /* non-fatal */ })
  }, [orderReservationId, accessToken])

  // Auto-navigate to /tables after success state is shown for 1.5s
  // Paused while bill is printing (printingBill or printingPreBill) to avoid tearing down page during print dialog
  useEffect(() => {
    if (step !== 'success') return
    if (printingBill) return
    if (printingPreBill) return
    const timer = setTimeout(() => {
      router.push('/tables')
    }, 1500)
    return () => { clearTimeout(timer) }
  }, [step, router, printingBill, printingPreBill])

  // Clean up any pending qty-button debounce timers when the component unmounts (issue #389)
  useEffect(() => {
    const ref = qtyButtonDebounceRef.current
    return () => {
      ref.forEach(({ timeout }) => { clearTimeout(timeout) })
      ref.clear()
    }
  }, [])

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

  // Step 2: apply service charge to post-discount subtotal (only if enabled for this order type)
  const serviceChargeApplies = !orderIsComp && shouldApplyServiceCharge(orderType, {
    applyDineIn: serviceChargeApplyDineIn,
    applyTakeaway: serviceChargeApplyTakeaway,
    applyDelivery: serviceChargeApplyDelivery,
  })
  const effectiveServiceChargePercent = serviceChargeApplies ? serviceChargePercent : 0
  const scBreakdown = calcServiceCharge(postDiscountCents, effectiveServiceChargePercent)
  const billServiceChargeCents = scBreakdown.serviceChargeCents

  // Step 3: apply VAT to (post-discount + service charge) base
  // VAT is only applied when enabled for this order type (issue #382):
  //   dine-in → VAT ✓   takeaway → VAT ✓   delivery → no VAT (delivery fee used instead)
  const vatApplies = !orderIsComp && shouldApplyVat(orderType, {
    applyDineIn: vatApplyDineIn,
    applyTakeaway: vatApplyTakeaway,
    applyDelivery: vatApplyDelivery,
  })
  const effectiveVatPercent = vatApplies ? vatPercent : 0
  const vatBase = postDiscountCents + billServiceChargeCents
  const vatBreakdown = calcVat(vatBase, effectiveVatPercent, taxInclusive)
  const { vatCents: billVatCents } = vatBreakdown

  // Displayed subtotal = raw items total (before any adjustments)
  const billSubtotalCents = rawItemsTotalCents

  // Step 4: add delivery charge (issue #353) — applied after VAT on top of order total
  const billDeliveryChargeCents = orderType === 'delivery' ? orderDeliveryChargeCents : 0
  const billTotalCents = orderIsComp ? 0 : vatBreakdown.totalCents + billDeliveryChargeCents

  // Displayed "total" in the order footer is the grand total
  const totalCents = billTotalCents
  const totalFormatted = formatPrice(totalCents, currencySymbol, roundBillTotals)

  const billPaymentMethod = (confirmedPaymentMethod ?? (splitPayments.length > 0 ? splitPayments[0].method : 'cash')) as PaymentMethod
  const billAmountTenderedCents = splitPayments.length === 1 && splitPayments[0].method === 'cash'
    ? splitPayments[0].amountCents
    : undefined
  // For BillPrintView: always pass confirmed split payments so the receipt shows
  // a per-method breakdown for both single and split payments (issue #391).
  const billSplitPayments: SplitPaymentLine[] | undefined =
    confirmedSplitPayments.length > 0 ? confirmedSplitPayments : undefined

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
    setSplitBillTimestamp(formatDateTime(new Date().toISOString()))
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
    // Guard against double-fire from rapid clicks (issue #372)
    if (kotSendGuardRef.current) return
    kotSendGuardRef.current = true
    try {
      await doBackToTables()
    } finally {
      kotSendGuardRef.current = false
    }
  }

  async function doBackToTables(): Promise<void> {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

    // Empty order — just navigate back, keep the order open so the table stays occupied.
    // (Auto-cancel only happens on explicit "Close Order" — see handleCloseOrder)
    if (items.length === 0) {
      router.push('/tables')
      return
    }

    const unsentItems = items.filter((item) => !item.sent_to_kitchen)

    if (step === 'order' && unsentItems.length > 0 && supabaseUrl && accessToken) {
      const ts = formatDateTime(new Date().toISOString())
      setKotTimestamp(ts)
      setKotPrintError(null)

      // Set kotStatus before printing so the wrapper div receives the `print-area`
      // class — without it, global print CSS hides everything and KOT prints blank.
      setKotStatus('Sending to kitchen…')

      // Detect if any items were already sent — if so, mark as NEW ADDITION (issue #374)
      const alreadySentItemsExist = items.some((i) => i.sent_to_kitchen)
      setKotIsNewAddition(alreadySentItemsExist)

      // Group unsent items by their printer type (kitchen vs bar)
      const itemsByPrinterType = new Map<'kitchen' | 'bar', typeof unsentItems>()
      for (const item of unsentItems) {
        const pt: 'kitchen' | 'bar' = item.printerType === 'bar' ? 'bar' : 'kitchen'
        const group = itemsByPrinterType.get(pt) ?? []
        group.push(item)
        itemsByPrinterType.set(pt, group)
      }

      // Send each group to the correct printer — collect results to detect print method
      const printResults: PrintResult[] = []
      const printErrors: string[] = []
      for (const [printerType, groupItems] of itemsByPrinterType) {
        const profile = printers.length > 0
          ? findPrinter(printers, printerType)
          : null
        const legacyConfig = printers.length === 0 ? printerConfig : null

        const result = await printKot({
          items: groupItems.map((i) => ({ name: i.name, qty: i.quantity })),
          tableId,
          orderId,
          orderNumber,
          timestamp: ts,
          printerProfile: profile,
          printerConfig: legacyConfig,
          onBeforeBrowserPrint: () =>
            // Give React a tick to flush the kotStatus state update so the
            // print-area class is applied to the wrapper before window.print()
            new Promise<void>((resolve) => setTimeout(resolve, 50)),
        })

        printResults.push(result)
        if (result.errorMessage) {
          printErrors.push(`[${printerType}] ${result.errorMessage}`)
        }
      }

      if (printErrors.length > 0) {
        setKotPrintError(printErrors.join('\n\n'))
        setKotStatus(null)
        return
      }

      // ── Optimistic update ──────────────────────────────────────────
      // Mark items as sent in local state immediately so the UI shows the
      // correct state even before the DB confirms. Navigation follows right
      // after, so this mainly ensures correctness if navigation is slow or
      // if the page stays open.
      const kotSnapshot = items
      setItems((prev) =>
        prev.map((i) =>
          unsentItems.some((u) => u.id === i.id) ? { ...i, sent_to_kitchen: true } : i,
        ),
      )
      // ─────────────────────────────────────────────────────────────

      const allBrowser = printResults.length > 0 && printResults.every((r) => r.method === 'browser')

      if (allBrowser) {
        // Browser print path: navigate immediately — no UI delay.
        // markItemsSentToKitchen is fire-and-forget; we don't await or roll back
        // since we're navigating away immediately.
        markItemsSentToKitchen(supabaseUrl, accessToken, orderId, unsentItems.map((i) => i.id)).catch(() => {
          // Fire-and-forget: we've already navigated away so we can't show a toast.
          // If this call fails, the items will remain sent_to_kitchen: false in the DB.
          // The next time staff open this order, those items will reappear as unsent
          // and could be reprinted. Accepted risk for browser print path — TCP/IP path
          // uses the blocking flow with rollback instead.
        })
      } else {
        // TCP/IP (network) print path: await DB confirmation before navigating.
        // kotStatus is already set to 'Sending to kitchen…' above.
        try {
          await markItemsSentToKitchen(supabaseUrl, accessToken, orderId, unsentItems.map((i) => i.id))
        } catch {
          // ── Rollback ──────────────────────────────────────────────
          setItems(kotSnapshot)
          setKotStatus(null)
          addToast('Failed to send to kitchen — please retry', 'error')
          return
          // ──────────────────────────────────────────────────────────
        }
      }
    }

    router.push('/tables')
  }

  // Reprint KOT: show all items (no side effects — does NOT call markItemsSentToKitchen)
  async function handleReprintKot(): Promise<void> {
    // Guard against double-fire (issue #372)
    if (kotReprintGuardRef.current) return
    kotReprintGuardRef.current = true
    try {
      await doReprintKot()
    } finally {
      kotReprintGuardRef.current = false
    }
  }

  async function doReprintKot(): Promise<void> {
    const ts = formatDateTime(new Date().toISOString())
    setKotTimestamp(ts)
    setKotShowAll(true)
    setReprintingKot(true)
    setKotIsNewAddition(false) // Reprints always show all items — never the new-addition banner (issue #374)
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
        orderNumber,
        timestamp: ts,
        printerConfig,
        onBeforeBrowserPrint: () =>
          // Give React a tick to flush reprintingKot state so print-area
          // class is applied to the wrapper before window.print()
          new Promise<void>((resolve) => setTimeout(resolve, 50)),
        onAfterBrowserPrint: () => {
          setKotShowAll(false)
          setReprintingKot(false)
          setKotIsNewAddition(false)
        },
      })
      if (result.method === 'network') {
        setKotShowAll(false)
        setReprintingKot(false)
        setKotIsNewAddition(false)
      }
      if (result.errorMessage) {
        setKotPrintError(result.errorMessage)
      }
      return
    }

    // Network or multi-printer: send to each group
    const printErrors: string[] = []
    for (const [printerType, groupItems] of itemsByPrinterType) {
      const profile = printers.length > 0 ? findPrinter(printers, printerType) : null
      const legacyConfig = printers.length === 0 ? printerConfig : null

      const result = await printKot({
        items: groupItems.map((i) => ({ name: i.name, qty: i.quantity })),
        tableId,
        orderId,
        orderNumber,
        timestamp: ts,
        printerProfile: profile,
        printerConfig: legacyConfig,
        onBeforeBrowserPrint: () =>
          // Give React a tick to flush reprintingKot state so print-area
          // class is applied to the wrapper before window.print() fires
          // (handles TCP/IP fallback-to-browser case)
          new Promise<void>((resolve) => setTimeout(resolve, 50)),
      })

      if (result.errorMessage) {
        printErrors.push(`[${printerType}] ${result.errorMessage}`)
      }
    }

    setKotShowAll(false)
    setReprintingKot(false)
    setKotIsNewAddition(false)

    if (printErrors.length > 0) {
      setKotPrintError(printErrors.join('\n\n'))
    }
  }

  // Fire a specific course: print course KOT, then mark items as sent + fired
  async function handleFireCourse(course: CourseType): Promise<void> {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!supabaseUrl || !accessToken || !accessToken) return

    const courseItems = items.filter((i) => i.course === course && !i.sent_to_kitchen && !i.comp)
    if (courseItems.length === 0) return

    setCourseActionError(null)
    setFiringCourse(course)

    const ts = formatDateTime(new Date().toISOString())
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

      const firePrintErrors: string[] = []
      for (const [printerType, groupItems] of courseItemsByPrinterType) {
        const profile = printers.length > 0 ? findPrinter(printers, printerType) : null
        const legacyConfig = printers.length === 0 ? printerConfig : null

        const result = await printKot({
          items: groupItems.map((i) => ({ name: i.name, qty: i.quantity })),
          tableId,
          orderId,
          orderNumber,
          timestamp: ts,
          printerProfile: profile,
          printerConfig: legacyConfig,
          onBeforeBrowserPrint: () =>
            // Give React a tick to flush firingCourse state so print-area
            // class is applied to the wrapper before window.print()
            new Promise<void>((resolve) => setTimeout(resolve, 50)),
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
    // Guard against double-fire from rapid clicks (issue #372)
    if (billPrintGuardRef.current) return
    billPrintGuardRef.current = true

    const ts = formatDateTime(new Date().toISOString())
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
          serviceChargePercent: effectiveServiceChargePercent,
          vatCents: billVatCents,
          vatPercent,
          taxInclusive,
          totalCents: billTotalCents,
          paymentMethod: billPaymentMethod,
          amountTenderedCents: billAmountTenderedCents,
          changeDueCents: changeDueCents > 0 ? changeDueCents : undefined,
          orderComp: orderIsComp,
        },
        printerProfile: cashierProfile,
        onAfterBrowserPrint: () => { setPrintingBill(false); billPrintGuardRef.current = false },
      }).then((result) => {
        setPrintingBill(false)
        billPrintGuardRef.current = false
        if (result.errorMessage) {
          setKotPrintError(`Bill print error: ${result.errorMessage}`)
        }
      }).catch(() => { setPrintingBill(false); billPrintGuardRef.current = false })
      return
    }

    // Browser print fallback
    setTimeout(() => {
      window.print()
      window.addEventListener('afterprint', () => {
        setPrintingBill(false)
        billPrintGuardRef.current = false
      }, { once: true })
    }, 200)
  }

  /**
   * Print a pre-payment "DUE BILL" copy — available before payment is recorded (issue #370).
   * Renders BillPrintView with isDue=true, then triggers browser print.
   * Available for dine-in and takeaway orders only (not delivery).
   * Shares billPrintGuardRef with handlePrintBill to prevent double-print from rapid clicks.
   */
  function handlePrintPreBill(): void {
    // Guard against double-fire from rapid clicks (same ref used by handlePrintBill)
    if (billPrintGuardRef.current) return
    billPrintGuardRef.current = true

    const ts = formatDateTime(new Date().toISOString())
    setBillTimestamp(ts)
    setPrintingPreBill(true)
    setTimeout(() => {
      window.print()
      window.addEventListener('afterprint', () => {
        setPrintingPreBill(false)
        billPrintGuardRef.current = false
      }, { once: true })
    }, 200)
  }

  /**
   * Mark a dine-in order as "due" — bill presented, payment deferred (tab) (issue #370).
   * Transitions status: open → due.
   */
  async function handleMarkAsDue(): Promise<void> {
    setMarkDueError(null)
    setMarkingDue(true)
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      if (!supabaseUrl || !accessToken) throw new Error('Not authenticated')
      await callMarkOrderDue(supabaseUrl, accessToken, orderId)
      setOrderIsDue(true)
    } catch (err) {
      setMarkDueError(err instanceof Error ? err.message : 'Failed to mark order as due')
    } finally {
      setMarkingDue(false)
    }
  }

  /**
   * Reopen a billed dine-in order so additional items can be added (issue #394).
   * Transitions pending_payment → open with post_bill_mode = true.
   * The bill is automatically voided; close_order will regenerate it with the new items.
   * Access: server+ (enforced by the edge function).
   */
  async function handleReopenForItems(): Promise<void> {
    setReopenForItemsError(null)
    setReopeningForItems(true)
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      if (!supabaseUrl || !accessToken) throw new Error('Not authenticated')
      await callReopenOrderForItems(supabaseUrl, accessToken, orderId)
      setPostBillMode(true)
      // Reload items (in case any new items were already added in a prior session)
      loadItems()
      setStep('order')
    } catch (err) {
      setReopenForItemsError(err instanceof Error ? err.message : 'Failed to reopen order for items')
    } finally {
      setReopeningForItems(false)
    }
  }

  async function handleCloseOrder(): Promise<void> {
    setCloseError(null)
    setClosing(true)
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      if (!supabaseUrl || !accessToken) {
        throw new Error('Not authenticated')
      }
      // Empty order — cancel directly, no preview or payment needed
      if (items.length === 0) {
        await callCancelOrder(supabaseUrl, accessToken, orderId, 'Empty order — no items added')
        router.push('/tables')
        return
      }
      // Non-empty order — show bill preview before proceeding to payment
      setStep('bill_preview')
    } catch (err) {
      setCloseError(err instanceof Error ? err.message : 'Failed to close order')
    } finally {
      setClosing(false)
    }
  }

  async function handleProceedToPayment(): Promise<void> {
    setCloseError(null)
    setClosing(true)
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      if (!supabaseUrl || !accessToken) {
        throw new Error('Not authenticated')
      }
      await callCloseOrder(supabaseUrl, accessToken, orderId)
      // Reset split payment builder for fresh start
      setSplitPayments([])
      setSplitEntryMethod('cash')
      setSplitEntryAmountStr('')
      setSplitEntryError(null)
      setStep('payment')
    } catch (err) {
      setCloseError(err instanceof Error ? err.message : 'Failed to close order')
    } finally {
      setClosing(false)
    }
  }

  // ── Split payment builder helpers (issue #280) ────────────────────────────

  /** Remaining balance to collect = bill total − sum of already-added split payments */
  const splitRemainingCents = Math.max(
    0,
    billTotalCents - splitPayments.reduce((s, p) => s + p.amountCents, 0),
  )

  /** Total tendered so far across all split payment entries */
  const splitTotalTenderedCents = splitPayments.reduce((s, p) => s + p.amountCents, 0)

  /** True when cash is part of any payment in the builder */
  const splitHasCash = splitPayments.some((p) => p.method === 'cash')

  /** Change / tip due: difference when tendered exceeds bill total.
   *  For cash entries this is physical change returned to the customer.
   *  For card/mobile-only over-tender it represents a tip. */
  const splitChangeDueCents = Math.max(0, splitTotalTenderedCents - billTotalCents)

  function handleAddSplitPayment(): void {
    setSplitEntryError(null)
    const amountCents = Math.round(parseFloat(splitEntryAmountStr || '0') * 100)

    if (isNaN(amountCents) || amountCents <= 0) {
      setSplitEntryError('Enter a valid amount')
      return
    }

    // Over-tendering is allowed on any method (covers tips and rounding scenarios).
    // For non-cash methods (card/mobile) the excess is treated as a tip — no physical
    // change is handed back. Change is only calculated and displayed for cash entries.

    setSplitPayments((prev) => [...prev, { method: splitEntryMethod, amountCents }])
    setSplitEntryAmountStr('')
  }

  function handleRemoveSplitPayment(index: number): void {
    setSplitPayments((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleRecordPayment(): Promise<void> {
    setPaymentError(null)

    // Fully comped order (total = ৳0) — skip payment recording, go straight to success
    if (billTotalCents === 0) {
      setConfirmedPaymentMethod('cash')
      setStep('success')
      return
    }

    // Cannot confirm until full amount is covered
    if (splitTotalTenderedCents < billTotalCents) {
      setPaymentError('Total tendered must cover the full bill amount')
      return
    }
    // Over-tendering (tips / rounding) is accepted for any payment method.
    // For cash the excess is returned as change; for card/mobile it is treated as a tip.

    setPaying(true)
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      if (!supabaseUrl || !accessToken) {
        throw new Error('Not authenticated')
      }

      const result = await callRecordSplitPayment(supabaseUrl, accessToken, orderId, splitPayments)

      // Store confirmed payments for bill/receipt display
      setConfirmedSplitPayments(
        splitPayments.map((p) => ({ method: p.method, amountCents: p.amountCents })),
      )
      // For backward-compat fields used elsewhere (primary method, or null for multi-method splits)
      setConfirmedPaymentMethod(splitPayments.length === 1 ? splitPayments[0].method : null)

      if (result.change_due > 0) {
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

    // ── Optimistic update ────────────────────────────────────────────
    // Remove the item from local state immediately so the UI reflects the
    // void without waiting for a round-trip.
    const snapshot = items
    const voidReasonSnapshot = voidReason
    setItems((prev) => prev.filter((i) => i.id !== voidingItem.id))
    setVoidingItem(null)
    setVoidReason('')
    // ─────────────────────────────────────────────────────────────────

    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      if (!supabaseUrl || !accessToken) {
        throw new Error('Not authenticated')
      }
      await callVoidItem(supabaseUrl, accessToken, voidingItem.id, voidReason)
    } catch (err) {
      // ── Rollback ─────────────────────────────────────────────────
      setItems(snapshot)
      const msg = err instanceof Error ? err.message : 'Failed to void item'
      setVoidError(msg)
      setVoidingItem(voidingItem)
      setVoidReason(voidReasonSnapshot)
      addToast(`Failed to void item — please retry`, 'error')
      // ─────────────────────────────────────────────────────────────
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

    // ── Optimistic update ────────────────────────────────────────────
    // Mark item as comped immediately so the UI reflects the change
    // without waiting for the server.
    const snapshot = items
    const targetItem = compingItem
    setItems((prev) =>
      prev.map((i) => i.id === targetItem.id ? { ...i, comp: true } : i),
    )
    setCompingItem(null)
    // ─────────────────────────────────────────────────────────────────

    try {
      await callCompItem(supabaseUrl, accessToken, { orderItemId: targetItem.id, reason: compReason })
    } catch (err) {
      // ── Rollback ─────────────────────────────────────────────────
      setItems(snapshot)
      const msg = err instanceof Error ? err.message : 'Failed to comp item'
      setCompError(msg)
      setCompingItem(targetItem)
      addToast('Failed to comp item — please retry', 'error')
      // ─────────────────────────────────────────────────────────────
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

  // ─── Waive / restore delivery fee (issue #382) ───────────────────────────
  async function handleToggleDeliveryFeeWaiver(): Promise<void> {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!supabaseUrl || !accessToken) return
    setWaiveDeliveryFeeError(null)
    setWaivingDeliveryFee(true)
    const newCharge = deliveryFeeWaived ? originalDeliveryChargeCents : 0
    // Optimistic update
    const prevCharge = orderDeliveryChargeCents
    const prevWaived = deliveryFeeWaived
    setOrderDeliveryChargeCents(newCharge)
    setDeliveryFeeWaived(!deliveryFeeWaived)
    try {
      await callUpdateDeliveryCharge(supabaseUrl, accessToken, orderId, newCharge)
    } catch (err) {
      // Rollback on failure
      setOrderDeliveryChargeCents(prevCharge)
      setDeliveryFeeWaived(prevWaived)
      setWaiveDeliveryFeeError(err instanceof Error ? err.message : 'Failed to update delivery fee')
    } finally {
      setWaivingDeliveryFee(false)
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
      if (!supabaseUrl || !accessToken) throw new Error('API not configured')

      // Fetch all tables
      const tablesUrl = new URL(`${supabaseUrl}/rest/v1/tables`)
      tablesUrl.searchParams.set('select', 'id,label')
      tablesUrl.searchParams.set('order', 'label')
      const tablesRes = await fetch(tablesUrl.toString(), {
        headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '', Authorization: `Bearer ${accessToken}` },
      })
      if (!tablesRes.ok) throw new Error('Failed to fetch tables')
      const allTables = (await tablesRes.json()) as AvailableTable[]

      // Fetch open orders to determine occupied tables
      const ordersUrl = new URL(`${supabaseUrl}/rest/v1/orders`)
      ordersUrl.searchParams.set('select', 'table_id')
      ordersUrl.searchParams.set('status', 'eq.open')
      const ordersRes = await fetch(ordersUrl.toString(), {
        headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '', Authorization: `Bearer ${accessToken}` },
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

  // ─── Merge / Unmerge Tables (issue #274) ──────────────────────────────────
  async function openMergeModal(): Promise<void> {
    setMergeTarget(null)
    setMergeError(null)
    setMergeTablesError(null)
    setShowMergeModal(true)
    setMergeTablesLoading(true)

    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      if (!supabaseUrl || !accessToken) throw new Error('API not configured')

      // Fetch all open dine_in orders with their table
      const ordersUrl = new URL(`${supabaseUrl}/rest/v1/orders`)
      ordersUrl.searchParams.set('select', 'id,table_id,tables!orders_table_id_fkey(id,label,locked_by_order_id)')
      ordersUrl.searchParams.set('status', 'in.(open,pending_payment)')
      ordersUrl.searchParams.set('order_type', 'eq.dine_in')
      const ordersRes = await fetch(ordersUrl.toString(), {
        headers: {
          apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '',
          Authorization: `Bearer ${accessToken}`,
        },
      })
      if (!ordersRes.ok) throw new Error('Failed to fetch active tables')

      const orderRows = (await ordersRes.json()) as Array<{
        id: string
        table_id: string | null
        tables: { id: string; label: string; locked_by_order_id: string | null } | null
      }>

      // Filter: exclude current table, exclude locked tables
      const mergeable = orderRows
        .filter((o) =>
          o.table_id !== null &&
          o.table_id !== tableId &&
          o.tables !== null &&
          o.tables.locked_by_order_id === null,
        )
        .map((o) => ({
          id: o.tables!.id,
          label: o.tables!.label,
          order_id: o.id,
        }))
        .sort((a, b) => a.label.localeCompare(b.label))

      setMergeableTables(mergeable)
    } catch (err) {
      setMergeTablesError(err instanceof Error ? err.message : 'Failed to load tables')
    } finally {
      setMergeTablesLoading(false)
    }
  }

  async function handleMergeTables(): Promise<void> {
    if (!mergeTarget) return
    setMergeError(null)
    setMerging(true)
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      if (!supabaseUrl || !accessToken) throw new Error('Not authenticated')
      const result = await callMergeTables(supabaseUrl, accessToken, orderId, mergeTarget.id)
      setMergeLabel(result.merge_label)
      setShowMergeModal(false)
      // Reload items so the secondary table's items appear immediately (issue #274)
      loadItems()
      addToast(`Tables merged: ${result.merge_label}`, 'success')
    } catch (err) {
      setMergeError(err instanceof Error ? err.message : 'Failed to merge tables')
    } finally {
      setMerging(false)
    }
  }

  async function handleUnmergeTables(): Promise<void> {
    setUnmergeError(null)
    setUnmerging(true)
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      if (!supabaseUrl || !accessToken) throw new Error('Not authenticated')
      await callUnmergeTables(supabaseUrl, accessToken, orderId)
      setMergeLabel(null)
      setShowUnmergeConfirm(false)
      addToast('Tables unmerged', 'success')
    } catch (err) {
      setUnmergeError(err instanceof Error ? err.message : 'Failed to unmerge tables')
    } finally {
      setUnmerging(false)
    }
  }

  // ─── Reassign Server (issue #275) ─────────────────────────────────────────
  async function openReassignModal(): Promise<void> {
    setReassignTarget('')
    setReassignError(null)
    setShowReassignModal(true)
    setReassignServersLoading(true)
    try {
      if (!accessToken) throw new Error('Not authenticated')
      const servers = await fetchServerList(accessToken)
      setServerOptions(servers)
    } catch (err) {
      setReassignError(err instanceof Error ? err.message : 'Failed to load servers')
    } finally {
      setReassignServersLoading(false)
    }
  }

  async function handleReassignServer(): Promise<void> {
    if (!reassignTarget) return
    setReassignError(null)
    setReassigning(true)
    try {
      if (!accessToken) throw new Error('Not authenticated')
      await callReassignOrderServer(accessToken, orderId, reassignTarget)
      setShowReassignModal(false)
      addToast('Server reassigned successfully', 'success')
    } catch (err) {
      setReassignError(err instanceof Error ? err.message : 'Failed to reassign server')
    } finally {
      setReassigning(false)
    }
  }

  // ─── Send Receipt (issue #173) ───────────────────────────────────────────
  function generateReceiptText(): string {
    const lines: string[] = []
    lines.push(restaurantName)
    if (restaurantAddress) lines.push(restaurantAddress)
    lines.push('')
    lines.push(`Date: ${formatDateTime(new Date().toISOString())}`)
    if (orderBillNumber) lines.push(`Bill: ${orderBillNumber}`)
    lines.push('─'.repeat(32))
    for (const item of items) {
      const isComp = item.comp || orderIsComp
      const lineCents = isComp ? 0 : item.quantity * item.price_cents - calcItemDiscountCents(item)
      const priceStr = isComp ? 'Free' : formatPrice(lineCents, currencySymbol, roundBillTotals)
      lines.push(`${item.name} x${item.quantity}  ${priceStr}`)
    }
    lines.push('─'.repeat(32))
    if (!orderIsComp) {
      lines.push(`Subtotal: ${formatPrice(billSubtotalCents, currencySymbol, roundBillTotals)}`)
      if (appliedDiscountCents > 0) {
        lines.push(`Discount: -${formatPrice(appliedDiscountCents, currencySymbol, roundBillTotals)}`)
      }
      if (effectiveServiceChargePercent > 0 && billServiceChargeCents > 0) {
        lines.push(`Service Charge (${effectiveServiceChargePercent}%): ${formatPrice(billServiceChargeCents, currencySymbol, roundBillTotals)}`)
      }
      if (vatPercent > 0 && billVatCents > 0) {
        lines.push(`VAT ${vatPercent}%${taxInclusive ? ' (incl.)' : ''}: ${formatPrice(billVatCents, currencySymbol, roundBillTotals)}`)
      }
      if (billDeliveryChargeCents > 0) {
        const dcLabel = orderDeliveryZoneName ? `Delivery (${orderDeliveryZoneName})` : 'Delivery Charge'
        lines.push(`${dcLabel}: ${formatPrice(billDeliveryChargeCents, currencySymbol, roundBillTotals)}`)
      }
      lines.push(`Total: ${formatPrice(billTotalCents, currencySymbol, roundBillTotals)}`)
    } else {
      lines.push('Total: COMPLIMENTARY')
    }
    if (confirmedSplitPayments.length > 1) {
      lines.push(`Payment: ${confirmedSplitPayments.map((p) => `${PAYMENT_METHOD_LABELS[p.method]} ${formatPrice(p.amountCents, currencySymbol, roundBillTotals)}`).join(' | ')}`)
    } else {
      const pm = confirmedPaymentMethod ?? paidPaymentMethod ?? 'Unknown'
      lines.push(`Payment: ${pm.charAt(0).toUpperCase() + pm.slice(1)}`)
    }
    lines.push('')
    lines.push('Thank you for dining with us!')
    return lines.join('\n')
  }

  // Debounced customer mobile search for dine-in "Link customer" (issue #276)
  React.useEffect(() => {
    if (linkSearchTimerRef.current !== null) clearTimeout(linkSearchTimerRef.current)
    const q = linkMobileSearch.trim()
    if (!q || q.length < 4) { setLinkSearchResults([]); setLinkSearching(false); return }
    setLinkSearching(true)
    linkSearchTimerRef.current = setTimeout(() => {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const pubKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ''
      if (!supabaseUrl || !accessToken) { setLinkSearching(false); return }
      fetch(`${supabaseUrl}/rest/v1/customers?mobile=ilike.${encodeURIComponent(`%${q}%`)}&select=id,name,mobile,visit_count&limit=5`, {
        headers: { apikey: pubKey, Authorization: `Bearer ${accessToken}` },
      })
        .then((r) => r.ok ? r.json() : Promise.resolve([]))
        .then((rows: unknown) => { setLinkSearchResults(rows as Array<LinkedCustomer>); setLinkSearching(false) })
        .catch(() => { setLinkSearchResults([]); setLinkSearching(false) })
    }, 400)
    return () => { if (linkSearchTimerRef.current !== null) clearTimeout(linkSearchTimerRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkMobileSearch, accessToken])

  async function handleLinkCustomer(customer: LinkedCustomer): Promise<void> {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!supabaseUrl || !accessToken) return
    setLinkError(null)
    try {
      // All writes go through the Action API (per apps/web/CLAUDE.md)
      const res = await fetch(`${supabaseUrl}/functions/v1/link_customer_to_order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ order_id: orderId, customer_id: customer.id }),
      })
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new Error(`Failed to link customer: ${body}`)
      }
      setLinkedCustomer(customer)
      setShowLinkCustomer(false)
      setLinkMobileSearch('')
      setLinkSearchResults([])
    } catch {
      setLinkError('Failed to link customer. Please try again.')
    }
  }

  // Lookup customer by mobile with debounce (issue #172)
  function lookupCustomerByMobile(mobile: string): void {
    if (customerLookupDebounceRef.current) clearTimeout(customerLookupDebounceRef.current)
    if (!mobile.trim() || mobile.trim().length < 6) {
      setCustomerLookup(null)
      return
    }
    customerLookupDebounceRef.current = setTimeout(() => {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      if (!supabaseUrl || !accessToken) return
      void fetch(
        `${supabaseUrl}/rest/v1/customers?mobile=eq.${encodeURIComponent(mobile.trim())}&select=visit_count,total_spend_cents&limit=1`,
        { headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '', Authorization: `Bearer ${accessToken}` } },
      )
        .then((r) => r.ok ? r.json() as Promise<Array<CustomerLookup>> : Promise.resolve([]))
        .then((rows) => {
          setCustomerLookup(rows.length > 0 ? rows[0] : null)
        })
        .catch(() => { setCustomerLookup(null) })
    }, 400)
  }

  function handleOpenReceiptModal(): void {
    setReceiptMobile(orderCustomerMobile ?? '')
    setReceiptMobileError(null)
    setCustomerLookup(null)
    setShowReceiptModal(true)
    if (orderCustomerMobile) lookupCustomerByMobile(orderCustomerMobile)
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
        if (supabaseUrl && accessToken) {
          await fetch(`${supabaseUrl}/rest/v1/orders?id=eq.${orderId}`, {
            method: 'PATCH',
            headers: {
              apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '',
              Authorization: `Bearer ${accessToken}`,
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

  // Shared note commit — guards against double-fire when Enter unmounts the input and triggers onBlur
  function commitNote(itemId: string, value: string, originalNotes: string | null): void {
    if (noteCommittingRef.current) return
    noteCommittingRef.current = true
    setEditingNoteItemId(null)
    const trimmed = value.trim() || null
    // optimistic update
    setItems((prev) => prev.map((i) => i.id === itemId ? { ...i, notes: trimmed } : i))
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!supabaseUrl || !accessToken) { noteCommittingRef.current = false; return }
    updateOrderItemNotes(supabaseUrl, accessToken, itemId, trimmed)
      .catch(() => {
        // revert on failure
        setItems((prev) => prev.map((i) => i.id === itemId ? { ...i, notes: originalNotes } : i))
      })
      .finally(() => { noteCommittingRef.current = false })
  }

  /**
   * Commit a quantity change for an order item (issue #368).
   * newQty = 0 → triggers the void dialog instead of calling the API.
   * Optimistic update: apply locally first, roll back on failure.
   */
  function commitQuantity(item: OrderItem, newQty: number): void {
    // Guard: prevents double-fire when Enter unmounts the input and triggers onBlur.
    // Uses a ref (not state) so it reflects the latest value even in stale closures.
    if (qtyCommittingRef.current) return
    qtyCommittingRef.current = true

    setQtyEditingId(null)
    setQtyEditStr('')

    // Decrease to 0 → treat as void request
    if (newQty <= 0) {
      setVoidingItem(item)
      setVoidReason('')
      setVoidError(null)
      qtyCommittingRef.current = false
      return
    }

    if (newQty === item.quantity) {
      qtyCommittingRef.current = false
      return
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!supabaseUrl || !accessToken) {
      qtyCommittingRef.current = false
      return
    }

    // Optimistic update
    const prevItems = items
    setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, quantity: newQty } : i))

    updateOrderItemQuantity(supabaseUrl, accessToken, item.id, newQty)
      .catch(() => {
        // Rollback on failure
        setItems(prevItems)
        addToast('Failed to update quantity — please retry', 'error')
      })
      .finally(() => { qtyCommittingRef.current = false })
  }

  /**
   * Handle a +/− button tap on an order item (issue #389).
   *
   * Unlike `commitQuantity` (which uses a shared ref guard for the inline
   * text-input double-commit problem), this function debounces rapid button
   * taps so that:
   *   1. Local state updates IMMEDIATELY on every tap (good UX).
   *   2. A single API call is made after 400 ms of no further taps.
   *   3. On failure, state rolls back to what it was before the entire
   *      tap sequence started.
   */
  function handleQtyButton(item: OrderItem, delta: number): void {
    const pending = qtyButtonDebounceRef.current.get(item.id)

    // Compute the target qty based on the currently-displayed value (pending or actual)
    const baseQty = pending ? pending.targetQty : item.quantity
    const newQty = baseQty + delta

    // Tapping − to reach 0 → open the void dialog
    if (newQty <= 0) {
      if (pending) {
        clearTimeout(pending.timeout)
        qtyButtonDebounceRef.current.delete(item.id)
        // Roll back any intermediate optimistic updates from the tap sequence
        // so the UI shows the original qty while the void dialog is open.
        // If the user cancels the void, they see the correct quantity.
        setItems(pending.originalItems)
      }
      setVoidingItem(item)
      setVoidReason('')
      setVoidError(null)
      return
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!supabaseUrl || !accessToken) return

    // Snapshot the pre-sequence items list for rollback (only on the first tap in a sequence)
    const originalItems = pending ? pending.originalItems : items

    // Immediate optimistic update — every tap is reflected in the UI at once
    setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, quantity: newQty } : i))

    // Cancel the previous debounce timer for this item
    if (pending) clearTimeout(pending.timeout)

    // Schedule a single API call after 400 ms of inactivity
    const timeout = setTimeout(() => {
      qtyButtonDebounceRef.current.delete(item.id)
      updateOrderItemQuantity(supabaseUrl, accessToken, item.id, newQty)
        .catch(() => {
          // Roll back to the state before the entire tap sequence started
          setItems(originalItems)
          addToast('Failed to update quantity — please retry', 'error')
        })
    }, 400)

    qtyButtonDebounceRef.current.set(item.id, { originalItems, timeout, targetQty: newQty })
  }

  // Display label: merge_label takes precedence over raw table label (issue #274)
  const displayTableLabel = mergeLabel ?? tableLabel

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
              <span className="ml-2 text-xs font-bold text-emerald-400 no-underline not-italic [text-decoration:none]">
                COMP
              </span>
            )}
          </span>
          {/* Quantity controls (issue #368) — editable in order step, read-only otherwise */}
          {inOrderStep && !isComp ? (
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                aria-label="Decrease quantity"
                onClick={() => { handleQtyButton(item, -1) }}
                className="min-h-[48px] min-w-[48px] flex items-center justify-center rounded-lg bg-zinc-700 hover:bg-zinc-600 text-white text-xl font-bold transition-colors"
              >
                −
              </button>
              {qtyEditingId === item.id ? (
                <input
                  /* inputMode="numeric" opens the numeric keypad on tablets */
                  inputMode="numeric"
                  type="text"
                  value={qtyEditStr}
                  onChange={(e) => { setQtyEditStr(e.target.value.replace(/[^0-9]/g, '')) }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      const n = parseInt(qtyEditStr, 10)
                      commitQuantity(item, isNaN(n) ? item.quantity : n)
                    } else if (e.key === 'Escape') {
                      setQtyEditingId(null)
                      setQtyEditStr('')
                    }
                  }}
                  onBlur={() => {
                    const n = parseInt(qtyEditStr, 10)
                    commitQuantity(item, isNaN(n) ? item.quantity : n)
                  }}
                  className="w-14 text-center text-white font-bold text-base bg-zinc-700 border-2 border-amber-400 rounded-lg px-1 py-2 focus:outline-none"
                  // eslint-disable-next-line jsx-a11y/no-autofocus
                  autoFocus
                />
              ) : (
                <button
                  type="button"
                  aria-label={`Quantity ${item.quantity}, tap to edit`}
                  onClick={() => { setQtyEditingId(item.id); setQtyEditStr(String(item.quantity)) }}
                  className={[
                    'w-14 text-center font-bold text-base min-h-[48px] rounded-lg transition-colors border-2',
                    item.quantity > 1
                      ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                      : 'bg-zinc-700 hover:bg-zinc-600 text-white border-transparent hover:border-amber-400/50',
                  ].join(' ')}
                >
                  {item.quantity > 1 ? `×${item.quantity}` : item.quantity}
                </button>
              )}
              <button
                type="button"
                aria-label="Increase quantity"
                onClick={() => { handleQtyButton(item, 1) }}
                className="min-h-[48px] min-w-[48px] flex items-center justify-center rounded-lg bg-zinc-700 hover:bg-zinc-600 text-white text-xl font-bold transition-colors"
              >
                +
              </button>
            </div>
          ) : (
            <span className="text-zinc-400">×{item.quantity}</span>
          )}
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
        {/* Per-item note display (issue #272) */}
        {editingNoteItemId === item.id ? (
          <div className="mt-2 flex gap-2 items-center pl-2">
            <input
              type="text"
              className="flex-1 bg-zinc-700 text-white text-sm rounded-lg px-3 py-2 border border-zinc-600 focus:outline-none focus:border-amber-400"
              placeholder="Add note (e.g. no onions)"
              value={noteInputValue}
              maxLength={500}
              autoFocus
              onChange={(e) => setNoteInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  commitNote(item.id, noteInputValue, item.notes)
                } else if (e.key === 'Escape') {
                  setEditingNoteItemId(null)
                  setNoteInputValue('')
                }
              }}
              onBlur={() => {
                commitNote(item.id, noteInputValue, item.notes)
              }}
            />
            <button
              type="button"
              className="text-zinc-400 hover:text-white transition-colors p-1"
              onMouseDown={(e) => {
                // Prevent blur from firing before click
                e.preventDefault()
                setEditingNoteItemId(null)
                setNoteInputValue('')
              }}
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        ) : (
          <div className="mt-1 pl-2 flex items-center gap-2">
            {item.notes && (
              <p className="text-sm text-zinc-400 italic">↳ {item.notes}</p>
            )}
            {inOrderStep && (
              <button
                type="button"
                onClick={() => {
                  setEditingNoteItemId(item.id)
                  setNoteInputValue(item.notes ?? '')
                }}
                className="text-zinc-500 hover:text-amber-400 transition-colors p-1"
                aria-label={item.notes ? 'Edit note' : 'Add note'}
              >
                <Pencil size={12} aria-hidden="true" />
              </button>
            )}
          </div>
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
    { course: 'drinks', label: 'Drinks' },
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
      <main className="min-h-screen bg-brand-offwhite p-6 flex flex-col">
        <Link
          href="/tables"
          className="inline-flex items-center gap-2 text-brand-blue hover:text-brand-navy text-base mb-8 min-h-[48px] min-w-[48px] font-medium"
        >
          ← Back to tables
        </Link>

        <header className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-2xl font-bold text-brand-navy font-heading">Order</h1>
            {orderNumber !== null && (
              <span className="text-3xl font-extrabold text-amber-400 font-mono tracking-tight">
                #{String(orderNumber).padStart(3, '0')}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <div className="inline-flex items-center gap-2 bg-green-50 border border-green-400 rounded-xl px-4 py-2">
              <span className="text-green-700 font-semibold text-base">Paid</span>
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
                <dt className="text-gray-600">Table</dt>
                <dd className="font-semibold text-gray-900">{displayTableLabel || tableId}</dd>
              </div>
            )}
            {orderType === 'delivery' && orderCustomerName && (
              <div className="flex gap-3">
                <dt className="text-gray-600">Customer</dt>
                <dd className="font-semibold text-gray-900">{orderCustomerName}</dd>
              </div>
            )}
            {orderType === 'delivery' && orderDeliveryNote && (
              <div className="flex gap-3">
                <dt className="text-gray-600">Note</dt>
                <dd className="text-gray-700">{orderDeliveryNote}</dd>
              </div>
            )}
            {(orderType === 'takeaway' || orderType === 'delivery') && orderScheduledTime && (
              <div className="flex gap-3">
                <dt className="text-gray-600">{orderType === 'takeaway' ? 'Pickup Time' : 'Delivery Time'}</dt>
                <dd className="font-semibold text-amber-700">{formatDateTimeShort(orderScheduledTime)}</dd>
              </div>
            )}
            {/* Delivery fee in paid-order read-only view (issue #393) */}
            {orderType === 'delivery' && (
              <div className="flex gap-3">
                <dt className="text-gray-600">Delivery Fee</dt>
                <dd className={orderDeliveryChargeCents > 0 ? 'font-semibold text-amber-700' : 'font-semibold text-emerald-700'}>
                  {orderDeliveryChargeCents > 0
                    ? formatPrice(orderDeliveryChargeCents, currencySymbol)
                    : 'Free Delivery'}
                </dd>
              </div>
            )}
            {/* Payment breakdown (issue #391) — show per-method amounts for audit trail */}
            {paidPaymentLines.length > 0 ? (
              <div className="flex gap-3">
                <dt className="text-gray-600">Payment</dt>
                <dd className="font-semibold text-gray-900">
                  <div className="space-y-0.5">
                    {paidPaymentLines.map((pl, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <span>{PAYMENT_METHOD_LABELS[pl.method as PaymentMethod] ?? pl.method}</span>
                        <span className="text-amber-600">{formatPrice(pl.amount_cents, currencySymbol)}</span>
                      </div>
                    ))}
                  </div>
                </dd>
              </div>
            ) : paidPaymentMethod !== null ? (
              <div className="flex gap-3">
                <dt className="text-gray-600">Payment method</dt>
                <dd className="font-semibold text-gray-900">{PAYMENT_METHOD_LABELS[paidPaymentMethod as PaymentMethod] ?? paidPaymentMethod}</dd>
              </div>
            ) : null}
          </dl>
          {/* Reservation info block — shown when order was created via Seat action (issue #277) */}
          {orderReservationInfo !== null && (
            <div className="mt-4 flex items-start gap-2 bg-indigo-900/30 border border-indigo-500/30 rounded-xl px-4 py-3">
              <CalendarDays size={16} className="text-indigo-400 mt-0.5 shrink-0" aria-hidden="true" />
              <div className="text-sm space-y-0.5">
                <p className="text-indigo-300 font-semibold">Reservation — {orderReservationInfo.customer_name}</p>
                <p className="text-zinc-400">Party of {orderReservationInfo.party_size}</p>
                {orderReservationInfo.notes && (
                  <p className="text-zinc-500 italic">{orderReservationInfo.notes}</p>
                )}
              </div>
            </div>
          )}
          {/* Linked customer badge (issue #276) */}
          {linkedCustomer !== null && (
            <div className="mt-4 flex items-start gap-2 bg-emerald-900/30 border border-emerald-500/30 rounded-xl px-4 py-3">
              <UserCheck size={16} className="text-emerald-400 mt-0.5 shrink-0" aria-hidden="true" />
              <div className="text-sm space-y-0.5">
                <p className="text-emerald-300 font-semibold">{linkedCustomer.name ?? linkedCustomer.mobile}</p>
                <p className="text-zinc-400">{linkedCustomer.mobile} · {linkedCustomer.visit_count} visit{linkedCustomer.visit_count !== 1 ? 's' : ''}</p>
              </div>
            </div>
          )}
        </header>

        <section className="flex-1">
          <h2 className="text-lg font-semibold text-brand-navy mb-4">Items</h2>
          {renderReadOnlyItems()}
        </section>

        <footer className="mt-6 pt-4 border-t border-gray-300">
          <div className="flex items-center justify-between mb-6">
            <span className="text-lg text-gray-600">Total</span>
            <span className="text-2xl font-bold text-gray-900">{totalFormatted}</span>
          </div>
          <Link
            href="/tables"
            className="w-full inline-flex items-center justify-center min-h-[48px] min-w-[48px] px-6 rounded-xl text-base font-semibold bg-brand-navy hover:bg-brand-blue text-white transition-colors"
          >
            Back to tables
          </Link>
        </footer>

        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-brand-offwhite p-6 flex flex-col">
      {/* KOT print component — only marked as print-area when KOT is actively printing */}
      <div className={kotStatus !== null || reprintingKot || firingCourse !== null ? 'print-area' : ''}>
        <KotPrintView
          tableLabel={displayTableLabel || tableId.slice(0, 8)}
          orderId={orderId}
          items={items}
          timestamp={kotTimestamp}
          showAll={kotShowAll}
          courseFilter={kotCourseFilter ?? undefined}
          orderType={orderType}
          customerName={orderCustomerName}
          customerMobile={orderCustomerMobile}
          deliveryNote={orderDeliveryNote}
          orderNumber={orderNumber}
          scheduledTime={orderScheduledTime}
          isNewAddition={kotIsNewAddition}
        />
      </div>

      {/* Bill print component — only marked as print-area when bill is actively printing */}
      {!splitBillPrinting && (
        <div className={(printingBill || printingPreBill) ? 'print-area' : ''}>
          <BillPrintView
            tableLabel={displayTableLabel || tableId.slice(0, 8)}
            orderId={orderId}
            items={items}
            subtotalCents={billSubtotalCents}
            vatPercent={vatPercent}
            taxInclusive={taxInclusive}
            vatCents={billVatCents}
            totalCents={billTotalCents}
            paymentMethod={billPaymentMethod}
            amountTenderedCents={billAmountTenderedCents}
            changeDueCents={changeDueCents > 0 ? changeDueCents : undefined}
            splitPayments={billSplitPayments}
            timestamp={billTimestamp}
            discountAmountCents={appliedDiscountCents}
            discountLabel={appliedDiscountLabel}
            orderComp={orderIsComp}
            serviceChargePercent={effectiveServiceChargePercent}
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
            orderNumber={orderNumber}
            deliveryChargeCents={billDeliveryChargeCents > 0 ? billDeliveryChargeCents : undefined}
            deliveryZoneName={orderDeliveryZoneName ?? undefined}
            roundBillTotals={roundBillTotals}
            isDue={printingPreBill}
          />
        </div>
      )}

      {/* Split bill print component — only marked as print-area when split bill is printing */}
      {splitBillPrinting && (
        <div className="print-area">
          <SplitBillPrintView
            tableLabel={displayTableLabel || tableId.slice(0, 8)}
            orderId={orderId}
            items={items}
            covers={covers}
            vatPercent={vatPercent}
            taxInclusive={taxInclusive}
            timestamp={splitBillTimestamp}
            evenSplit={splitBillPrintMode === 'even'}
            serviceChargePercent={effectiveServiceChargePercent}
            restaurantName={restaurantName}
            restaurantAddress={restaurantAddress}
            binNumber={binNumber}
            billNumber={orderBillNumber ?? undefined}
            registerName={registerName}
            orderNumber={orderNumber}
            roundBillTotals={roundBillTotals}
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
                  lookupCustomerByMobile(e.target.value)
                }}
                className="w-full min-h-[48px] px-4 rounded-xl text-base bg-zinc-700 text-white border-2 border-zinc-600 focus:border-amber-400 focus:outline-none"
              />
              {customerLookup !== null && (
                <div className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-indigo-900/40 border border-indigo-700 text-indigo-300 text-sm font-medium">
                  <Phone size={12} aria-hidden="true" />
                  {ordinalSuffixForBadge(customerLookup.visit_count)} visit · {formatPrice(customerLookup.total_spend_cents, currencySymbol)} total
                </div>
              )}
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

      {/* Merge tables modal (issue #274) */}
      {showMergeModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70">
          <div className="w-full max-w-lg bg-zinc-900 rounded-t-2xl p-6 space-y-4 max-h-[80vh] overflow-y-auto">
            {mergeTarget === null ? (
              <>
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold text-white">Merge with…</h2>
                  <button
                    type="button"
                    onClick={() => { setShowMergeModal(false) }}
                    className="text-zinc-400 hover:text-white px-3 py-2 min-h-[48px] min-w-[48px] flex items-center justify-center"
                    aria-label="Close"
                  >
                    <X size={20} aria-hidden="true" />
                  </button>
                </div>
                <p className="text-zinc-400 text-base">Select a table to combine with {displayTableLabel}:</p>
                {mergeTablesLoading && <p className="text-zinc-400 text-base">Loading tables…</p>}
                {mergeTablesError !== null && <p className="text-red-400 text-base">{mergeTablesError}</p>}
                {!mergeTablesLoading && mergeTablesError === null && mergeableTables.length === 0 && (
                  <p className="text-zinc-500 text-base">No other occupied tables available to merge.</p>
                )}
                {!mergeTablesLoading && mergeableTables.length > 0 && (
                  <div className="grid grid-cols-2 gap-3">
                    {mergeableTables.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => { setMergeTarget(t); setMergeError(null) }}
                        className="min-h-[80px] rounded-xl bg-zinc-700 hover:bg-zinc-600 border-2 border-zinc-600 hover:border-purple-400 flex flex-col items-center justify-center gap-1 transition-colors"
                      >
                        <span className="text-white font-bold text-lg">{t.label}</span>
                        <span className="text-xs font-semibold text-amber-400 bg-amber-900/40 px-2 py-0.5 rounded-full">Occupied</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <>
                <h2 className="text-xl font-semibold text-white">Confirm Merge</h2>
                <p className="text-zinc-300 text-base">
                  Merge <span className="font-semibold text-white">{displayTableLabel}</span> with{' '}
                  <span className="font-semibold text-white">{mergeTarget.label}</span>?
                </p>
                <p className="text-zinc-500 text-sm">
                  All items from {mergeTarget.label} will be combined into this order.
                  The combined table will be shown as &ldquo;{displayTableLabel} + {mergeTarget.label}&rdquo;.
                </p>
                {mergeError !== null && (
                  <p className="text-red-400 text-base">{mergeError}</p>
                )}
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => { setMergeTarget(null); setMergeError(null) }}
                    disabled={merging}
                    className="flex-1 min-h-[48px] min-w-[48px] px-6 rounded-xl text-base font-semibold border-2 border-zinc-600 text-zinc-300 hover:border-zinc-400 transition-colors disabled:opacity-50"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={() => { void handleMergeTables() }}
                    disabled={merging}
                    className={[
                      'flex-1 min-h-[48px] min-w-[48px] px-6 rounded-xl text-base font-semibold transition-colors',
                      merging
                        ? 'bg-zinc-700 text-zinc-400 cursor-wait'
                        : 'bg-purple-600 hover:bg-purple-500 text-white',
                    ].join(' ')}
                  >
                    {merging ? 'Merging…' : 'Confirm Merge'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Unmerge confirmation dialog (issue #274) */}
      {showUnmergeConfirm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70">
          <div className="w-full max-w-lg bg-zinc-900 rounded-t-2xl p-6 space-y-4">
            <h2 className="text-xl font-semibold text-white">Unmerge Tables</h2>
            <p className="text-zinc-300 text-base">
              Split <span className="font-semibold text-white">{displayTableLabel}</span> back into individual tables?
            </p>
            <p className="text-zinc-500 text-sm">
              All items will remain on this order. Secondary tables will become available again.
            </p>
            {unmergeError !== null && (
              <p className="text-red-400 text-base">{unmergeError}</p>
            )}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => { setShowUnmergeConfirm(false); setUnmergeError(null) }}
                disabled={unmerging}
                className="flex-1 min-h-[48px] min-w-[48px] px-6 rounded-xl text-base font-semibold border-2 border-zinc-600 text-zinc-300 hover:border-zinc-400 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => { void handleUnmergeTables() }}
                disabled={unmerging}
                className={[
                  'flex-1 min-h-[48px] min-w-[48px] px-6 rounded-xl text-base font-semibold transition-colors',
                  unmerging
                    ? 'bg-zinc-700 text-zinc-400 cursor-wait'
                    : 'bg-purple-600 hover:bg-purple-500 text-white',
                ].join(' ')}
              >
                {unmerging ? 'Unmerging…' : 'Confirm Unmerge'}
              </button>
            </div>
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

      {/* Reassign server modal */}
      {showReassignModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70">
          <div className="w-full max-w-lg bg-zinc-800 rounded-t-2xl p-6 space-y-4 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-white">Reassign Server</h2>
              <button type="button" onClick={() => { setShowReassignModal(false) }} className="text-zinc-400 hover:text-white px-3 py-2 min-h-[48px] min-w-[48px] flex items-center justify-center" aria-label="Close">
                <X size={20} aria-hidden="true" />
              </button>
            </div>
            <p className="text-zinc-400 text-base">Select a server to reassign this order to:</p>
            {reassignServersLoading && <p className="text-zinc-400 text-base">Loading servers…</p>}
            {reassignError !== null && <p className="text-red-400 text-base">{reassignError}</p>}
            {!reassignServersLoading && serverOptions.length > 0 && (
              <div className="space-y-2">
                {serverOptions.map(s => (
                  <button key={s.id} type="button" onClick={() => setReassignTarget(s.id)} className={['w-full min-h-[56px] rounded-xl px-4 py-3 text-left transition-colors border-2', reassignTarget === s.id ? 'bg-indigo-900/40 border-indigo-500 text-white' : 'bg-zinc-700 border-zinc-600 hover:border-indigo-400 text-zinc-200'].join(' ')}>
                    <span className="font-medium">{s.name ?? s.email}</span>
                    {s.name && <span className="text-zinc-400 text-sm ml-2">{s.email}</span>}
                  </button>
                ))}
              </div>
            )}
            {!reassignServersLoading && serverOptions.length === 0 && !reassignError && (
              <p className="text-zinc-500 text-base">No servers found.</p>
            )}
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => { setShowReassignModal(false) }} disabled={reassigning} className="flex-1 min-h-[48px] px-6 rounded-xl text-base font-semibold border-2 border-zinc-600 text-zinc-300 hover:border-zinc-400 transition-colors disabled:opacity-50">Cancel</button>
              <button type="button" onClick={() => { void handleReassignServer() }} disabled={reassigning || !reassignTarget} className={['flex-1 min-h-[48px] px-6 rounded-xl text-base font-semibold transition-colors', reassigning || !reassignTarget ? 'bg-zinc-700 text-zinc-400 cursor-wait' : 'bg-indigo-600 hover:bg-indigo-500 text-white'].join(' ')}>{reassigning ? 'Reassigning…' : 'Confirm'}</button>
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
        className="inline-flex items-center gap-2 text-brand-blue hover:text-brand-navy text-base mb-8 min-h-[48px] min-w-[48px] font-medium disabled:opacity-50 disabled:cursor-not-allowed"
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
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-2xl font-bold text-brand-navy font-heading">Order</h1>
          {orderNumber !== null && (
            <span className="text-3xl font-extrabold text-amber-400 font-mono tracking-tight">
              #{String(orderNumber).padStart(3, '0')}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {orderIsComp && (
            <div className="inline-flex items-center gap-2 bg-emerald-50 border border-emerald-400 rounded-xl px-4 py-2">
              <span className="text-emerald-700 font-semibold text-base inline-flex items-center gap-1"><Star size={16} aria-hidden="true" />Complimentary Order</span>
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
              <dt className="text-gray-600">Table</dt>
              <dd className="font-semibold text-gray-900">{displayTableLabel || tableId}</dd>
            </div>
          )}
          {orderType === 'delivery' && orderCustomerName && (
            <div className="flex gap-3">
              <dt className="text-gray-600">Customer</dt>
              <dd className="font-semibold text-gray-900">{orderCustomerName}</dd>
            </div>
          )}
          {orderType === 'delivery' && orderDeliveryNote && (
            <div className="flex gap-3">
              <dt className="text-gray-600">Note</dt>
              <dd className="text-gray-700">{orderDeliveryNote}</dd>
            </div>
          )}
          {(orderType === 'takeaway' || orderType === 'delivery') && orderScheduledTime && (
            <div className="flex gap-3">
              <dt className="text-gray-600">{orderType === 'takeaway' ? 'Pickup Time' : 'Delivery Time'}</dt>
              <dd className="font-semibold text-amber-700">{formatDateTimeShort(orderScheduledTime)}</dd>
            </div>
          )}
          {/* ── Delivery fee — always visible in the order header for delivery orders (issue #393) ── */}
          {orderType === 'delivery' && (
            <div className="flex gap-3">
              <dt className="text-gray-600">Delivery Fee</dt>
              <dd
                data-testid="delivery-fee-header"
                className={orderDeliveryChargeCents > 0 ? 'font-semibold text-amber-700' : 'font-semibold text-emerald-700'}
              >
                {orderDeliveryChargeCents > 0
                  ? formatPrice(orderDeliveryChargeCents, currencySymbol)
                  : 'Free Delivery'}
              </dd>
            </div>
          )}
        </dl>
        {/* Reservation info block — shown when order was created via Seat action (issue #277) */}
        {orderReservationInfo !== null && (
          <div className="mt-4 flex items-start gap-2 bg-indigo-900/30 border border-indigo-500/30 rounded-xl px-4 py-3">
            <CalendarDays size={16} className="text-indigo-400 mt-0.5 shrink-0" aria-hidden="true" />
            <div className="text-sm space-y-0.5">
              <p className="text-indigo-300 font-semibold">Reservation — {orderReservationInfo.customer_name}</p>
              <p className="text-zinc-400">Party of {orderReservationInfo.party_size}</p>
              {orderReservationInfo.notes && (
                <p className="text-zinc-500 italic">{orderReservationInfo.notes}</p>
              )}
            </div>
          </div>
        )}
        {/* Linked customer badge — all order types (issue #276) */}
        {linkedCustomer !== null && (
          <div className="mt-4 flex items-start gap-2 bg-emerald-900/30 border border-emerald-500/30 rounded-xl px-4 py-3">
            <UserCheck size={16} className="text-emerald-400 mt-0.5 shrink-0" aria-hidden="true" />
            <div className="text-sm space-y-0.5">
              <p className="text-emerald-300 font-semibold">{linkedCustomer.name ?? linkedCustomer.mobile}</p>
              <p className="text-zinc-400">{linkedCustomer.mobile} · {linkedCustomer.visit_count} visit{linkedCustomer.visit_count !== 1 ? 's' : ''}</p>
            </div>
          </div>
        )}
        {/* "Link customer" search — dine-in orders only (auto-linked for takeaway/delivery at close_order) */}
        {orderType === 'dine_in' && linkedCustomer === null && (
          <div className="mt-4">
            <button
              type="button"
              onClick={() => { setShowLinkCustomer((v) => !v); setLinkMobileSearch(''); setLinkSearchResults([]); setLinkError(null) }}
              className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors min-h-[36px]"
            >
              <UserPlus size={14} aria-hidden="true" />
              {showLinkCustomer ? 'Cancel' : 'Link customer'}
            </button>
            {showLinkCustomer && (
              <div className="mt-2 space-y-2">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" aria-hidden="true" />
                  <input
                    type="tel"
                    placeholder="Search by mobile…"
                    value={linkMobileSearch}
                    onChange={(e) => { setLinkMobileSearch(e.target.value) }}
                    className="w-full pl-9 pr-4 py-2 rounded-xl bg-zinc-800 text-white border border-zinc-600 focus:border-indigo-500 focus:outline-none text-sm placeholder:text-zinc-500"
                    autoFocus
                  />
                </div>
                {linkSearching && <p className="text-zinc-500 text-xs">Searching…</p>}
                {!linkSearching && linkSearchResults.length > 0 && (
                  <ul className="space-y-1">
                    {linkSearchResults.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => { void handleLinkCustomer(c) }}
                          className="w-full text-left px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-sm text-white transition-colors"
                        >
                          <span className="font-semibold">{c.name ?? '—'}</span>
                          <span className="text-zinc-400 ml-2">{c.mobile}</span>
                          <span className="text-zinc-500 ml-2 text-xs">{c.visit_count} visit{c.visit_count !== 1 ? 's' : ''}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {!linkSearching && linkMobileSearch.trim().length >= 4 && linkSearchResults.length === 0 && (
                  <p className="text-zinc-500 text-xs">No customers found</p>
                )}
                {linkError !== null && <p className="text-red-400 text-xs">{linkError}</p>}
              </div>
            )}
          </div>
        )}
        {/* Covers field — always visible in order step */}
        {step === 'order' && (
          <div className="flex items-center gap-3 mt-4">
            <span className="text-gray-600 text-base">Covers:</span>
            <button
              type="button"
              onClick={() => { handleCoversChange(covers - 1) }}
              disabled={covers <= 1}
              className="min-h-[48px] min-w-[48px] rounded-xl bg-gray-200 text-gray-900 text-xl font-bold hover:bg-gray-300 border border-gray-300 transition-colors disabled:opacity-40"
              aria-label="Decrease covers"
            >
              −
            </button>
            <span className="text-gray-900 font-bold text-xl w-8 text-center">{covers}</span>
            <button
              type="button"
              onClick={() => { handleCoversChange(covers + 1) }}
              disabled={covers >= 20}
              className="min-h-[48px] min-w-[48px] rounded-xl bg-gray-200 text-gray-900 text-xl font-bold hover:bg-gray-300 border border-gray-300 transition-colors disabled:opacity-40"
              aria-label="Increase covers"
            >
              +
            </button>
          </div>
        )}
      </header>

      <section className="flex-1">
        <h2 className="text-lg font-semibold text-brand-navy mb-4">Items</h2>
        {renderItems()}
      </section>

      {/* print:hidden ensures this footer (containing the payment-step subtotal breakdown)
          is never rendered during window.print() — prevents duplicate subtotal on bill (issue #369) */}
      <footer className="mt-6 pt-4 border-t border-gray-300 print:hidden">
        <div className="flex items-center justify-between mb-6">
          <span className="text-lg text-gray-600">Total</span>
          {orderIsComp ? (
            <span className="text-2xl font-bold text-emerald-700">COMPLIMENTARY</span>
          ) : (
            <span className="text-2xl font-bold text-gray-900">{totalFormatted}</span>
          )}
        </div>

        {step === 'bill_preview' ? (
          <div className="space-y-5">
            <h2 className="text-xl font-semibold text-brand-navy">Bill Preview</h2>

            {/* Order meta */}
            <div className="bg-zinc-800 rounded-xl px-4 py-3 text-sm space-y-1.5">
              {orderNumber !== null && (
                <div className="flex justify-between text-zinc-300">
                  <span className="text-zinc-400">Order</span>
                  <span className="font-bold text-amber-400">#{String(orderNumber).padStart(3, '0')}</span>
                </div>
              )}
              {orderType === 'dine_in' && displayTableLabel && (
                <div className="flex justify-between text-zinc-300">
                  <span className="text-zinc-400">Table</span>
                  <span className="font-semibold">{displayTableLabel}</span>
                </div>
              )}
              {orderType === 'takeaway' && (
                <div className="flex justify-between text-zinc-300">
                  <span className="text-zinc-400">Type</span>
                  <span className="font-semibold text-amber-400 inline-flex items-center gap-1"><ShoppingBag size={14} aria-hidden="true" />Takeaway</span>
                </div>
              )}
              {orderType === 'delivery' && (
                <div className="flex justify-between text-zinc-300">
                  <span className="text-zinc-400">Type</span>
                  <span className="font-semibold text-blue-400 inline-flex items-center gap-1"><Bike size={14} aria-hidden="true" />Delivery</span>
                </div>
              )}
              {orderType === 'delivery' && orderCustomerName && (
                <div className="flex justify-between text-zinc-300">
                  <span className="text-zinc-400">Customer</span>
                  <span className="font-semibold">{orderCustomerName}</span>
                </div>
              )}
            </div>

            {/* Items */}
            <div className="space-y-1">
              <p className="text-zinc-400 text-sm font-semibold uppercase tracking-wider mb-2">Items</p>
              <ul className="space-y-1.5">
                {items.map((item) => {
                  const isComp = item.comp || orderIsComp
                  const grossCents = item.quantity * item.price_cents
                  const itemDiscountCents = isComp ? 0 : calcItemDiscountCents(item)
                  const lineCents = grossCents - itemDiscountCents
                  return (
                    <li key={item.id} className="bg-zinc-800 rounded-xl px-4 py-3 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className={['font-medium text-white flex-1', isComp ? 'line-through' : ''].join(' ')}>
                          {item.name}
                          {isComp && <span className="ml-2 text-xs font-bold text-emerald-400 not-italic [text-decoration:none]">COMP</span>}
                        </span>
                        <span className="text-zinc-400">×{item.quantity}</span>
                        <span className="text-zinc-400">{formatPrice(item.price_cents, currencySymbol)}</span>
                        {isComp ? (
                          <span className="text-emerald-400 italic text-xs">Free</span>
                        ) : (
                          <span className="font-bold text-amber-400">{formatPrice(lineCents, currencySymbol)}</span>
                        )}
                      </div>
                      {item.modifier_names.length > 0 && (
                        <ul className="mt-1 pl-2 space-y-0.5">
                          {item.modifier_names.map((modName) => (
                            <li key={modName} className="text-xs text-zinc-500">+ {modName}</li>
                          ))}
                        </ul>
                      )}
                      {item.notes && (
                        <p className="mt-1 pl-2 text-xs text-zinc-500 italic">↳ {item.notes}</p>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>

            {/* Totals breakdown */}
            <div className="bg-zinc-800 rounded-xl px-4 py-3 text-sm space-y-1.5">
              <div className="flex justify-between text-zinc-400">
                <span>Subtotal</span>
                <span>{formatPrice(billSubtotalCents, currencySymbol, roundBillTotals)}</span>
              </div>
              {appliedDiscountCents > 0 && (
                <div className="flex justify-between text-emerald-400">
                  <span>Discount{appliedDiscountLabel ? ` (${appliedDiscountLabel})` : ''}</span>
                  <span>-{formatPrice(appliedDiscountCents, currencySymbol, roundBillTotals)}</span>
                </div>
              )}
              {effectiveServiceChargePercent > 0 && billServiceChargeCents > 0 && !orderIsComp && (
                <div className="flex justify-between text-zinc-400">
                  <span>Service Charge ({effectiveServiceChargePercent}%)</span>
                  <span>{formatPrice(billServiceChargeCents, currencySymbol, roundBillTotals)}</span>
                </div>
              )}
              {billVatCents > 0 && (
                <div className="flex justify-between text-zinc-400">
                  <span>VAT {vatPercent}%{taxInclusive ? ' (incl.)' : ''}</span>
                  <span>{formatPrice(billVatCents, currencySymbol, roundBillTotals)}</span>
                </div>
              )}
              {billDeliveryChargeCents > 0 && (
                <div className="flex justify-between text-zinc-400">
                  <span>Delivery Charge{orderDeliveryZoneName ? ` (${orderDeliveryZoneName})` : ''}</span>
                  <span>{formatPrice(billDeliveryChargeCents, currencySymbol, roundBillTotals)}</span>
                </div>
              )}
              {orderIsComp && (
                <div className="flex justify-between text-emerald-400 font-semibold">
                  <span className="inline-flex items-center gap-1"><Star size={14} aria-hidden="true" />Complimentary</span>
                  <span>COMP</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-white border-t border-zinc-700 pt-1.5 mt-1 text-base">
                <span>Grand Total</span>
                {orderIsComp ? (
                  <span className="text-emerald-400">COMPLIMENTARY</span>
                ) : (
                  <span>{formatPrice(billTotalCents, currencySymbol, roundBillTotals)}</span>
                )}
              </div>
            </div>

            {closeError !== null && (
              <p className="text-base text-red-400">{closeError}</p>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => { setStep('order'); setCloseError(null) }}
                disabled={closing}
                className="flex-1 min-h-[48px] min-w-[48px] px-6 rounded-xl text-base font-semibold border-2 border-zinc-600 text-zinc-300 hover:border-zinc-400 transition-colors disabled:opacity-50"
              >
                ← Back
              </button>
              <button
                type="button"
                onClick={() => { void handleProceedToPayment() }}
                disabled={closing}
                className={[
                  'flex-1 min-h-[48px] min-w-[48px] px-6 rounded-xl text-base font-semibold transition-colors',
                  closing
                    ? 'bg-zinc-700 text-zinc-400 cursor-wait'
                    : 'bg-amber-500 hover:bg-amber-400 text-zinc-900',
                ].join(' ')}
              >
                {closing ? 'Processing…' : 'Proceed to Payment'}
              </button>
            </div>
          </div>
        ) : step === 'order' ? (
          statusLoading ? (
            <div className="flex justify-center py-4">
              <p className="text-zinc-400 text-base">Loading…</p>
            </div>
          ) : (
            <>
            {/* Due status badge — visible when order has been marked as due (issue #370) */}
            {orderIsDue && (
              <div className="mb-3 flex items-center gap-2 bg-orange-900/30 border border-orange-600 rounded-xl px-4 py-2">
                <span className="text-orange-400 font-bold text-sm">⏳ BILL DUE</span>
                <span className="text-orange-300 text-sm">Payment pending — settle when guest is ready</span>
              </div>
            )}

            {/* Post-bill mode banner — visible after order was reopened for item additions (issue #394) */}
            {postBillMode && orderType === 'dine_in' && (
              <div className="mb-3 flex items-center gap-2 bg-violet-900/30 border border-violet-600 rounded-xl px-4 py-2">
                <span className="text-violet-400 font-bold text-sm">+</span>
                <span className="text-violet-300 text-sm font-medium">Post-bill addition — add items, then close order to regenerate bill</span>
              </div>
            )}

            <div className="flex gap-4 mb-3">
              <Link
                href={`/tables/${tableId}/order/${orderId}/menu`}
                className="flex-1 inline-flex items-center justify-center min-h-[48px] min-w-[48px] px-6 rounded-xl border-2 border-brand-blue text-brand-navy text-base font-semibold hover:border-brand-navy hover:bg-brand-blue/10 transition-colors"
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
                    : orderIsDue
                      ? 'bg-amber-600 hover:bg-amber-500 text-white'
                      : 'bg-red-700 hover:bg-red-600 text-white',
                ].join(' ')}
              >
                {closing ? 'Processing…' : orderIsDue ? <span className='inline-flex items-center gap-1'><Banknote size={16} aria-hidden='true' />Settle Bill</span> : 'Close Order'}
              </button>
            </div>

            {/* Pre-payment bill print — dine-in and takeaway only (issue #370) */}
            {items.length >= 1 && orderType !== 'delivery' && (
              <button
                type="button"
                onClick={handlePrintPreBill}
                disabled={printingPreBill}
                className={[
                  'w-full min-h-[48px] min-w-[48px] px-6 rounded-xl text-base font-semibold transition-colors mb-3',
                  printingPreBill
                    ? 'bg-gray-100 text-gray-400 cursor-wait'
                    : 'bg-transparent border-2 border-amber-500 text-amber-700 hover:bg-amber-50 hover:border-amber-600',
                ].join(' ')}
              >
                {printingPreBill ? 'Printing…' : <span className='inline-flex items-center gap-1'><PrinterIcon size={16} aria-hidden='true' />Print Bill (DUE)</span>}
              </button>
            )}

            {/* Mark as Due — dine-in only, not already due (issue #370) */}
            {orderType === 'dine_in' && !orderIsDue && items.length >= 1 && (
              <div className="space-y-1 mb-3">
                <button
                  type="button"
                  onClick={() => { void handleMarkAsDue() }}
                  disabled={markingDue}
                  className={[
                    'w-full min-h-[48px] min-w-[48px] px-6 rounded-xl text-base font-semibold transition-colors',
                    markingDue
                      ? 'bg-gray-100 text-gray-400 cursor-wait'
                      : 'bg-transparent border-2 border-orange-500 text-orange-700 hover:bg-orange-50 hover:border-orange-600',
                  ].join(' ')}
                >
                  {markingDue ? 'Marking…' : <span className='inline-flex items-center gap-1'><Clock size={16} aria-hidden='true' />Mark as Due</span>}
                </button>
                {markDueError !== null && (
                  <p className="text-xs text-red-400">{markDueError}</p>
                )}
              </div>
            )}

            {items.length >= 1 && (
              <button
                type="button"
                onClick={handleReprintKot}
                disabled={reprintingKot}
                className={[
                  'w-full min-h-[48px] min-w-[48px] px-6 rounded-xl text-base font-semibold transition-colors mb-3',
                  reprintingKot
                    ? 'bg-brand-grey/30 text-brand-navy/50 cursor-wait'
                    : 'bg-brand-navy hover:bg-brand-blue text-white border-2 border-brand-navy',
                ].join(' ')}
              >
                {reprintingKot ? 'Reprinting…' : <span className='inline-flex items-center gap-1'><PrinterIcon size={16} aria-hidden='true' />Reprint KOT</span>}
              </button>
            )}

            {orderType === 'dine_in' && (
              <button
                type="button"
                onClick={() => { void openTransferModal() }}
                className="w-full min-h-[48px] min-w-[48px] px-6 rounded-xl text-base font-semibold text-gray-600 hover:text-amber-700 border-2 border-gray-400 hover:border-amber-500 hover:bg-amber-50 transition-colors mb-3"
              >
                ↔ Move Table
              </button>
            )}

            {/* Merge / Unmerge (issue #274) — dine-in only */}
            {orderType === 'dine_in' && mergeLabel === null && (
              <button
                type="button"
                onClick={() => { void openMergeModal() }}
                className="w-full min-h-[48px] min-w-[48px] px-6 rounded-xl text-base font-semibold text-gray-600 hover:text-purple-700 border-2 border-gray-400 hover:border-purple-500 hover:bg-purple-50 transition-colors mb-3"
              >
                ⊕ Merge with…
              </button>
            )}
            {orderType === 'dine_in' && mergeLabel !== null && (
              <button
                type="button"
                onClick={() => { setUnmergeError(null); setShowUnmergeConfirm(true) }}
                className="w-full min-h-[48px] min-w-[48px] px-6 rounded-xl text-base font-semibold text-purple-700 hover:text-white border-2 border-purple-500 hover:border-purple-400 hover:bg-purple-700 transition-colors mb-3"
              >
                ⊘ Unmerge ({mergeLabel})
              </button>
            )}

            {isAdmin && (
              <button
                type="button"
                onClick={() => { void openReassignModal() }}
                className="w-full min-h-[48px] min-w-[48px] px-6 rounded-xl text-base font-semibold text-gray-600 hover:text-indigo-700 border-2 border-gray-400 hover:border-indigo-500 hover:bg-indigo-50 transition-colors mb-3"
              >
                <span className='inline-flex items-center gap-1'><UserCog size={16} aria-hidden='true' />Reassign Server</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setCancelReason('')
                setCancelError(null)
                setShowCancelDialog(true)
              }}
              className="w-full min-h-[48px] min-w-[48px] px-6 rounded-xl text-base font-semibold text-gray-600 hover:text-red-700 border-2 border-gray-400 hover:border-red-500 hover:bg-red-50 transition-colors mb-3"
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
                className="w-full min-h-[48px] min-w-[48px] px-6 rounded-xl text-base font-semibold text-emerald-700 hover:text-white border-2 border-emerald-600 hover:border-emerald-500 hover:bg-emerald-700 transition-colors"
              >
                Comp entire order
              </button>
            )}

            {/* Free delivery toggle — delivery orders only (issues #382, #393) */}
            {/* Available to all staff (not just admin) so any role can waive on the spot */}
            {orderType === 'delivery' && (
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => { void handleToggleDeliveryFeeWaiver() }}
                  disabled={waivingDeliveryFee}
                  className={[
                    'w-full min-h-[48px] min-w-[48px] px-6 rounded-xl text-base font-semibold transition-colors border-2',
                    waivingDeliveryFee
                      ? 'border-gray-300 text-gray-400 cursor-wait'
                      : deliveryFeeWaived
                        ? 'border-amber-500 text-amber-700 hover:border-amber-600 hover:bg-amber-50'
                        : 'border-blue-500 text-blue-700 hover:border-blue-600 hover:bg-blue-50',
                  ].join(' ')}
                >
                  {waivingDeliveryFee
                    ? 'Updating…'
                    : deliveryFeeWaived
                      ? '↩ Restore Delivery Fee'
                      : <span className='inline-flex items-center gap-1'><Tag size={16} aria-hidden='true' />Waive Delivery Fee</span>}
                </button>
                {waiveDeliveryFeeError !== null && (
                  <p className="text-xs text-red-400">{waiveDeliveryFeeError}</p>
                )}
              </div>
            )}

            {closeError !== null && (
              <p className="mt-4 text-base text-red-400">{closeError}</p>
            )}
            </>
          )
        ) : step === 'payment' ? (
          <div className="space-y-5">
            <h2 className="text-xl font-semibold text-white">Record Payment</h2>

            {/* Order total breakdown */}
            <div className="bg-zinc-800 rounded-xl px-4 py-3 text-sm space-y-1.5">
              <div className="flex justify-between text-zinc-400">
                <span>Subtotal</span>
                <span>{formatPrice(billSubtotalCents, currencySymbol, roundBillTotals)}</span>
              </div>
              {appliedDiscountCents > 0 && (
                <div className="flex justify-between text-emerald-400">
                  <span>Discount{appliedDiscountLabel ? ` (${appliedDiscountLabel})` : ''}</span>
                  <span>-{formatPrice(appliedDiscountCents, currencySymbol, roundBillTotals)}</span>
                </div>
              )}
              {effectiveServiceChargePercent > 0 && billServiceChargeCents > 0 && !orderIsComp && (
                <div className="flex justify-between text-zinc-400">
                  <span>Service Charge ({effectiveServiceChargePercent}%)</span>
                  <span>{formatPrice(billServiceChargeCents, currencySymbol, roundBillTotals)}</span>
                </div>
              )}
              {billVatCents > 0 && (
                <div className="flex justify-between text-zinc-400">
                  <span>VAT {vatPercent}%{taxInclusive ? ' (incl.)' : ''}</span>
                  <span>{formatPrice(billVatCents, currencySymbol, roundBillTotals)}</span>
                </div>
              )}
              {billDeliveryChargeCents > 0 && (
                <div className="flex justify-between text-zinc-400">
                  <span>Delivery Charge{orderDeliveryZoneName ? ` (${orderDeliveryZoneName})` : ''}</span>
                  <span>{formatPrice(billDeliveryChargeCents, currencySymbol, roundBillTotals)}</span>
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
                  <span>{formatPrice(billTotalCents, currencySymbol, roundBillTotals)}</span>
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

            {/* ── Split Payment Builder (issue #280) ─────────────────── */}
            {!orderIsComp && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-zinc-300 text-base font-semibold">
                    {splitRemainingCents > 0
                      ? `Remaining: ${formatPrice(splitRemainingCents, currencySymbol, roundBillTotals)}`
                      : splitChangeDueCents > 0
                        ? `Change due: ${formatPrice(splitChangeDueCents, currencySymbol, roundBillTotals)}`
                        : 'Full amount covered ✓'}
                  </p>
                </div>

                {/* Already-added payment rows */}
                {splitPayments.length > 0 && (
                  <ul className="space-y-1.5">
                    {splitPayments.map((p, idx) => (
                      <li key={idx} className="flex items-center gap-2 bg-zinc-800 rounded-xl px-4 py-2.5">
                        <span className="flex-1 font-semibold text-white text-sm">
                          {PAYMENT_METHOD_LABELS[p.method]}
                        </span>
                        <span className="text-amber-400 font-bold text-sm">
                          {formatPrice(p.amountCents, currencySymbol, roundBillTotals)}
                        </span>
                        <button
                          type="button"
                          onClick={() => { handleRemoveSplitPayment(idx) }}
                          className="min-h-[36px] min-w-[36px] text-zinc-500 hover:text-red-400 transition-colors flex items-center justify-center"
                          aria-label="Remove payment"
                        >
                          <X size={14} aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                {/* Add payment entry row — shown while there is outstanding balance or no payment has been added yet */}
                {(splitRemainingCents > 0 || splitPayments.length === 0) && (
                  <div className="space-y-2">
                    {/* Method selector */}
                    <div className="flex gap-2">
                      {PAYMENT_METHODS.map((method) => (
                        <button
                          key={method}
                          type="button"
                          onClick={() => { setSplitEntryMethod(method); setSplitEntryError(null) }}
                          className={[
                            'flex-1 min-h-[48px] rounded-xl text-sm font-semibold transition-colors border-2',
                            splitEntryMethod === method
                              ? 'bg-brand-gold text-brand-navy border-brand-gold'
                              : 'bg-zinc-800 text-white border-zinc-600 hover:border-zinc-400',
                          ].join(' ')}
                        >
                          {PAYMENT_METHOD_LABELS[method]}
                        </button>
                      ))}
                    </div>

                    {/* Amount input */}
                    <div className="flex gap-2">
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        placeholder={
                          splitRemainingCents > 0
                            ? (splitRemainingCents / 100).toFixed(2)
                            : '0.00'
                        }
                        value={splitEntryAmountStr}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                          setSplitEntryAmountStr(e.target.value)
                          setSplitEntryError(null)
                        }}
                        className="flex-1 min-h-[48px] px-4 rounded-xl text-base bg-zinc-800 text-white border-2 border-zinc-600 focus:border-amber-400 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={handleAddSplitPayment}
                        className="min-h-[48px] px-5 rounded-xl text-sm font-semibold bg-zinc-700 hover:bg-zinc-600 text-white transition-colors border-2 border-zinc-600 hover:border-zinc-400"
                      >
                        Add
                      </button>
                    </div>

                    {splitEntryError !== null && (
                      <p className="text-sm text-red-400">{splitEntryError}</p>
                    )}
                  </div>
                )}

                {/* Summary when balance is covered + change info */}
                {splitTotalTenderedCents >= billTotalCents && splitPayments.length > 0 && (
                  <div className="bg-zinc-800/60 rounded-xl px-4 py-3 text-sm space-y-1">
                    <div className="flex justify-between text-zinc-400">
                      <span>Total tendered</span>
                      <span>{formatPrice(splitTotalTenderedCents, currencySymbol, roundBillTotals)}</span>
                    </div>
                    {splitChangeDueCents > 0 && (
                      <div className="flex justify-between text-amber-400 font-semibold">
                        <span>{splitHasCash ? 'Change due' : 'Tip / overpayment'}</span>
                        <span>{formatPrice(splitChangeDueCents, currencySymbol, roundBillTotals)}</span>
                      </div>
                    )}
                    <p className="text-xs text-zinc-500">
                      {splitPayments.map((p) => `${PAYMENT_METHOD_LABELS[p.method]} ${formatPrice(p.amountCents, currencySymbol, roundBillTotals)}`).join(' | ')}
                    </p>
                  </div>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={() => { void handleRecordPayment() }}
              disabled={paying || (!orderIsComp && splitTotalTenderedCents < billTotalCents)}
              className={[
                'w-full min-h-[48px] min-w-[48px] px-6 rounded-xl text-base font-semibold transition-colors',
                paying || (!orderIsComp && splitTotalTenderedCents < billTotalCents)
                  ? 'bg-zinc-700 text-zinc-400 cursor-not-allowed'
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

            {/* Add More Items — dine-in only (issue #394): void bill, reopen order, add items */}
            {orderType === 'dine_in' && (
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => { void handleReopenForItems() }}
                  disabled={reopeningForItems}
                  className={[
                    'w-full min-h-[48px] min-w-[48px] px-6 rounded-xl text-base font-semibold transition-colors border-2',
                    reopeningForItems
                      ? 'border-zinc-700 text-zinc-500 cursor-wait'
                      : 'border-violet-700 text-violet-400 hover:border-violet-500 hover:bg-violet-900/20',
                  ].join(' ')}
                >
                  {reopeningForItems ? 'Reopening…' : '+ Add More Items'}
                </button>
                {reopenForItemsError !== null && (
                  <p className="text-xs text-red-400">{reopenForItemsError}</p>
                )}
              </div>
            )}

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
          // ── Change / Tip screen (issue #391) ────────────────────────────────
          <div className="space-y-5">
            <h2 className="text-xl font-semibold text-white">{splitHasCash ? 'Change Due' : 'Tip / Overpayment'}</h2>
            <p className="text-4xl font-bold text-amber-400" data-testid="change-amount">
              {formatPrice(changeDueCents, currencySymbol)}
            </p>
            {/* Payment method breakdown — always shown for audit trail (issue #391) */}
            <div className="bg-zinc-800 rounded-xl p-4 space-y-2 text-base">
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Payment breakdown</p>
              {confirmedSplitPayments.map((p, idx) => (
                <div key={idx} className="flex justify-between">
                  <span className="text-zinc-300">{PAYMENT_METHOD_LABELS[p.method] ?? p.method}</span>
                  <span className="font-semibold text-white">{formatPrice(p.amountCents, currencySymbol, roundBillTotals)}</span>
                </div>
              ))}
              <div className="flex justify-between border-t border-zinc-700 pt-2 mt-1">
                <span className="text-zinc-400">Bill total</span>
                <span className="text-zinc-300">{formatPrice(billTotalCents, currencySymbol, roundBillTotals)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Total tendered</span>
                <span className="text-zinc-300">{formatPrice(splitTotalTenderedCents, currencySymbol, roundBillTotals)}</span>
              </div>
              {splitHasCash && (
                <div className="flex justify-between font-bold text-amber-400">
                  <span>Change to return</span>
                  <span>{formatPrice(changeDueCents, currencySymbol, roundBillTotals)}</span>
                </div>
              )}
              {!splitHasCash && (
                <div className="flex justify-between font-semibold text-blue-400">
                  <span>Tip / gratuity</span>
                  <span>{formatPrice(changeDueCents, currencySymbol, roundBillTotals)}</span>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => { setStep('success') }}
              className="w-full min-h-[48px] min-w-[48px] px-6 rounded-xl text-base font-semibold bg-amber-500 hover:bg-amber-400 text-zinc-900 transition-colors"
            >
              Done
            </button>
          </div>
        ) : (
          // ── Success / confirmation screen (issue #391) ───────────────────────
          <div className="space-y-5 text-center py-4">
            <div className="mb-2 text-green-400 flex justify-center"><CheckCircle2 size={64} aria-hidden="true" /></div>
            <h2 className="text-2xl font-bold text-green-400">Payment recorded — order closed</h2>
            {/* Payment breakdown card — audit trail for cashier / manager (issue #391) */}
            {confirmedSplitPayments.length > 0 && (
              <div className="bg-zinc-800 rounded-xl p-4 space-y-2 text-base text-left">
                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Payment breakdown</p>
                {confirmedSplitPayments.map((p, idx) => (
                  <div key={idx} className="flex justify-between">
                    <span className="text-zinc-300">{PAYMENT_METHOD_LABELS[p.method] ?? p.method}</span>
                    <span className="font-semibold text-white" data-testid={`payment-breakdown-${p.method}`}>{formatPrice(p.amountCents, currencySymbol, roundBillTotals)}</span>
                  </div>
                ))}
                <div className="flex justify-between border-t border-zinc-700 pt-2 mt-1">
                  <span className="text-zinc-400">Bill total</span>
                  <span className="font-bold text-green-400">{formatPrice(billTotalCents, currencySymbol, roundBillTotals)}</span>
                </div>
                {changeDueCents > 0 && (
                  <div className="flex justify-between font-semibold text-amber-400">
                    <span>Change given</span>
                    <span>{formatPrice(changeDueCents, currencySymbol, roundBillTotals)}</span>
                  </div>
                )}
              </div>
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

      {/* Error/rollback toast notifications */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </main>
  )
}
