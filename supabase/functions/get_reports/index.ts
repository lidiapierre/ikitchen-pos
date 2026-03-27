import { verifyAndGetCaller } from '../_shared/auth.ts'

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>

export interface HandlerEnv {
  supabaseUrl: string
  serviceKey: string
}

function readEnv(): HandlerEnv | null {
  const g = globalThis as { Deno?: { env: { get: (key: string) => string | undefined } } }
  if (!g.Deno) return null
  const supabaseUrl = g.Deno.env.get('SUPABASE_URL') ?? ''
  const serviceKey = g.Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!supabaseUrl || !serviceKey) return null
  return { supabaseUrl, serviceKey }
}

type Period = 'today' | 'week' | 'month' | 'custom'

interface RequestBody {
  period: Period
  from?: string
  to?: string
}

function getDateRange(period: Period, from?: string, to?: string): { start: string; end: string } {
  const now = new Date()
  // Use UTC dates for consistent filtering
  if (period === 'custom' && from && to) {
    // Expect ISO date strings like "2026-03-01"; treat as UTC start/end of day
    return {
      start: `${from}T00:00:00.000Z`,
      end: `${to}T23:59:59.999Z`,
    }
  }
  if (period === 'today') {
    const dateStr = now.toISOString().slice(0, 10)
    return {
      start: `${dateStr}T00:00:00.000Z`,
      end: `${dateStr}T23:59:59.999Z`,
    }
  }
  if (period === 'week') {
    const day = now.getUTCDay() // 0=Sun
    const diff = now.getUTCDate() - day + (day === 0 ? -6 : 1) // Monday
    const monday = new Date(now)
    monday.setUTCDate(diff)
    const start = monday.toISOString().slice(0, 10)
    const end = now.toISOString().slice(0, 10)
    return {
      start: `${start}T00:00:00.000Z`,
      end: `${end}T23:59:59.999Z`,
    }
  }
  // month
  const year = now.getUTCFullYear()
  const month = String(now.getUTCMonth() + 1).padStart(2, '0')
  const start = `${year}-${month}-01`
  const end = now.toISOString().slice(0, 10)
  return {
    start: `${start}T00:00:00.000Z`,
    end: `${end}T23:59:59.999Z`,
  }
}

interface OrderRow {
  id: string
  final_total_cents: number | null
  covers: number | null
  discount_amount_cents: number | null
  order_comp: boolean | null
  service_charge_cents: number | null
  created_at: string
}

interface PaymentRow {
  order_id: string
  method: string
  amount_cents: number
}

interface OrderItemRow {
  menu_item_id: string
  quantity: number
  unit_price_cents: number
  menu_items: { name: string } | null
}

interface CompItemRow {
  id: string
  menu_item_id: string
  quantity: number
  unit_price_cents: number
  comp_reason: string | null
  created_at: string
  menu_items: { name: string } | null
  orders: {
    id: string
    created_at: string
    status: string
  } | null
}

interface CompOrderRow {
  id: string
  order_comp_reason: string | null
  order_comp_by: string | null
  created_at: string
  order_items: Array<{
    id: string
    menu_item_id: string
    quantity: number
    unit_price_cents: number
    voided: boolean
    menu_items: { name: string } | null
  }>
}

interface UserRow {
  id: string
  name: string | null
  email: string
}

