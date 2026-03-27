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
  if (period === 'custom' && from && to) {
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
    const day = now.getUTCDay()
    const diff = now.getUTCDate() - day + (day === 0 ? -6 : 1)
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
  table_id: string | null
  created_at: string
  final_total_cents: number | null
  discount_amount_cents: number | null
  order_comp: boolean | null
}

interface TableRow {
  id: string
  label: string
}

interface PaymentRow {
  order_id: string
  method: string
}

export interface ExportOrderRow {
  order_id: string
  table_label: string | null
  created_at: string
  final_total_cents: number
  payment_methods: string
  discount_amount_cents: number
  order_comp: boolean
}

export interface ExportOrdersResponse {
  success: boolean
  data?: ExportOrderRow[]
  error?: string
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

  const { start, end } = getDateRange(
    period,
    payload['from'] as string | undefined,
    payload['to'] as string | undefined,
  )

  const { supabaseUrl, serviceKey } = env
  const dbHeaders = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  }

  try {
    // Fetch paid orders in range (paginated with limit/offset to support large datasets)
    const PAGE_SIZE = 1000
    let offset = 0
    const allOrders: OrderRow[] = []

    while (true) {
      const ordersRes = await fetchFn(
        `${supabaseUrl}/rest/v1/orders?select=id,table_id,created_at,final_total_cents,discount_amount_cents,order_comp` +
          `&status=eq.paid` +
          `&created_at=gte.${encodeURIComponent(start)}` +
          `&created_at=lte.${encodeURIComponent(end)}` +
          `&order=created_at.asc` +
          `&limit=${PAGE_SIZE}&offset=${offset}`,
        { headers: dbHeaders },
      )
      if (!ordersRes.ok) {
        const errText = await ordersRes.text()
        return new Response(
          JSON.stringify({ success: false, error: `Failed to fetch orders: ${errText}` }),
          { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
        )
      }
      const page = (await ordersRes.json()) as OrderRow[]
      allOrders.push(...page)
      if (page.length < PAGE_SIZE) break
      offset += PAGE_SIZE
    }

    if (allOrders.length === 0) {
      return new Response(
        JSON.stringify({ success: true, data: [] }),
        { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }

    const orderIds = allOrders.map(o => o.id)

    // Fetch table labels for all unique table IDs
    const tableIds = [...new Set(allOrders.map(o => o.table_id).filter((id): id is string => id !== null))]
    const tableLabelMap: Record<string, string> = {}
    if (tableIds.length > 0) {
      const tablesRes = await fetchFn(
        `${supabaseUrl}/rest/v1/tables?select=id,label&id=in.(${tableIds.join(',')})`,
        { headers: dbHeaders },
      )
      if (tablesRes.ok) {
        const tables = (await tablesRes.json()) as TableRow[]
        for (const t of tables) {
          tableLabelMap[t.id] = t.label
        }
      }
    }

    // Fetch payments for all orders (paginated)
    const paymentMethodMap: Record<string, string[]> = {}
    let payOffset = 0
    while (true) {
      // PostgREST in(...) supports up to ~10k IDs but we chunk to be safe
      const chunk = orderIds.slice(payOffset, payOffset + 500)
      if (chunk.length === 0) break
      const paymentsRes = await fetchFn(
        `${supabaseUrl}/rest/v1/payments?select=order_id,method&order_id=in.(${chunk.join(',')})&limit=5000`,
        { headers: dbHeaders },
      )
      if (paymentsRes.ok) {
        const payments = (await paymentsRes.json()) as PaymentRow[]
        for (const p of payments) {
          if (!paymentMethodMap[p.order_id]) paymentMethodMap[p.order_id] = []
          if (!paymentMethodMap[p.order_id].includes(p.method)) {
            paymentMethodMap[p.order_id].push(p.method)
          }
        }
      }
      payOffset += 500
    }

    // Build result rows
    const result: ExportOrderRow[] = allOrders.map(o => ({
      order_id: o.id,
      table_label: o.table_id ? (tableLabelMap[o.table_id] ?? null) : null,
      created_at: o.created_at,
      final_total_cents: o.final_total_cents ?? 0,
      payment_methods: (paymentMethodMap[o.id] ?? []).join(' + '),
      discount_amount_cents: o.discount_amount_cents ?? 0,
      order_comp: o.order_comp ?? false,
    }))

    return new Response(
      JSON.stringify({ success: true, data: result }),
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
