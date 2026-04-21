/**
 * Bill History API — direct PostgREST queries for receipt lookup.
 * Issue #395 — staff and admin receipt history + re-print.
 *
 * Uses the publishable key for read queries; RLS (restaurant_isolation policy)
 * ensures users only see their own restaurant's data.
 */

import type { PaymentMethod } from '@/lib/paymentMethods'
import { PAYMENT_METHOD_LABELS } from '@/lib/paymentMethods'
import type { OrderItem } from '@/app/tables/[id]/order/[order_id]/orderData'

const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ''

export interface PaymentEntry {
  method: PaymentMethod
  amount_cents: number
  tendered_amount_cents: number | null
}

export interface BillHistoryOrder {
  id: string
  bill_number: string | null
  order_number: number | null
  created_at: string
  table_label: string | null
  order_type: 'dine_in' | 'takeaway' | 'delivery'
  final_total_cents: number
  discount_amount_cents: number
  order_comp: boolean
  server_name: string | null
  server_id: string | null
  payments: PaymentEntry[]
  /** Convenience: comma-separated payment method labels for display */
  payment_summary: string
  /** True when multiple payment methods were used */
  is_split: boolean
  customer_name: string | null
  customer_mobile: string | null
  delivery_note: string | null
  delivery_charge: number
  delivery_zone_name: string | null
  service_charge_cents: number
  /** VAT amount in cents — computed by close_order from vat_rates (issue #146 fix). */
  vat_cents: number
}

export interface BillHistoryResult {
  orders: BillHistoryOrder[]
  total_daily_cents: number
  /**
   * True when the result was capped at `limit`.
   * The daily total will be incomplete when true — display a warning in the UI.
   */
  truncated: boolean
}

export interface FetchBillHistoryParams {
  supabaseUrl: string
  accessToken: string
  /** ISO date string YYYY-MM-DD — for staff shift filter or admin date filter */
  date?: string
  /** Admin range: from YYYY-MM-DD (inclusive) */
  from?: string
  /** Admin range: to YYYY-MM-DD (inclusive) */
  to?: string
  /** Filter by server_id (for staff self-view or admin filter) */
  serverId?: string
  /** Filter by table_id (admin only) */
  tableId?: string
  /** Optional restaurant_id override (for multi-location) */
  restaurantId?: string
  /** Max results (default 100) */
  limit?: number
}

interface RawOrderRow {
  id: string
  bill_number: string | null
  order_number: number | null
  created_at: string
  final_total_cents: number | null
  discount_amount_cents: number | null
  order_comp: boolean | null
  order_type: string | null
  server_id: string | null
  customer_name: string | null
  customer_mobile: string | null
  delivery_note: string | null
  delivery_charge: number | null
  service_charge_cents: number | null
  vat_cents: number | null
  tables: { label: string } | null
  delivery_zones: { name: string } | null
  payments: Array<{
    method: string
    amount_cents: number
    tendered_amount_cents: number | null
  }>
}

interface UserNameRow {
  id: string
  name: string | null
  email: string
}

/**
 * Fetch bill history from the database.
 * Queries the orders table directly via PostgREST with embedded payments + table joins.
 */
