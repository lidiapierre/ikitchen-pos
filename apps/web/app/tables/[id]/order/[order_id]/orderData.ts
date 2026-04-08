const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ''

export type CourseType = 'drinks' | 'starter' | 'main' | 'dessert'
export type CourseStatus = 'waiting' | 'fired' | 'served'

export interface OrderItem {
  id: string
  name: string
  quantity: number
  price_cents: number
  modifier_ids: string[]
  modifier_names: string[]
  sent_to_kitchen: boolean
  comp: boolean
  comp_reason: string | null
  seat: number | null
  course: CourseType
  course_status: CourseStatus
  /** ID of the menu this item belongs to (used for printer routing). */
  menuId: string | null
  /** Printer type derived from the menu's printer_type column. */
  printerType: 'kitchen' | 'cashier' | 'bar'
  /** Per-item discount type: 'percent' | 'fixed' | null */
  item_discount_type: 'percent' | 'fixed' | null
  /**
   * Per-item discount stored value:
   *   'percent' → percent * 100  (e.g. 10% = 1000)
   *   'fixed'   → amount in cents (e.g. ৳50 = 5000)
   */
  item_discount_value: number | null
  /** Free-text staff note for this item (e.g. "no onions", "extra spicy"). */
  notes: string | null
}

/**
 * Compute the discount amount in cents for a single order item.
 * Returns 0 when no item-level discount is set.
 */
export function calcItemDiscountCents(item: Pick<OrderItem, 'quantity' | 'price_cents' | 'item_discount_type' | 'item_discount_value'>): number {
  if (!item.item_discount_type || item.item_discount_value == null) return 0
  const grossCents = item.quantity * item.price_cents
  if (item.item_discount_type === 'percent') {
    // item_discount_value = percent * 100 (e.g. 1000 = 10%)
    return Math.round(grossCents * item.item_discount_value / 10000)
  }
  // fixed: item_discount_value = cents
  return Math.min(item.item_discount_value, grossCents)
}

export interface OrderSummary {
  status: string
  payment_method: string | null
  /** Order type — dine_in (default), takeaway, or delivery */
  order_type: 'dine_in' | 'takeaway' | 'delivery'
  /** Customer name for delivery orders */
  customer_name: string | null
  /** Delivery address/note for delivery orders */
  delivery_note: string | null
  /** Customer mobile number for delivery/takeaway orders (issue #261) */
  customer_mobile: string | null
  /** Sequential bill reference generated on close_order (issue #261) */
  bill_number: string | null
  /** Linked reservation ID for dine-in orders created via Seat action (issue #277) */
  reservation_id: string | null
  /** Linked customer UUID (issue #276) */
  customer_id: string | null
  /** Short sequential numeric order number, resets daily per restaurant (issue #349) */
  order_number: number | null
  /** Scheduled pickup or delivery time for takeaway/delivery orders (issue #352). ISO string or null. */
  scheduled_time: string | null
  /** Selected delivery zone UUID (issue #353). */
  delivery_zone_id: string | null
  /** Delivery zone name for display (issue #353). */
  delivery_zone_name: string | null
  /** Delivery charge in cents — snapshotted at order creation (issue #353). */
  delivery_charge: number
  /**
   * Merge label when this order is a primary in a table merge (issue #274).
   * E.g. "Table 3 + Table 4". Null when not merged.
   */
  merge_label: string | null
}

interface OrderItemRow {
  id: string
  quantity: number
  unit_price_cents: number
  modifier_ids: string[]
  sent_to_kitchen: boolean
  comp: boolean
  comp_reason: string | null
  seat: number | null
  course: CourseType
  course_status: CourseStatus
  item_discount_type: 'percent' | 'fixed' | null
  item_discount_value: number | null
  notes: string | null
  menu_items: { name: string; menu_id: string | null }
}

interface ModifierRow {
  id: string
  name: string
}

