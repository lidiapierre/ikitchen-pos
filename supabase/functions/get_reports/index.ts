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
      `${supabaseUrl}/rest/v1/orders?select=id,final_total_cents,covers,discount_amount_cents,order_comp,created_at&status=eq.paid&created_at=gte.${encodeURIComponent(start)}&created_at=lte.${encodeURIComponent(end)}&limit=10000`,
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
    for (const o of orders) {
      totalRevenueCents += o.final_total_cents ?? 0
      totalCovers += o.covers ?? 0
    }
    const orderCount = orders.length
    const avgOrderCents = orderCount > 0 ? Math.round(totalRevenueCents / orderCount) : 0

    // 2. Revenue by day
    const revenueByDayMap: Record<string, number> = {}
    for (const o of orders) {
      const date = o.created_at.slice(0, 10)
      revenueByDayMap[date] = (revenueByDayMap[date] ?? 0) + (o.final_total_cents ?? 0)
    }
    const revenueByDay = Object.entries(revenueByDayMap)
      .map(([date, revenue_cents]) => ({ date, revenue_cents }))
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

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          summary: {
            total_revenue_cents: totalRevenueCents,
            order_count: orderCount,
            avg_order_cents: avgOrderCents,
            total_covers: totalCovers,
          },
          revenue_by_day: revenueByDay,
          top_items: topItems,
          payment_breakdown: paymentBreakdown,
          discount_summary: {
            discount_order_count: discountOrderCount,
            total_discount_cents: totalDiscountCents,
            comp_order_count: compOrderCount,
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
