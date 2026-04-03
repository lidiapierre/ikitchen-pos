import { verifyAndGetCaller } from '../_shared/auth.ts'

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-demo-staff-id',
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

/**
 * link_customer_to_order — sets orders.customer_id for a dine-in order.
 *
 * Body: { order_id: string, customer_id: string }
 *
 * Uses the service role key so the write is not limited by RLS.
 * The caller must be an authenticated restaurant staff member (verified via JWT).
 */
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
      JSON.stringify({ ok: true, function: 'link_customer_to_order' }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }

  if (!env) {
    return new Response(
      JSON.stringify({ success: false, error: 'Server configuration error' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }

  const caller = await verifyAndGetCaller(req, env.supabaseUrl, env.serviceKey, 'server', fetchFn)
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

  if (typeof payload['order_id'] !== 'string' || payload['order_id'] === '') {
    return new Response(
      JSON.stringify({ success: false, error: 'order_id is required' }),
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

  if (typeof payload['customer_id'] !== 'string' || payload['customer_id'] === '') {
    return new Response(
      JSON.stringify({ success: false, error: 'customer_id is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }
  const customerId = payload['customer_id'] as string
  if (!isValidUuid(customerId)) {
    return new Response(
      JSON.stringify({ success: false, error: 'customer_id must be a valid UUID' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }

  const { supabaseUrl, serviceKey } = env
  const dbHeaders = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
    Prefer: 'return=minimal',
  }

  try {
    // Fetch the order's restaurant_id (needed for the audit log)
    const orderRes = await fetchFn(
      `${supabaseUrl}/rest/v1/orders?id=eq.${orderId}&select=restaurant_id`,
      { headers: dbHeaders },
    )
    let restaurantId: string | null = null
    if (orderRes.ok) {
      const rows = (await orderRes.json()) as Array<{ restaurant_id: string }>
      restaurantId = rows[0]?.restaurant_id ?? null
    }

    // PATCH orders.customer_id
    const patchRes = await fetchFn(
      `${supabaseUrl}/rest/v1/orders?id=eq.${orderId}`,
      {
        method: 'PATCH',
        headers: dbHeaders,
        body: JSON.stringify({ customer_id: customerId }),
      },
    )

    if (!patchRes.ok) {
      const errText = await patchRes.text()
      return new Response(
        JSON.stringify({ success: false, error: `Failed to link customer: ${errText}` }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }

    // Emit audit log entry (best-effort — non-fatal)
    if (restaurantId) {
      await fetchFn(
        `${supabaseUrl}/rest/v1/audit_log`,
        {
          method: 'POST',
          headers: { ...dbHeaders, Prefer: 'return=minimal' },
          body: JSON.stringify({
            restaurant_id: restaurantId,
            user_id: caller.actorId,
            action: 'link_customer_to_order',
            entity_type: 'orders',
            entity_id: orderId,
            payload: { customer_id: customerId },
          }),
        },
      ).catch(() => { /* Non-fatal */ })
    }

    return new Response(
      JSON.stringify({ success: true }),
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
