/**
 * get_shift_report — Supabase Edge Function
 *
 * Returns aggregated data for a printable shift close report.
 * Accepts an explicit ISO datetime range (from/to), enabling local-midnight
 * precision rather than the UTC-date rounding used by get_reports.
 *
 * Auth: owner role required (same as get_reports).
 */

import { verifyAndGetCaller } from '../_shared/auth.ts'

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
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
  /** ISO datetime strings (UTC) for the queried range */
  from: string
  to: string

  /** Orders summary */
  total_orders: number
  total_covers: number
  avg_order_value_cents: number

  /** Sales breakdown (all in cents) */
  gross_sales_cents: number
  discounts_cents: number
  complimentary_cents: number
  net_sales_cents: number

  /** VAT summary (all in cents) */
  subtotal_excl_vat_cents: number
  vat_amount_cents: number
  total_incl_vat_cents: number

  /** Payment method breakdown (all in cents) */
  cash_cents: number
  card_cents: number
  mobile_cents: number
  other_cents: number
  total_collected_cents: number
}

interface RequestBody {
  from: string
  to: string
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

  // Validate that from/to are parseable as dates
  const fromDate = new Date(from)
  const toDate = new Date(to)
  if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
    return new Response(
      JSON.stringify({ success: false, error: 'from and to must be valid ISO datetime strings' }),
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
    // 1. Fetch all paid orders in range (include vat_cents)
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

    for (const o of orders) {
      netSalesCents += o.final_total_cents ?? 0
      totalCovers += o.covers ?? 0
    }
    for (const o of nonCompOrders) {
      totalDiscountsCents += o.discount_amount_cents ?? 0
      totalVatCents += o.vat_cents ?? 0
    }

    const totalOrders = orders.length
    const avgOrderValueCents = totalOrders > 0 ? Math.round(netSalesCents / totalOrders) : 0

    // 3. Complimentary value — sum of comp item values across all orders in range
    //    a) Whole-order comps: sum non-voided item values
    let complimentaryCents = 0

    const compOrdersRes = await fetchFn(
      `${supabaseUrl}/rest/v1/orders?select=id,order_items(quantity,unit_price_cents,voided)&order_comp=eq.true&status=eq.paid&created_at=gte.${encodeURIComponent(start)}&created_at=lte.${encodeURIComponent(end)}&limit=1000`,
      { headers: dbHeaders },
    )
    if (compOrdersRes.ok) {
      const compOrders = (await compOrdersRes.json()) as CompOrderRow[]
      for (const co of compOrders) {
        for (const oi of co.order_items) {
          if (!oi.voided) {
            complimentaryCents += oi.quantity * oi.unit_price_cents
          }
        }
      }
    }

    //    b) Item-level comps within non-comp orders
    if (orderIds.length > 0) {
      const nonCompOrderIds = nonCompOrders.map(o => o.id)
      if (nonCompOrderIds.length > 0) {
        const compItemsRes = await fetchFn(
          `${supabaseUrl}/rest/v1/order_items?select=quantity,unit_price_cents&comp=eq.true&order_id=in.(${nonCompOrderIds.join(',')})&limit=10000`,
          { headers: dbHeaders },
        )
        if (compItemsRes.ok) {
          const compItems = (await compItemsRes.json()) as CompItemRow[]
          for (const ci of compItems) {
            complimentaryCents += ci.quantity * ci.unit_price_cents
          }
        }
      }
    }

    // Gross sales = net sales + discounts + complimentary
    const grossSalesCents = netSalesCents + totalDiscountsCents + complimentaryCents

    // 4. VAT summary
    // net_sales includes VAT (final_total_cents is post-VAT for tax-exclusive, or includes VAT for inclusive)
    // Use stored vat_cents as the authoritative VAT figure
    const subtotalExclVatCents = netSalesCents - totalVatCents
    const totalInclVatCents = netSalesCents

    // 5. Payment breakdown
    let cashCents = 0
    let cardCents = 0
    let mobileCents = 0
    let otherCents = 0

    if (orderIds.length > 0) {
      const paymentsRes = await fetchFn(
        `${supabaseUrl}/rest/v1/payments?select=order_id,method,amount_cents&order_id=in.(${orderIds.join(',')})&limit=50000`,
        { headers: dbHeaders },
      )
      if (paymentsRes.ok) {
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
