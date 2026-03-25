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

function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

export async function handler(
  req: Request,
  fetchFn: FetchFn = fetch,
  env: HandlerEnv | null = readEnv(),
): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders })
  }

  if (!env) {
    return new Response(
      JSON.stringify({ success: false, error: 'Server configuration error' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }

  // Verify JWT and check minimum role (manager required to void items)
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
  if (typeof payload['order_item_id'] !== 'string' || payload['order_item_id'] === '') {
    return new Response(
      JSON.stringify({ success: false, error: 'order_item_id is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }
  if (typeof payload['reason'] !== 'string' || payload['reason'] === '') {
    return new Response(
      JSON.stringify({ success: false, error: 'reason is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }

  const orderItemId = payload['order_item_id'] as string
  const reason = payload['reason'] as string

  const { supabaseUrl, serviceKey } = env
  const dbHeaders = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  }

  try {
    // 1. Fetch the order item to verify it exists and is not already voided
    const itemRes = await fetchFn(
      `${supabaseUrl}/rest/v1/order_items?select=id,order_id,voided&id=eq.${orderItemId}`,
      { headers: dbHeaders },
    )
    if (!itemRes.ok) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch order item' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }
    const items = (await itemRes.json()) as Array<{ id: string; order_id: string; voided: boolean }>
    if (items.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Order item not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }
    if (items[0].voided) {
      return new Response(
        JSON.stringify({ success: false, error: 'Order item is already voided' }),
        { status: 409, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }
    const orderId = items[0].order_id

    // 2. Fetch the order to verify it is open and get restaurant_id
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
    if (orders[0].status !== 'open') {
      return new Response(
        JSON.stringify({ success: false, error: 'Order is not open' }),
        { status: 409, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }
    const restaurantId = orders[0].restaurant_id

    // 3. Mark the order item as voided
    const voidRes = await fetchFn(
      `${supabaseUrl}/rest/v1/order_items?id=eq.${orderItemId}`,
      {
        method: 'PATCH',
        headers: { ...dbHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({ voided: true }),
      },
    )
    if (!voidRes.ok) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to void order item' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }

    // 4. Emit audit log entry — actor_id comes from verified JWT
    await fetchFn(
      `${supabaseUrl}/rest/v1/audit_log`,
      {
        method: 'POST',
        headers: { ...dbHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({
          restaurant_id: restaurantId,
          user_id: caller.actorId,
          action: 'void_item',
          entity_type: 'order_items',
          entity_id: orderItemId,
          payload: { reason, order_id: orderId },
        }),
      },
    )

    // 5. Calculate the updated order total
    const totalRes = await fetchFn(
      `${supabaseUrl}/rest/v1/order_items?select=unit_price_cents,quantity&order_id=eq.${orderId}&voided=eq.false`,
      { headers: { ...dbHeaders, Prefer: 'count=none' } },
    )
    if (!totalRes.ok) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to calculate order total' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }
    const allItems = (await totalRes.json()) as Array<{ unit_price_cents: number; quantity: number }>
    const orderTotal = allItems.reduce((sum, item) => sum + item.unit_price_cents * item.quantity, 0)

    return new Response(
      JSON.stringify({ success: true, data: { success: true, order_total: orderTotal } }),
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
