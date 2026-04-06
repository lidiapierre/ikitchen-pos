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

function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

export async function handler(
  req: Request,
  fetchFn: FetchFn = fetch,
  env: HandlerEnv | null = readEnv(),
): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  // Health check – keeps the function warm (issue #283)
  if (req.method === 'GET' && new URL(req.url).pathname.endsWith('/health')) {
    return new Response(
      JSON.stringify({ ok: true, function: 'record_payment' }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }

  if (!env) {
    return new Response(
      JSON.stringify({ success: false, error: 'Server configuration error' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }

  // Verify JWT and check minimum role (manager required to record payments)
  const caller = await verifyAndGetCaller(req, env.supabaseUrl, env.serviceKey, 'manager', fetchFn)
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

  if (!body) {
    return new Response(
      JSON.stringify({ success: false, error: 'Invalid request body' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }

  const payload = body as Record<string, unknown>
  if (typeof payload['order_id'] !== 'string' || payload['order_id'] === '') {
    return new Response(
      JSON.stringify({ success: false, error: 'order_id is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }
  if (typeof payload['amount'] !== 'number') {
    return new Response(
      JSON.stringify({ success: false, error: 'amount is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }
  if ((payload['amount'] as number) <= 0) {
    return new Response(
      JSON.stringify({ success: false, error: 'amount must be greater than 0' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }
  if (typeof payload['method'] !== 'string' || payload['method'] === '') {
    return new Response(
      JSON.stringify({ success: false, error: 'method is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }
  const VALID_METHODS = ['cash', 'card', 'mobile', 'other']
  if (!VALID_METHODS.includes(payload['method'] as string)) {
    return new Response(
      JSON.stringify({ success: false, error: 'method must be one of: cash, card, mobile, other' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }

  const orderId = payload['order_id'] as string
  if (!isValidUuid(orderId)) {
    return new Response(
      JSON.stringify({ success: false, error: 'order_id must be a valid UUID' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }
  const amountCents = payload['amount'] as number
  const method = payload['method'] as string

  const { supabaseUrl, serviceKey } = env
  const dbHeaders = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  }

  try {
    // 1. Fetch the order to verify it exists, is pending_payment, and get final_total_cents
    //    Also fetch customer_id here to avoid a second roundtrip in the loyalty block (issue #356)
    const orderRes = await fetchFn(
      `${supabaseUrl}/rest/v1/orders?select=id,restaurant_id,status,final_total_cents,discount_amount_cents,order_comp,customer_id&id=eq.${orderId}`,
      { headers: dbHeaders },
    )
    if (!orderRes.ok) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch order' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }
    const orders = (await orderRes.json()) as Array<{ id: string; restaurant_id: string; status: string; final_total_cents: number | null; discount_amount_cents: number | null; order_comp: boolean | null; customer_id: string | null }>
    if (orders.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Order not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }
    if (orders[0].status !== 'pending_payment') {
      return new Response(
        JSON.stringify({ success: false, error: 'Order is not pending payment' }),
        { status: 409, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }
    const restaurantId = orders[0].restaurant_id

    // If order is fully comp'd, effective total is 0
    const isOrderComp = orders[0].order_comp === true
    const rawFinalTotalCents = orders[0].final_total_cents ?? 0
    const discountAmountCents = orders[0].discount_amount_cents ?? 0
    const effectiveTotalCents = isOrderComp
      ? 0
      : Math.max(0, rawFinalTotalCents - discountAmountCents)

    const finalTotalCents = effectiveTotalCents
    const changeDue = method === 'cash'
      ? Math.max(0, amountCents - finalTotalCents)
      : 0

    // 2. Mark the order as paid first (prevents duplicate payment processing)
    const closeRes = await fetchFn(
      `${supabaseUrl}/rest/v1/orders?id=eq.${orderId}`,
      {
        method: 'PATCH',
        headers: { ...dbHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({ status: 'paid' }),
      },
    )
    if (!closeRes.ok) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to update order status' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }

    // 3. Insert payment record
    const paymentRes = await fetchFn(
      `${supabaseUrl}/rest/v1/payments`,
      {
        method: 'POST',
        headers: dbHeaders,
        body: JSON.stringify({
          order_id: orderId,
          method,
          amount_cents: amountCents,
          discount_amount_cents: discountAmountCents > 0 ? discountAmountCents : undefined,
        }),
      },
    )
    if (!paymentRes.ok) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to record payment' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }
    const inserted = (await paymentRes.json()) as Array<{ id: string }>
    const paymentId = inserted[0].id

    // 4. Emit audit log entry — actor_id comes from verified JWT
    const auditRes = await fetchFn(
      `${supabaseUrl}/rest/v1/audit_log`,
      {
        method: 'POST',
        headers: { ...dbHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({
          restaurant_id: restaurantId,
          user_id: caller.actorId,
          action: 'record_payment',
          entity_type: 'payments',
          entity_id: paymentId,
          payload: { order_id: orderId, method, amount_cents: amountCents },
        }),
      },
    )
    if (!auditRes.ok) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to write audit log' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }

    // 5. Award loyalty points to the linked customer (best-effort — never block payment)
    //    Points are awarded on payment (not on close) to avoid double-awarding on cancelled/voided orders.
    //    customer_id was already fetched in step 1 — no extra DB roundtrip needed.
    try {
      const customerId = orders[0].customer_id
      if (customerId && isValidUuid(customerId)) {
        // Fetch loyalty_points_per_order from config
        const configRes = await fetchFn(
          `${supabaseUrl}/rest/v1/config?select=value&restaurant_id=eq.${restaurantId}&key=eq.loyalty_points_per_order&limit=1`,
          { headers: dbHeaders },
        )
        let pointsToAward = 10 // default if not configured
        if (configRes.ok) {
          const configRows = (await configRes.json()) as Array<{ value: string }>
          if (configRows.length > 0) {
            const parsed = parseInt(configRows[0].value, 10)
            if (!isNaN(parsed) && parsed >= 0) {
              pointsToAward = parsed
            }
          }
        }
        if (pointsToAward > 0) {
          await fetchFn(
            `${supabaseUrl}/rest/v1/rpc/award_loyalty_points`,
            {
              method: 'POST',
              headers: { ...dbHeaders, Prefer: 'return=minimal' },
              body: JSON.stringify({ p_customer_id: customerId, p_points: pointsToAward }),
            },
          ).catch(() => { /* Non-fatal */ })
        }
      }
    } catch {
      // Best-effort: loyalty point awarding must never block payment recording
    }

    return new Response(
      JSON.stringify({ success: true, data: { payment_id: paymentId, change_due: changeDue } }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  } catch {
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }
}

if (typeof (globalThis as { Deno?: unknown }).Deno !== 'undefined') {
  const g = globalThis as { Deno: { serve: (h: (req: Request) => Promise<Response>) => void } }
  g.Deno.serve((req: Request) => handler(req))
}
