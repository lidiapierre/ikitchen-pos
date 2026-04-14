/**
 * reopen_order_for_items — transitions a billed dine-in order back to 'open'
 * so that additional items can be added after the bill has been generated.
 *
 * Issue #394 — Allow adding items to a dine-in order after the bill has been generated.
 *
 * Flow:
 *   pending_payment → open (post_bill_mode = true)
 *
 * The existing bill data (bill_number, final_total_cents, service_charge_cents) is
 * cleared so that close_order will regenerate a fresh bill including all new items.
 *
 * Access: server+ (viewers cannot perform this action).
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

  // Require server+ role — viewers may not add items post-bill
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
    // 1. Fetch the order — must be pending_payment
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

    // Idempotent: already open and in post_bill_mode — return success
    if (order.status === 'open') {
      return new Response(
        JSON.stringify({ success: true, data: { status: 'open' } }),
        { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }

    // Only pending_payment orders can be reopened for additions
    if (order.status !== 'pending_payment') {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Order cannot be reopened: status is '${order.status}' (expected 'pending_payment')`,
        }),
        { status: 409, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }

    // 2. Reopen: transition to 'open', set post_bill_mode = true, void the generated bill
    const updateRes = await fetchFn(
      `${supabaseUrl}/rest/v1/orders?id=eq.${orderId}`,
      {
        method: 'PATCH',
        headers: { ...dbHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({
          status: 'open',
          post_bill_mode: true,
          // Clear billed totals so close_order regenerates them with the new items
          final_total_cents: null,
          service_charge_cents: null,
          bill_number: null,
        }),
      },
    )
    if (!updateRes.ok) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to reopen order' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }

    // 3. Audit log (required for destructive / status-change actions — CLAUDE.md section 12)
    const auditRes = await fetchFn(
      `${supabaseUrl}/rest/v1/audit_log`,
      {
        method: 'POST',
        headers: { ...dbHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({
          restaurant_id: order.restaurant_id,
          user_id: caller.actorId,
          action: 'reopen_order_for_items',
          entity_type: 'orders',
          entity_id: orderId,
          payload: { previous_status: 'pending_payment', new_status: 'open', post_bill_mode: true },
        }),
      },
    )
    if (!auditRes.ok) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to write audit log' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }

    return new Response(
      JSON.stringify({ success: true, data: { status: 'open' } }),
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
