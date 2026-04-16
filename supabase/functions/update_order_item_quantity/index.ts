import { verifyAndGetCaller } from '../_shared/auth.ts'

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-demo-staff-id',
  'Access-Control-Allow-Methods': 'PATCH, GET, OPTIONS',
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

  // Health check – keeps the function warm
  if (req.method === 'GET' && new URL(req.url).pathname.endsWith('/health')) {
    return new Response(
      JSON.stringify({ ok: true, function: 'update_order_item_quantity' }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }

  if (!env) {
    return new Response(
      JSON.stringify({ success: false, error: 'Server configuration error' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }

  // Verify JWT – server role is sufficient (quantity edits are a normal server action)
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
      JSON.stringify({ success: false, error: 'Invalid or missing request body' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }

  if (!body) {
    return new Response(
      JSON.stringify({ success: false, error: 'Missing request body' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }

  const payload = body as Record<string, unknown>

  if (typeof payload['order_item_id'] !== 'string' || payload['order_item_id'] === '') {
    return new Response(
      JSON.stringify({ success: false, error: 'order_item_id is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }
  if (!isValidUuid(payload['order_item_id'] as string)) {
    return new Response(
      JSON.stringify({ success: false, error: 'order_item_id must be a valid UUID' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }

  const rawQty = payload['quantity']
  if (typeof rawQty !== 'number' || !Number.isInteger(rawQty) || rawQty < 1 || rawQty > 999) {
    return new Response(
      JSON.stringify({ success: false, error: 'quantity must be a positive integer between 1 and 999' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }

  const orderItemId = payload['order_item_id'] as string
  const quantity = rawQty as number

  const { supabaseUrl, serviceKey } = env
  const dbHeaders = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  }

  try {
    // ── Step 1: resolve order_item → order → restaurant ────────────────────
    const itemRes = await fetchFn(
      `${supabaseUrl}/rest/v1/order_items?id=eq.${orderItemId}&select=id,voided,order:orders!inner(id,restaurant_id,status)`,
      { method: 'GET', headers: dbHeaders },
    )
    if (!itemRes.ok) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to resolve order item' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }
    const itemRows = await itemRes.json() as Array<{
      id: string
      voided: boolean
      order: { id: string; restaurant_id: string; status: string }
    }>
    if (!Array.isArray(itemRows) || itemRows.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Order item not found or access denied' }),
        { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }
    const itemData = itemRows[0]
    if (itemData.voided) {
      return new Response(
        JSON.stringify({ success: false, error: 'Cannot change quantity of a voided item' }),
        { status: 422, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }
    if (itemData.order.status !== 'open') {
      return new Response(
        JSON.stringify({ success: false, error: 'Order is not open' }),
        { status: 422, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }
    const restaurantId = itemData.order.restaurant_id
    const orderId = itemData.order.id

    // ── Step 2: verify caller has access to that restaurant ─────────────────
    // Note: users.restaurant_id is the primary user-restaurant link for MVP.
    // user_restaurants is a future multi-location junction table not yet in use.
    const accessRes = await fetchFn(
      `${supabaseUrl}/rest/v1/users?id=eq.${caller.actorId}&restaurant_id=eq.${restaurantId}&select=id&limit=1`,
      { method: 'GET', headers: dbHeaders },
    )
    if (!accessRes.ok) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to verify restaurant access' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }
    const accessRows = await accessRes.json() as Array<{ id: string }>
    if (!Array.isArray(accessRows) || accessRows.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Order item not found or access denied' }),
        { status: 403, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }

    // ── Step 3: update quantity ─────────────────────────────────────────────
    const patchRes = await fetchFn(
      `${supabaseUrl}/rest/v1/order_items?id=eq.${orderItemId}`,
      {
        method: 'PATCH',
        headers: { ...dbHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({ quantity }),
      },
    )
    if (!patchRes.ok) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to update order item quantity' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }

    // ── Step 4: audit log (non-fatal — network failures must not roll back the update) ───
    try {
      await fetchFn(
        `${supabaseUrl}/rest/v1/audit_log`,
        {
          method: 'POST',
          headers: { ...dbHeaders, Prefer: 'return=minimal' },
          body: JSON.stringify({
            restaurant_id: restaurantId,
            user_id: caller.actorId,
            action: 'update_quantity',
            entity_type: 'order_items',
            entity_id: orderItemId,
            payload: { quantity, order_id: orderId },
          }),
        },
      )
    } catch {
      // Non-fatal: quantity update already succeeded; audit failure should not
      // cause a 500 response or hide the successful update from the caller.
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
