/** get_shift_report — aggregated data for a printable shift close report. */

import { verifyAndGetCaller } from '../_shared/auth.ts'

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-demo-staff-id',
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OrderRow {
  id: string
  final_total_cents: number | null
  covers: number | null
  discount_amount_cents: number | null
  order_comp: boolean | null
  vat_cents: number | null
  service_charge_cents: number | null
}

interface PaymentRow {
  order_id: string
  method: string
  amount_cents: number
}

interface CompOrderRow {
  id: string
  order_items: Array<{
    quantity: number
    unit_price_cents: number
    voided: boolean
  }>
}

interface CompItemRow {
  quantity: number
  unit_price_cents: number
}

export interface ShiftReportData {
  from: string
  to: string
  total_orders: number
  total_covers: number
  avg_order_value_cents: number
  gross_sales_cents: number
  discounts_cents: number
  complimentary_cents: number
  net_sales_cents: number
  subtotal_excl_vat_cents: number
  vat_amount_cents: number
  total_incl_vat_cents: number
  cash_cents: number
  card_cents: number
  mobile_cents: number
  other_cents: number
  total_collected_cents: number
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function handler(
  req: Request,
  fetchFn: FetchFn = fetch,
  env: HandlerEnv | null = readEnv(),
): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  if (req.method === 'GET' && new URL(req.url).pathname.endsWith('/health')) {
    return new Response(
      JSON.stringify({ ok: true, function: 'get_shift_report' }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
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
  const from = payload['from'] as string | undefined
  const to = payload['to'] as string | undefined

  if (!from || !to) {
    return new Response(
      JSON.stringify({ success: false, error: 'from and to are required ISO datetime strings' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }

  const fromDate = new Date(from)
  const toDate = new Date(to)
  if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
    return new Response(
      JSON.stringify({ success: false, error: 'from and to must be valid ISO datetime strings' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }
  if (fromDate >= toDate) {
    return new Response(
      JSON.stringify({ success: false, error: '"from" must be before "to"' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }

  const { supabaseUrl, serviceKey } = env
  const dbHeaders = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  }

  const start = fromDate.toISOString()
  const end = toDate.toISOString()

  try {
    // 1. Fetch all paid orders in range
    const ordersRes = await fetchFn(
      `${supabaseUrl}/rest/v1/orders?select=id,final_total_cents,covers,discount_amount_cents,order_comp,vat_cents,service_charge_cents&status=eq.paid&created_at=gte.${encodeURIComponent(start)}&created_at=lte.${encodeURIComponent(end)}&limit=10000`,
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

    // 2. Compute orders summary
    let netSalesCents = 0
    let totalCovers = 0
    let totalDiscountsCents = 0
    let totalVatCents = 0
    const nonCompOrders = orders.filter(o => !o.order_comp)
    const payingOrders = orders.filter(o => !o.order_comp && (o.final_total_cents ?? 0) > 0)

    for (const o of orders) {
      netSalesCents += o.final_total_cents ?? 0
      totalCovers += o.covers ?? 0
    }
    for (const o of nonCompOrders) {
      totalDiscountsCents += o.discount_amount_cents ?? 0
      totalVatCents += o.vat_cents ?? 0
    }

    const totalOrders = orders.length
    // Avg order value over paying orders only (comp orders have final_total = 0)
    const avgOrderValueCents = payingOrders.length > 0
      ? Math.round(netSalesCents / payingOrders.length)
      : 0

    // 3. Complimentary value from whole-order comps
    let complimentaryCents = 0

    const compOrdersRes = await fetchFn(
      `${supabaseUrl}/rest/v1/orders?select=id,order_items(quantity,unit_price_cents,voided)&order_comp=eq.true&status=eq.paid&created_at=gte.${encodeURIComponent(start)}&created_at=lte.${encodeURIComponent(end)}&limit=1000`,
      { headers: dbHeaders },
    )
    if (!compOrdersRes.ok) {
      const errText = await compOrdersRes.text()
      return new Response(
        JSON.stringify({ success: false, error: `Failed to fetch comp orders: ${errText}` }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }
    const compOrders = (await compOrdersRes.json()) as CompOrderRow[]
    for (const co of compOrders) {
      for (const oi of co.order_items) {
        if (!oi.voided) {
          complimentaryCents += oi.quantity * oi.unit_price_cents
        }
      }
    }

    // 4. Item-level comps within non-comp orders
    if (nonCompOrders.length > 0) {
      const nonCompOrderIds = nonCompOrders.map(o => o.id)
      const compItemsRes = await fetchFn(
        `${supabaseUrl}/rest/v1/order_items?select=quantity,unit_price_cents&comp=eq.true&order_id=in.(${nonCompOrderIds.join(',')})&limit=10000`,
        { headers: dbHeaders },
      )
      if (!compItemsRes.ok) {
        const errText = await compItemsRes.text()
        return new Response(
          JSON.stringify({ success: false, error: `Failed to fetch comp items: ${errText}` }),
          { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
        )
      }
      const compItems = (await compItemsRes.json()) as CompItemRow[]
      for (const ci of compItems) {
        complimentaryCents += ci.quantity * ci.unit_price_cents
      }
    }

    // Gross = net + discounts + complimentary
    const grossSalesCents = netSalesCents + totalDiscountsCents + complimentaryCents

    // 5. VAT summary (net includes VAT; use stored vat_cents as authoritative)
    const subtotalExclVatCents = netSalesCents - totalVatCents
    const totalInclVatCents = netSalesCents

    // 6. Payment breakdown
    let cashCents = 0
    let cardCents = 0
    let mobileCents = 0
    let otherCents = 0

    if (orderIds.length > 0) {
      const paymentsRes = await fetchFn(
        `${supabaseUrl}/rest/v1/payments?select=order_id,method,amount_cents&order_id=in.(${orderIds.join(',')})&limit=50000`,
        { headers: dbHeaders },
      )
      if (!paymentsRes.ok) {
        const errText = await paymentsRes.text()
        return new Response(
          JSON.stringify({ success: false, error: `Failed to fetch payments: ${errText}` }),
          { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
        )
      }
      const payments = (await paymentsRes.json()) as PaymentRow[]
      for (const p of payments) {
        switch (p.method) {
          case 'cash':   cashCents   += p.amount_cents ?? 0; break
          case 'card':   cardCents   += p.amount_cents ?? 0; break
          case 'mobile': mobileCents += p.amount_cents ?? 0; break
          default:       otherCents  += p.amount_cents ?? 0; break
        }
      }
    }

    const totalCollectedCents = cashCents + cardCents + mobileCents + otherCents

    const data: ShiftReportData = {
      from: start,
      to: end,
      total_orders: totalOrders,
      total_covers: totalCovers,
      avg_order_value_cents: avgOrderValueCents,
      gross_sales_cents: grossSalesCents,
      discounts_cents: totalDiscountsCents,
      complimentary_cents: complimentaryCents,
      net_sales_cents: netSalesCents,
      subtotal_excl_vat_cents: subtotalExclVatCents,
      vat_amount_cents: totalVatCents,
      total_incl_vat_cents: totalInclVatCents,
      cash_cents: cashCents,
      card_cents: cardCents,
      mobile_cents: mobileCents,
      other_cents: otherCents,
      total_collected_cents: totalCollectedCents,
    }

    return new Response(
      JSON.stringify({ success: true, data }),
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