export async function handler(
  req: Request,
  fetchFn: FetchFn = fetch,
  env: HandlerEnv | null = readEnv(),
): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  if (!env) {
    return new Response(
      JSON.stringify({ success: false, error: 'Server configuration error' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }

  const caller = await verifyAndGetCaller(req, env.supabaseUrl, env.serviceKey, 'owner', fetchFn)
  if ('error' in caller) {
    return new Response(
      JSON.stringify({ success: false, error: caller.error }),
      { status: caller.status, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return new Response(
      JSON.stringify({ success: false, error: 'Invalid request body' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }

  const payload = body as Record<string, unknown>
  const period = payload['period'] as Period | undefined
  if (!period || !['today', 'week', 'month', 'custom'].includes(period)) {
    return new Response(
      JSON.stringify({ success: false, error: 'period must be one of: today, week, month, custom' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }
  if (period === 'custom') {
    if (typeof payload['from'] !== 'string' || typeof payload['to'] !== 'string') {
      return new Response(
        JSON.stringify({ success: false, error: 'from and to are required for custom period' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }
  }

  const { start, end } = getDateRange(period, payload['from'] as string | undefined, payload['to'] as string | undefined)

  const { supabaseUrl, serviceKey } = env
  const dbHeaders = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  }

  try {
    // Fetch all paid orders in range
    const ordersRes = await fetchFn(
      `${supabaseUrl}/rest/v1/orders?select=id,final_total_cents,covers,discount_amount_cents,order_comp,service_charge_cents,created_at&status=eq.paid&created_at=gte.${encodeURIComponent(start)}&created_at=lte.${encodeURIComponent(end)}&limit=10000`,
      { headers: dbHeaders },
    )
    if (!ordersRes.ok) {
      const errText = await ordersRes.text()
      return new Response(
        JSON.stringify({ success: false, error: `Failed to fetch orders: ${errText}` }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }
    const orders = (await ordersRes.json()) as OrderRow[]
    const orderIds = orders.map(o => o.id)

    // 1. Sales summary
    let totalRevenueCents = 0
    let totalCovers = 0
    let totalServiceChargeCents = 0
    for (const o of orders) {
      totalRevenueCents += o.final_total_cents ?? 0
      totalCovers += o.covers ?? 0
      totalServiceChargeCents += o.service_charge_cents ?? 0
    }
    const orderCount = orders.length
    const avgOrderCents = orderCount > 0 ? Math.round(totalRevenueCents / orderCount) : 0

    // 2. Revenue by day
    const revenueByDayMap: Record<string, { revenue_cents: number; order_count: number }> = {}
    for (const o of orders) {
      const date = o.created_at.slice(0, 10)
      if (!revenueByDayMap[date]) revenueByDayMap[date] = { revenue_cents: 0, order_count: 0 }
      revenueByDayMap[date].revenue_cents += o.final_total_cents ?? 0
      revenueByDayMap[date].order_count += 1
    }
    const revenueByDay = Object.entries(revenueByDayMap)
      .map(([date, v]) => ({ date, revenue_cents: v.revenue_cents, order_count: v.order_count }))
      .sort((a, b) => a.date.localeCompare(b.date))

    // 3. Payment method breakdown — from the payments table (method stored there, not on orders)
    let paymentBreakdown: Array<{ method: string; count: number; revenue_cents: number }> = []
    if (orderIds.length > 0) {
      const paymentsRes = await fetchFn(
        `${supabaseUrl}/rest/v1/payments?select=order_id,method,amount_cents&order_id=in.(${orderIds.join(',')})&limit=50000`,
        { headers: dbHeaders },
      )
      if (paymentsRes.ok) {
        const payments = (await paymentsRes.json()) as PaymentRow[]
        const paymentMap: Record<string, { count: number; revenue_cents: number }> = {}
        for (const p of payments) {
          const method = p.method ?? 'unknown'
          if (!paymentMap[method]) paymentMap[method] = { count: 0, revenue_cents: 0 }
          paymentMap[method].count += 1
          paymentMap[method].revenue_cents += p.amount_cents ?? 0
        }
        paymentBreakdown = Object.entries(paymentMap).map(([method, v]) => ({
          method,
          count: v.count,
          revenue_cents: v.revenue_cents,
        }))
      }
    }

    // 4. Discount/comp summary
    let discountOrderCount = 0
    let totalDiscountCents = 0
    let compOrderCount = 0
    for (const o of orders) {
      if (o.order_comp === true) {
        compOrderCount += 1
      }
      if ((o.discount_amount_cents ?? 0) > 0) {
        discountOrderCount += 1
        totalDiscountCents += o.discount_amount_cents ?? 0
      }
    }

    // 5. Top items — fetch order_items for paid orders in range via join
    // Use a separate query with date range on the orders table via join
    const itemsRes = await fetchFn(
      `${supabaseUrl}/rest/v1/order_items?select=menu_item_id,quantity,unit_price_cents,menu_items(name),orders!inner(status,created_at)&orders.status=eq.paid&orders.created_at=gte.${encodeURIComponent(start)}&orders.created_at=lte.${encodeURIComponent(end)}&limit=50000`,
      { headers: dbHeaders },
    )

    let topItems: Array<{ name: string; quantity_sold: number; revenue_cents: number }> = []
    if (itemsRes.ok) {
      const rawItems = (await itemsRes.json()) as Array<OrderItemRow & { orders?: unknown }>
      const itemMap: Record<string, { name: string; quantity: number; revenue: number }> = {}
      for (const item of rawItems) {
        const id = item.menu_item_id
        const name = (item.menu_items && 'name' in item.menu_items) ? (item.menu_items as { name: string }).name : id
        if (!itemMap[id]) itemMap[id] = { name, quantity: 0, revenue: 0 }
        itemMap[id].quantity += item.quantity
        itemMap[id].revenue += item.quantity * item.unit_price_cents
      }
      topItems = Object.values(itemMap)
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 10)
        .map(i => ({ name: i.name, quantity_sold: i.quantity, revenue_cents: i.revenue }))
    }

    // 6. Comp item detail — item-level comps
    const compItemsRes = await fetchFn(
      `${supabaseUrl}/rest/v1/order_items?select=id,menu_item_id,quantity,unit_price_cents,comp_reason,created_at,menu_items(name),orders!inner(id,created_at,status)&comp=eq.true&orders.status=eq.paid&orders.created_at=gte.${encodeURIComponent(start)}&orders.created_at=lte.${encodeURIComponent(end)}&limit=10000`,
      { headers: dbHeaders },
    )

    // 7. Comp item detail — order-level comps
    const compOrdersRes = await fetchFn(
      `${supabaseUrl}/rest/v1/orders?select=id,order_comp_reason,order_comp_by,created_at,order_items(id,menu_item_id,quantity,unit_price_cents,voided,menu_items(name))&order_comp=eq.true&status=eq.paid&created_at=gte.${encodeURIComponent(start)}&created_at=lte.${encodeURIComponent(end)}&limit=1000`,
      { headers: dbHeaders },
    )

    // Collect all user IDs that authorised order-level comps
    type CompDetailItem = {
      type: 'item' | 'order'
      item_name: string
      quantity: number
      unit_price_cents: number
      total_value_cents: number
      reason: string | null
      authorised_by: string | null
      date: string
    }

    const compItems: CompDetailItem[] = []
    const compByItemMap: Record<string, { item_name: string; quantity: number; total_value_cents: number; count: number }> = {}
    let totalCompValueCents = 0
    let compItemValueCents = 0
    let compOrderValueCents = 0

    // Process item-level comps
    if (compItemsRes.ok) {
      const rawCompItems = (await compItemsRes.json()) as CompItemRow[]
      for (const ci of rawCompItems) {
        const itemName = ci.menu_items?.name ?? ci.menu_item_id
        const totalVal = ci.quantity * ci.unit_price_cents
        compItemValueCents += totalVal
        totalCompValueCents += totalVal

        const orderDate = (ci.orders as { created_at: string } | null)?.created_at ?? ci.created_at

        compItems.push({
          type: 'item',
          item_name: itemName,
          quantity: ci.quantity,
          unit_price_cents: ci.unit_price_cents,
          total_value_cents: totalVal,
          reason: ci.comp_reason,
          authorised_by: null, // item-level comps don't store who did it
          date: orderDate,
        })

        // Aggregate by item
        if (!compByItemMap[itemName]) {
          compByItemMap[itemName] = { item_name: itemName, quantity: 0, total_value_cents: 0, count: 0 }
        }
        compByItemMap[itemName].quantity += ci.quantity
        compByItemMap[itemName].total_value_cents += totalVal
        compByItemMap[itemName].count += 1
      }
    }

    // Process order-level comps; resolve authorised_by names
    const authorisedByIds: string[] = []
    let compOrderRows: CompOrderRow[] = []
    if (compOrdersRes.ok) {
      compOrderRows = (await compOrdersRes.json()) as CompOrderRow[]
      for (const co of compOrderRows) {
        if (co.order_comp_by && !authorisedByIds.includes(co.order_comp_by)) {
          authorisedByIds.push(co.order_comp_by)
        }
      }
    }

    // Fetch user names for authorised_by IDs
    const userNameMap: Record<string, string> = {}
    if (authorisedByIds.length > 0) {
      const usersRes = await fetchFn(
        `${supabaseUrl}/rest/v1/users?select=id,name,email&id=in.(${authorisedByIds.join(',')})`,
        { headers: dbHeaders },
      )
      if (usersRes.ok) {
        const users = (await usersRes.json()) as UserRow[]
        for (const u of users) {
          userNameMap[u.id] = u.name ?? u.email
        }
      }
    }

    // Build comp detail for order-level comps
    for (const co of compOrderRows) {
      const authorisedBy = co.order_comp_by ? (userNameMap[co.order_comp_by] ?? co.order_comp_by) : null
      const nonVoidedItems = co.order_items.filter(oi => !oi.voided)

      for (const oi of nonVoidedItems) {
        const itemName = oi.menu_items?.name ?? oi.menu_item_id
        const totalVal = oi.quantity * oi.unit_price_cents
        compOrderValueCents += totalVal
        totalCompValueCents += totalVal

        compItems.push({
          type: 'order',
          item_name: itemName,
          quantity: oi.quantity,
          unit_price_cents: oi.unit_price_cents,
          total_value_cents: totalVal,
          reason: co.order_comp_reason,
          authorised_by: authorisedBy,
          date: co.created_at,
        })

        // Aggregate by item
        if (!compByItemMap[itemName]) {
          compByItemMap[itemName] = { item_name: itemName, quantity: 0, total_value_cents: 0, count: 0 }
        }
        compByItemMap[itemName].quantity += oi.quantity
        compByItemMap[itemName].total_value_cents += totalVal
        compByItemMap[itemName].count += 1
      }
    }

    // Sort comp items by date descending
    compItems.sort((a, b) => b.date.localeCompare(a.date))

    // Top comped items by total value
    const topCompedItems = Object.values(compByItemMap)
      .sort((a, b) => b.total_value_cents - a.total_value_cents)
      .slice(0, 10)

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          summary: {
            total_revenue_cents: totalRevenueCents,
            order_count: orderCount,
            avg_order_cents: avgOrderCents,
            total_covers: totalCovers,
            total_service_charge_cents: totalServiceChargeCents,
          },
          revenue_by_day: revenueByDay,
          top_items: topItems,
          payment_breakdown: paymentBreakdown,
          discount_summary: {
            discount_order_count: discountOrderCount,
            total_discount_cents: totalDiscountCents,
            comp_order_count: compOrderCount,
          },
          comp_detail: {
            items: compItems,
            total_comp_value_cents: totalCompValueCents,
            comp_item_value_cents: compItemValueCents,
            comp_order_value_cents: compOrderValueCents,
            top_comped_items: topCompedItems,
          },
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }
}

if (typeof (globalThis as { Deno?: unknown }).Deno !== 'undefined') {
  const g = globalThis as { Deno: { serve: (h: (req: Request) => Promise<Response>) => void } }
  g.Deno.serve((req: Request) => handler(req))
}
