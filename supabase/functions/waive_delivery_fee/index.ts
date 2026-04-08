/**
 * waive_delivery_fee — update the delivery charge on an order (issue #382).
 *
 * Requires admin or owner role. Accepts:
 *   { order_id: string, delivery_charge_cents: number }
 *
 * delivery_charge_cents = 0 to waive; original amount to restore.
 * The edge function verifies that the order belongs to the caller's restaurant
 * before performing the update.
 */

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

export async function handler(
  req: Request,
  fetchFn: FetchFn = fetch,
  env: HandlerEnv | null = readEnv(),
): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  // Health check
  if (req.method === 'GET' && new URL(req.url).pathname.endsWith('/health')) {
    return new Response(
      JSON.stringify({ ok: true, function: 'waive_delivery_fee' }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }

  if (!env) {
    return new Response(
      JSON.stringify({ success: false, error: 'Server configuration error' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }

  // Require admin or owner role to waive/restore delivery fees
  const caller = await verifyAndGetCaller(req, env.supabaseUrl, env.serviceKey, 'admin', fetchFn)
  if ('error' in caller) {
    return new Response(
      JSON.stringify({ success: false, error: caller.error }),
      { status: caller.status, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }

  let payload: unknown
  try {
    payload = await req.json()
  } catch {
    return new Response(
      JSON.stringify({ success: false, error: 'Invalid JSON body' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }

  if (
    typeof payload !== 'object' ||
    payload === null ||
    typeof (payload as Record<string, unknown>)['order_id'] !== 'string' ||
    typeof (payload as Record<string, unknown>)['delivery_charge_cents'] !== 'number'
  ) {
    return new Response(
      JSON.stringify({ success: false, error: 'order_id (string) and delivery_charge_cents (number) are required' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }

  const orderId = (payload as Record<string, unknown>)['order_id'] as string
  const deliveryChargeCents = (payload as Record<string, unknown>)['delivery_charge_cents'] as number

  if (!isValidUuid(orderId)) {
    return new Response(
      JSON.stringify({ success: false, error: 'order_id must be a valid UUID' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }

  if (!Number.isInteger(deliveryChargeCents) || deliveryChargeCents < 0) {
    return new Response(
      JSON.stringify({ success: false, error: 'delivery_charge_cents must be a non-negative integer' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }

  const { supabaseUrl, serviceKey } = env
  const dbHeaders = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  }

  try {
    // Verify the order belongs to the caller's restaurant (prevent cross-restaurant tampering)
    const orderCheckUrl = new URL(`${supabaseUrl}/rest/v1/orders`)
    orderCheckUrl.searchParams.set('id', `eq.${orderId}`)
    orderCheckUrl.searchParams.set('order_type', 'eq.delivery')
    orderCheckUrl.searchParams.set('select', 'id,restaurant_id,delivery_charge')
    orderCheckUrl.searchParams.set('limit', '1')

    const orderCheckRes = await fetchFn(orderCheckUrl.toString(), { headers: dbHeaders })
    if (!orderCheckRes.ok) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to verify order' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }
    const orderRows = (await orderCheckRes.json()) as Array<{ id: string; restaurant_id: string; delivery_charge: number }>
    if (orderRows.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Delivery order not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }

    // Verify caller's restaurant
    const callerResUrl = new URL(`${supabaseUrl}/rest/v1/user_restaurants`)
    callerResUrl.searchParams.set('user_id', `eq.${caller.actorId}`)
    callerResUrl.searchParams.set('restaurant_id', `eq.${orderRows[0].restaurant_id}`)
    callerResUrl.searchParams.set('select', 'user_id')
    callerResUrl.searchParams.set('limit', '1')

    const callerResRes = await fetchFn(callerResUrl.toString(), { headers: dbHeaders })
    if (!callerResRes.ok) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to verify restaurant membership' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }
    const callerResRows = (await callerResRes.json()) as Array<{ user_id: string }>
    if (callerResRows.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Not authorised to modify this order' }),
        { status: 403, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }

    const restaurantId = orderRows[0].restaurant_id

    // Update the delivery charge
    const updateRes = await fetchFn(
      `${supabaseUrl}/rest/v1/orders?id=eq.${orderId}`,
      {
        method: 'PATCH',
        headers: { ...dbHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({ delivery_charge: deliveryChargeCents }),
      },
    )

    if (!updateRes.ok) {
      const errText = await updateRes.text()
      return new Response(
        JSON.stringify({ success: false, error: `Failed to update delivery charge: ${errText}` }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }

    // Emit audit log — waiving/restoring a delivery fee is a financial action (issue #382)
    await fetchFn(
      `${supabaseUrl}/rest/v1/audit_log`,
      {
        method: 'POST',
        headers: { ...dbHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({
          restaurant_id: restaurantId,
          user_id: caller.actorId,
          action: 'waive_delivery_fee',
          entity_type: 'orders',
          entity_id: orderId,
          payload: {
            previous_charge_cents: orderRows[0].delivery_charge,
            delivery_charge_cents: deliveryChargeCents,
            waived: deliveryChargeCents === 0,
          },
        }),
      },
    )

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
