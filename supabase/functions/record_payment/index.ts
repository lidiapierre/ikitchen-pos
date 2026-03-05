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

export async function handler(
  req: Request,
  fetchFn: FetchFn = fetch,
  env: HandlerEnv | null = readEnv(),
): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders })
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
  if (payload['method'] !== 'cash' && payload['method'] !== 'card') {
    return new Response(
      JSON.stringify({ success: false, error: 'method must be cash or card' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }

  const orderId = payload['order_id'] as string
  const amountCents = payload['amount'] as number
  const method = payload['method'] as string
  const orderTotalCents = typeof payload['order_total_cents'] === 'number' ? payload['order_total_cents'] as number : null
  const changeDue = orderTotalCents !== null && method === 'cash'
    ? Math.max(0, amountCents - orderTotalCents)
    : 0

  if (!env) {
    return new Response(
      JSON.stringify({ success: false, error: 'Server configuration error' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }

  const staffIdHeader = req.headers.get('x-demo-staff-id') ?? ''
  const userId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(staffIdHeader)
    ? staffIdHeader
    : '00000000-0000-0000-0000-000000000001'

  const { supabaseUrl, serviceKey } = env
  const dbHeaders = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  }

  try {
    // 1. Fetch the order to verify it exists and is pending_payment
    const orderRes = await fetchFn(
      `${supabaseUrl}/rest/v1/orders?select=id,restaurant_id,status&id=eq.${orderId}`,
      { headers: dbHeaders },
    )
    if (!orderRes.ok) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch order' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }
    const orders = (await orderRes.json()) as Array<{ id: string; restaurant_id: string; status: string }>
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

    // 2. Insert payment record
    const paymentRes = await fetchFn(
      `${supabaseUrl}/rest/v1/payments`,
      {
        method: 'POST',
        headers: dbHeaders,
        body: JSON.stringify({
          order_id: orderId,
          method,
          amount_cents: amountCents,
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

    // 3. Mark the order as paid
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

    // 4. Emit audit log entry
    await fetchFn(
      `${supabaseUrl}/rest/v1/audit_log`,
      {
        method: 'POST',
        headers: { ...dbHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({
          restaurant_id: restaurantId,
          user_id: userId,
          action: 'record_payment',
          entity_type: 'payments',
          entity_id: paymentId,
          payload: { order_id: orderId, method, amount_cents: amountCents },
        }),
      },
    )

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