export async function fetchBillHistory(
  params: FetchBillHistoryParams,
): Promise<BillHistoryResult> {
  const { supabaseUrl, accessToken, date, from, to, serverId, tableId, limit = 100 } = params

  const url = new URL(`${supabaseUrl}/rest/v1/orders`)
  url.searchParams.set(
    'select',
    'id,bill_number,order_number,created_at,final_total_cents,discount_amount_cents,order_comp,order_type,server_id,customer_name,customer_mobile,delivery_note,delivery_charge,service_charge_cents,vat_cents,tables!orders_table_id_fkey(label),delivery_zones(name),payments(method,amount_cents,tendered_amount_cents)',
  )
  url.searchParams.set('status', 'eq.paid')

  /**
   * Build UTC timestamps from a local YYYY-MM-DD date string.
   * Uses the browser's local timezone so orders placed after local midnight
   * but before UTC midnight are included correctly (e.g. UTC+6 restaurants).
   * `new Date('YYYY-MM-DDT00:00:00')` (no Z) parses in local time.
   */
  function localDayRange(d: string): { start: string; end: string } {
    return {
      start: new Date(`${d}T00:00:00`).toISOString(),
      end: new Date(`${d}T23:59:59.999`).toISOString(),
    }
  }

  // Date range filter
  if (date) {
    const { start, end } = localDayRange(date)
    url.searchParams.set('created_at', `gte.${start}`)
    url.searchParams.append('created_at', `lte.${end}`)
  } else if (from && to) {
    const { start } = localDayRange(from)
    const { end } = localDayRange(to)
    url.searchParams.set('created_at', `gte.${start}`)
    url.searchParams.append('created_at', `lte.${end}`)
  } else {
    // Default: today (local)
    const today = new Date().toLocaleDateString('en-CA') // YYYY-MM-DD in local TZ
    const { start, end } = localDayRange(today)
    url.searchParams.set('created_at', `gte.${start}`)
    url.searchParams.append('created_at', `lte.${end}`)
  }

  // HUMAN REVIEW REQUIRED — RLS note:
  // The restaurant_isolation policy scopes reads by restaurant_id only.
  // Staff self-view is enforced by the client-side serverId filter below.
  // A staff member with direct PostgREST access could bypass this filter and
  // read all orders for the restaurant. If stricter enforcement is required,
  // add a server_id = auth.uid() RLS condition for non-owner/manager roles.
  if (serverId) {
    url.searchParams.set('server_id', `eq.${serverId}`)
  }
  if (tableId) {
    url.searchParams.set('table_id', `eq.${tableId}`)
  }

  url.searchParams.set('order', 'created_at.desc')
  url.searchParams.set('limit', String(limit))

  const headers: Record<string, string> = {
    apikey: publishableKey,
    Authorization: `Bearer ${accessToken}`,
  }

  const res = await fetch(url.toString(), { headers })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Failed to fetch bill history: ${res.status} ${res.statusText} — ${body}`)
  }

  const rows = (await res.json()) as RawOrderRow[]

  // Collect unique server IDs to resolve names
  const serverIds = [...new Set(rows.map((r) => r.server_id).filter(Boolean))] as string[]
  const serverNameMap = new Map<string, string>()

  if (serverIds.length > 0) {
    try {
      const userUrl = new URL(`${supabaseUrl}/rest/v1/users`)
      userUrl.searchParams.set('select', 'id,name,email')
      userUrl.searchParams.set('id', `in.(${serverIds.join(',')})`)
      const userRes = await fetch(userUrl.toString(), { headers })
      if (userRes.ok) {
        const users = (await userRes.json()) as UserNameRow[]
        for (const u of users) {
          serverNameMap.set(u.id, u.name ?? u.email)
        }
      }
    } catch {
      // Non-fatal: server names won't display
    }
  }

  const truncated = rows.length === limit
  let totalDailyCents = 0

  const orders: BillHistoryOrder[] = rows.map((row) => {
    // Compute the true bill total for daily totals and display:
    //   (items_subtotal - discount + service_charge + vat_cents) + delivery
    // final_total_cents = items subtotal (per-item discounts applied, before order discount).
    // For orders closed before the vat_cents fix, vat_cents defaults to 0.
    const rawSubtotal = row.final_total_cents ?? 0
    const discount = row.discount_amount_cents ?? 0
    const sc = row.service_charge_cents ?? 0
    const vat = row.vat_cents ?? 0
    const delivery = row.delivery_charge ?? 0
    const orderTypeStr = row.order_type ?? 'dine_in'
    const deliveryForTotal = orderTypeStr === 'delivery' ? delivery : 0
    const finalTotal = (row.order_comp ?? false)
      ? 0
      : (rawSubtotal - discount) + sc + vat + deliveryForTotal
    totalDailyCents += finalTotal

    const payments: PaymentEntry[] = (row.payments ?? []).map((p) => ({
      method: p.method as PaymentMethod,
      amount_cents: p.amount_cents,
      tendered_amount_cents: p.tendered_amount_cents,
    }))

    const uniqueMethods = [...new Set(payments.map((p) => p.method))]
    const paymentSummary = uniqueMethods.map((m) => PAYMENT_METHOD_LABELS[m] ?? m).join(' + ')

    return {
      id: row.id,
      bill_number: row.bill_number,
      order_number: row.order_number,
      created_at: row.created_at,
      // Fallback depends on order type — delivery orders have no table
      table_label: row.tables?.label ?? null,
      order_type: (row.order_type ?? 'dine_in') as BillHistoryOrder['order_type'],
      final_total_cents: finalTotal,
      discount_amount_cents: row.discount_amount_cents ?? 0,
      order_comp: row.order_comp ?? false,
      server_id: row.server_id,
      server_name: row.server_id ? (serverNameMap.get(row.server_id) ?? null) : null,
      payments,
      payment_summary: paymentSummary || '—',
      is_split: uniqueMethods.length > 1,
      customer_name: row.customer_name,
      customer_mobile: row.customer_mobile,
      delivery_note: row.delivery_note,
      delivery_charge: row.delivery_charge ?? 0,
      delivery_zone_name: row.delivery_zones?.name ?? null,
      service_charge_cents: row.service_charge_cents ?? 0,
      vat_cents: row.vat_cents ?? 0,
    }
  })

  return { orders, total_daily_cents: totalDailyCents, truncated }
}

export interface ReprintOrderData {
  items: OrderItem[]
  tableLabel: string
  orderType: 'dine_in' | 'takeaway' | 'delivery'
  billNumber: string | null
  orderNumber: number | null
  /** Items subtotal after per-item discounts, before order-level discount. */
  rawSubtotalCents: number
  /** Order-level discount in cents. */
  discountAmountCents: number
  /** True bill total: (rawSubtotal - discount + SC + VAT) + delivery. Used as totalCents in BillPrintView. */
  finalTotalCents: number
  orderComp: boolean
  customerName: string | null
  customerMobile: string | null
  deliveryNote: string | null
  deliveryCharge: number
  deliveryZoneName: string | null
  serviceChargeCents: number
  /** VAT amount in cents — stored by close_order (issue #146 fix). */
  vatCents: number
  payments: PaymentEntry[]
  createdAt: string
}

interface ReprintOrderItemRow {
  id: string
  quantity: number
  unit_price_cents: number
  modifier_ids: string[]
  sent_to_kitchen: boolean
  comp: boolean
  comp_reason: string | null
  seat: number | null
  course: string
  course_status: string
  item_discount_type: 'percent' | 'fixed' | null
  item_discount_value: number | null
  notes: string | null
  menu_items: { name: string; menu_id: string | null }
}

/**
 * Fetch full order data needed to re-print a receipt.
 * Queries order_items, payments, and tables on demand (lazy — only called when user clicks re-print).
 */
export async function fetchOrderForReprint(
  supabaseUrl: string,
  accessToken: string,
  orderId: string,
): Promise<ReprintOrderData> {
  const headers: Record<string, string> = {
    apikey: publishableKey,
    Authorization: `Bearer ${accessToken}`,
  }

  // Fetch order details + items + payments in parallel
  const [orderRes, itemsRes, paymentsRes] = await Promise.all([
    fetch(
      `${supabaseUrl}/rest/v1/orders?id=eq.${orderId}&select=bill_number,order_number,created_at,final_total_cents,discount_amount_cents,order_comp,order_type,customer_name,customer_mobile,delivery_note,delivery_charge,service_charge_cents,vat_cents,tables!orders_table_id_fkey(label),delivery_zones(name)`,
      { headers },
    ),
    fetch(
      `${supabaseUrl}/rest/v1/order_items?order_id=eq.${orderId}&voided=eq.false&select=id,quantity,unit_price_cents,modifier_ids,sent_to_kitchen,comp,comp_reason,seat,course,course_status,item_discount_type,item_discount_value,notes,menu_items(name,menu_id)`,
      { headers },
    ),
    fetch(
      `${supabaseUrl}/rest/v1/payments?order_id=eq.${orderId}&select=method,amount_cents,tendered_amount_cents`,
      { headers },
    ),
  ])

  if (!orderRes.ok) {
    throw new Error(`Failed to fetch order: ${orderRes.status}`)
  }
  if (!itemsRes.ok) {
    throw new Error(`Failed to fetch order items: ${itemsRes.status}`)
  }
  if (!paymentsRes.ok) {
    throw new Error(`Failed to fetch payments: ${paymentsRes.status}`)
  }

  const [orderRows, itemRows, paymentRows] = await Promise.all([
    orderRes.json() as Promise<
      Array<{
        bill_number: string | null
        order_number: number | null
        created_at: string
        final_total_cents: number | null
        discount_amount_cents: number | null
        order_comp: boolean | null
        order_type: string | null
        customer_name: string | null
        customer_mobile: string | null
        delivery_note: string | null
        delivery_charge: number | null
        service_charge_cents: number | null
        vat_cents: number | null
        tables: { label: string } | null
        delivery_zones: { name: string } | null
      }>
    >,
    itemsRes.json() as Promise<ReprintOrderItemRow[]>,
    paymentsRes.json() as Promise<
      Array<{ method: string; amount_cents: number; tendered_amount_cents: number | null }>
    >,
  ])

  if (orderRows.length === 0) {
    throw new Error('Order not found')
  }

  const order = orderRows[0]

  // Resolve modifier names
  const allModifierIds = [...new Set(itemRows.flatMap((r) => r.modifier_ids ?? []))]
  const modifierNameMap = new Map<string, string>()
  if (allModifierIds.length > 0) {
    try {
      const modRes = await fetch(
        `${supabaseUrl}/rest/v1/modifiers?id=in.(${allModifierIds.join(',')})&select=id,name`,
        { headers },
      )
      if (modRes.ok) {
        const mods = (await modRes.json()) as Array<{ id: string; name: string }>
        for (const m of mods) modifierNameMap.set(m.id, m.name)
      }
    } catch {
      // Non-fatal
    }
  }

  const items: OrderItem[] = itemRows.map((row) => {
    const ids = row.modifier_ids ?? []
    return {
      id: row.id,
      name: row.menu_items.name,
      quantity: row.quantity,
      price_cents: row.unit_price_cents,
      modifier_ids: ids,
      modifier_names: ids.map((id) => modifierNameMap.get(id) ?? id),
      sent_to_kitchen: row.sent_to_kitchen,
      comp: row.comp ?? false,
      comp_reason: row.comp_reason ?? null,
      seat: row.seat ?? null,
      course: (row.course ?? 'main') as OrderItem['course'],
      course_status: (row.course_status ?? 'waiting') as OrderItem['course_status'],
      menuId: row.menu_items.menu_id ?? null,
      printerType: 'cashier',
      item_discount_type: row.item_discount_type ?? null,
      item_discount_value: row.item_discount_value ?? null,
      notes: row.notes ?? null,
    }
  })

  const payments: PaymentEntry[] = paymentRows.map((p) => ({
    method: p.method as PaymentMethod,
    amount_cents: p.amount_cents,
    tendered_amount_cents: p.tendered_amount_cents,
  }))

  const orderType = (order.order_type ?? 'dine_in') as ReprintOrderData['orderType']
  const rawSubtotalCents = order.final_total_cents ?? 0
  const discountAmountCents = order.discount_amount_cents ?? 0
  const serviceChargeCents = order.service_charge_cents ?? 0
  const vatCents = order.vat_cents ?? 0
  const deliveryCharge = order.delivery_charge ?? 0
  const orderComp = order.order_comp ?? false
  const deliveryForTotal = orderType === 'delivery' ? deliveryCharge : 0
  // True bill total: (items_subtotal - order_discount + SC + VAT) + delivery
  // Mirrors close_order / record_payment computation order.
  const finalTotalCents = orderComp
    ? 0
    : (rawSubtotalCents - discountAmountCents) + serviceChargeCents + vatCents + deliveryForTotal

  return {
    items,
    // Use type-appropriate fallback: delivery orders have no table
    tableLabel: order.tables?.label ?? (orderType === 'delivery' ? 'Delivery' : 'Takeaway'),
    orderType,
    billNumber: order.bill_number,
    orderNumber: order.order_number,
    rawSubtotalCents,
    discountAmountCents,
    finalTotalCents,
    orderComp,
    customerName: order.customer_name,
    customerMobile: order.customer_mobile,
    deliveryNote: order.delivery_note,
    deliveryCharge,
    deliveryZoneName: order.delivery_zones?.name ?? null,
    serviceChargeCents,
    vatCents,
    payments,
    createdAt: order.created_at,
  }
}

export interface RestaurantConfig {
  restaurantName: string
  restaurantAddress: string
  binNumber: string | undefined
  registerName: string | undefined
  locationName: string | undefined
  vatPercent: number
  taxInclusive: boolean
  /** Service charge rate in percent (e.g. 10 for 10%). 0 = not configured. */
  serviceChargePercent: number
  currencySymbol: string
  roundBillTotals: boolean
  /** Base font size in pt for bill printing (configurable via admin settings). Default: 12. */
  billPrintFontSizePt: number
}

/**
 * Fetch restaurant configuration needed for receipt re-printing.
 */
export async function fetchRestaurantConfig(
  supabaseUrl: string,
  accessToken: string,
): Promise<RestaurantConfig> {
  const headers: Record<string, string> = {
    apikey: publishableKey,
    Authorization: `Bearer ${accessToken}`,
  }

  const [configRes, vatRes, restaurantRes] = await Promise.all([
    fetch(
      `${supabaseUrl}/rest/v1/config?key=in.(bin_number,register_name,restaurant_address,round_bill_totals,currency_symbol,service_charge_percent,bill_print_font_size,restaurant_name)&select=key,value`,
      { headers },
    ),
    fetch(
      `${supabaseUrl}/rest/v1/vat_rates?select=rate,tax_inclusive&limit=1`,
      { headers },
    ),
    fetch(
      `${supabaseUrl}/rest/v1/restaurants?select=name&limit=1`,
      { headers },
    ),
  ])

  const cfgMap = new Map<string, string>()
  if (configRes.ok) {
    const rows = (await configRes.json()) as Array<{ key: string; value: string }>
    for (const r of rows) cfgMap.set(r.key, r.value)
  }

  let vatPercent = 0
  let taxInclusive = false
  if (vatRes.ok) {
    const vatRows = (await vatRes.json()) as Array<{ rate: number; tax_inclusive: boolean }>
    if (vatRows.length > 0) {
      vatPercent = vatRows[0].rate ?? 0
      taxInclusive = vatRows[0].tax_inclusive ?? false
    }
  }

  let restaurantName = ''
  if (restaurantRes.ok) {
    const restRows = (await restaurantRes.json()) as Array<{ name: string }>
    if (restRows.length > 0) restaurantName = restRows[0].name
  }
  // Prefer config-overridden name over restaurants.name (consistent with OrderDetailClient)
  const cfgRestaurantName = cfgMap.get('restaurant_name')
  if (cfgRestaurantName) restaurantName = cfgRestaurantName

  return {
    restaurantName: restaurantName || '',
    restaurantAddress: cfgMap.get('restaurant_address') ?? '',
    binNumber: cfgMap.get('bin_number'),
    registerName: cfgMap.get('register_name'),
    locationName: undefined,
    vatPercent,
    taxInclusive,
    serviceChargePercent: parseFloat(cfgMap.get('service_charge_percent') ?? '0') || 0,
    currencySymbol: cfgMap.get('currency_symbol') ?? '৳',
    roundBillTotals: cfgMap.get('round_bill_totals') === 'true',
    billPrintFontSizePt: parseInt(cfgMap.get('bill_print_font_size') ?? '12', 10) || 12,
  }
}