export async function fetchOrderItems(
  supabaseUrl: string,
  accessToken: string,
  orderId: string,
): Promise<OrderItem[]> {
  const url = new URL(`${supabaseUrl}/rest/v1/order_items`)
  url.searchParams.set('select', 'id,quantity,unit_price_cents,modifier_ids,sent_to_kitchen,comp,comp_reason,seat,course,course_status,item_discount_type,item_discount_value,notes,menu_items(name,menu_id)')
  url.searchParams.set('order_id', `eq.${orderId}`)
  url.searchParams.set('voided', 'eq.false')

  const res = await fetch(url.toString(), {
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Failed to fetch order items: ${res.status} ${res.statusText} — ${body}`)
  }

  const rows = (await res.json()) as OrderItemRow[]

  // Collect all unique modifier IDs across all items
  const allModifierIds = [...new Set(rows.flatMap((row) => row.modifier_ids ?? []))]

  // Fetch modifier names if any items have modifiers
  const modifierNameMap = new Map<string, string>()
  if (allModifierIds.length > 0) {
    try {
      const modUrl = new URL(`${supabaseUrl}/rest/v1/modifiers`)
      modUrl.searchParams.set('select', 'id,name')
      modUrl.searchParams.set('id', `in.(${allModifierIds.join(',')})`)

      const modRes = await fetch(modUrl.toString(), {
        headers: {
          apikey: publishableKey,
          Authorization: `Bearer ${accessToken}`,
        },
      })

      if (modRes.ok) {
        const mods = (await modRes.json()) as ModifierRow[]
        for (const mod of mods) {
          modifierNameMap.set(mod.id, mod.name)
        }
      }
    } catch {
      // Non-fatal: modifier names may not display but items will still show
    }
  }

  // Fetch printer_type for each unique menu referenced by items
  const menuPrinterTypeMap = new Map<string, 'kitchen' | 'cashier' | 'bar'>()
  const uniqueMenuIds = [...new Set(rows.map((r) => r.menu_items.menu_id).filter(Boolean))] as string[]
  if (uniqueMenuIds.length > 0) {
    try {
      const menuUrl = new URL(`${supabaseUrl}/rest/v1/menus`)
      menuUrl.searchParams.set('select', 'id,printer_type')
      menuUrl.searchParams.set('id', `in.(${uniqueMenuIds.join(',')})`)

      const menuRes = await fetch(menuUrl.toString(), {
        headers: {
          apikey: publishableKey,
          Authorization: `Bearer ${accessToken}`,
        },
      })

      if (menuRes.ok) {
        const menus = (await menuRes.json()) as Array<{ id: string; printer_type: string | null }>
        for (const m of menus) {
          const pt = m.printer_type as 'kitchen' | 'cashier' | 'bar' | null
          menuPrinterTypeMap.set(m.id, pt ?? 'kitchen')
        }
      }
    } catch {
      // Non-fatal: fall back to 'kitchen' for all items
    }
  }

  return rows.map((row) => {
    const ids = row.modifier_ids ?? []
    const menuId = row.menu_items.menu_id ?? null
    const printerType = (menuId ? menuPrinterTypeMap.get(menuId) : undefined) ?? 'kitchen'
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
      course: row.course ?? 'main',
      course_status: row.course_status ?? 'waiting',
      menuId,
      printerType,
      item_discount_type: row.item_discount_type ?? null,
      item_discount_value: row.item_discount_value ?? null,
      notes: row.notes ?? null,
    }
  })
}

export async function fetchOrderSummary(
  supabaseUrl: string,
  accessToken: string,
  orderId: string,
): Promise<OrderSummary> {
  const headers = {
    apikey: publishableKey,
    Authorization: `Bearer ${accessToken}`,
  }

  const orderUrl = new URL(`${supabaseUrl}/rest/v1/orders`)
  orderUrl.searchParams.set('id', `eq.${orderId}`)
  orderUrl.searchParams.set('select', 'status,order_type,customer_name,delivery_note,customer_mobile,bill_number,reservation_id,customer_id,order_number,scheduled_time,delivery_zone_id,delivery_charge,merge_label,delivery_zones(name)')

  const orderRes = await fetch(orderUrl.toString(), { headers })
  if (!orderRes.ok) {
    const body = await orderRes.text()
    throw new Error(`Failed to fetch order: ${orderRes.status} ${orderRes.statusText} — ${body}`)
  }

  const orders = (await orderRes.json()) as Array<{
    status: string
    order_type: string | null
    customer_name: string | null
    delivery_note: string | null
    customer_mobile: string | null
    bill_number: string | null
    reservation_id: string | null
    customer_id: string | null
    order_number: number | null
    scheduled_time: string | null
    delivery_zone_id: string | null
    delivery_charge: number | null
    merge_label: string | null
    delivery_zones: { name: string } | null
  }>
  if (orders.length === 0) {
    throw new Error('Order not found')
  }

  const { status } = orders[0]
  const orderType = (orders[0].order_type ?? 'dine_in') as 'dine_in' | 'takeaway' | 'delivery'
  const customerName = orders[0].customer_name ?? null
  const deliveryNote = orders[0].delivery_note ?? null
  const customerMobile = orders[0].customer_mobile ?? null
  const billNumber = orders[0].bill_number ?? null
  const reservationId = orders[0].reservation_id ?? null
  const customerId = orders[0].customer_id ?? null
  const orderNumber = orders[0].order_number ?? null
  const scheduledTime = orders[0].scheduled_time ?? null
  const deliveryZoneId = orders[0].delivery_zone_id ?? null
  const deliveryZoneName = orders[0].delivery_zones?.name ?? null
  const deliveryCharge = orders[0].delivery_charge ?? 0
  const mergeLabel = orders[0].merge_label ?? null

  if (status !== 'paid') {
    return {
      status,
      payment_method: null,
      order_type: orderType,
      customer_name: customerName,
      delivery_note: deliveryNote,
      customer_mobile: customerMobile,
      bill_number: billNumber,
      reservation_id: reservationId,
      customer_id: customerId,
      order_number: orderNumber,
      scheduled_time: scheduledTime,
      delivery_zone_id: deliveryZoneId,
      delivery_zone_name: deliveryZoneName,
      delivery_charge: deliveryCharge,
      merge_label: mergeLabel,
    }
  }

  const paymentUrl = new URL(`${supabaseUrl}/rest/v1/payments`)
  paymentUrl.searchParams.set('order_id', `eq.${orderId}`)
  paymentUrl.searchParams.set('select', 'method')
  paymentUrl.searchParams.set('limit', '1')

  const paymentRes = await fetch(paymentUrl.toString(), { headers })
  if (!paymentRes.ok) {
    return {
      status,
      payment_method: null,
      order_type: orderType,
      customer_name: customerName,
      delivery_note: deliveryNote,
      customer_mobile: customerMobile,
      bill_number: billNumber,
      reservation_id: reservationId,
      customer_id: customerId,
      order_number: orderNumber,
      scheduled_time: scheduledTime,
      delivery_zone_id: deliveryZoneId,
      delivery_zone_name: deliveryZoneName,
      delivery_charge: deliveryCharge,
      merge_label: mergeLabel,
    }
  }

  const payments = (await paymentRes.json()) as Array<{ method: string }>
  return {
    status,
    payment_method: payments.length > 0 ? payments[0].method : null,
    order_type: orderType,
    customer_name: customerName,
    delivery_note: deliveryNote,
    customer_mobile: customerMobile,
    bill_number: billNumber,
    reservation_id: reservationId,
    customer_id: customerId,
    order_number: orderNumber,
    scheduled_time: scheduledTime,
    delivery_zone_id: deliveryZoneId,
    delivery_zone_name: deliveryZoneName,
    delivery_charge: deliveryCharge,
    merge_label: mergeLabel,
  }
}
