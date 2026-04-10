/**
 * mark_order_due — transitions a dine-in order from 'open' to 'due'.
 *
 * 'due' status means the bill has been presented to the guest but payment
 * is deferred (tab / settle later). The table remains occupied.
 * Staff can later call close_order to move to pending_payment and record payment.
 *
 * Issue #370 — pre-payment bill copy for dine-in orders.
 */
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

  const { supabaseUrl, serviceKey } = env
  const dbHeaders = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  }

  try {
    // 1. Fetch the order — must be an open dine-in order
    const orderRes = await fetchFn(
      `${supabaseUrl}/rest/v1/orders?id=eq.${orderId}&select=id,restaurant_id,status,order_type`,
      { headers: dbHeaders },
    )
    if (!orderRes.ok) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch order' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }

    const orders = (await orderRes.json()) as Array<{
      id: string
      restaurant_id: string
      status: string
      order_type: string | null
    }>

    if (orders.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Order not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }

    const order = orders[0]

    // Idempotent: already due → return success
    if (order.status === 'due') {
      return new Response(
        JSON.stringify({ success: true, data: { status: 'due' } }),
        { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }

    if (order.status !== 'open') {
      return new Response(
        JSON.stringify({ success: false, error: 'Order is not open' }),
        { status: 409, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }

    if ((order.order_type ?? 'dine_in') !== 'dine_in') {
      return new Response(
        JSON.stringify({ success: false, error: 'Mark as Due is only available for dine-in orders' }),
        { status: 422, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }

    // 2. Transition status: open → due
    const updateRes = await fetchFn(
      `${supabaseUrl}/rest/v1/orders?id=eq.${orderId}`,
      {
        method: 'PATCH',
        headers: { ...dbHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({ status: 'due' }),
      },
    )
    if (!updateRes.ok) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to update order status' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }

    // 3. Audit log
    await fetchFn(
      `${supabaseUrl}/rest/v1/audit_log`,
      {
        method: 'POST',
        headers: { ...dbHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({
          restaurant_id: order.restaurant_id,
          user_id: caller.actorId,
          action: 'mark_order_due',
          entity_type: 'orders',
          entity_id: orderId,
          payload: { previous_status: 'open', new_status: 'due' },
        }),
      },
    ).catch(() => { /* Non-fatal */ })

    return new Response(
      JSON.stringify({ success: true, data: { status: 'due' } }),
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
