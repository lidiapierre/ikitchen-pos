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

export async function handler(
  req: Request,
  fetchFn: FetchFn = fetch,
  env: HandlerEnv | null = readEnv(),
): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders })
  }

  // Health check – keeps the function warm (issue #283)
  if (req.method === 'GET' && new URL(req.url).pathname.endsWith('/health')) {
    return new Response(
      JSON.stringify({ ok: true, function: 'create_order' }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }

  if (!env) {
    return new Response(
      JSON.stringify({ success: false, error: 'Server configuration error' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }

  // Verify JWT and check minimum role
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

  // Parse order_type (default to dine_in for backward compatibility)
  const orderType = (payload['order_type'] as string | undefined) ?? 'dine_in'
  if (!['dine_in', 'takeaway', 'delivery'].includes(orderType)) {
    return new Response(
      JSON.stringify({ success: false, error: 'order_type must be dine_in, takeaway, or delivery' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }

  const customerName = (payload['customer_name'] as string | undefined) ?? null
  const deliveryNote = (payload['delivery_note'] as string | undefined) ?? null

  // Delivery orders require customer_name
  if (orderType === 'delivery' && (!customerName || customerName.trim() === '')) {
    return new Response(
      JSON.stringify({ success: false, error: 'customer_name is required for delivery orders' }),
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
    let restaurantId: string
    let tableId: string | null = null

    if (orderType === 'dine_in') {
      // Dine-in: table_id required — unchanged existing behaviour
      if (typeof payload['table_id'] !== 'string' || payload['table_id'] === '') {
        return new Response(
          JSON.stringify({ success: false, error: 'table_id is required for dine_in orders' }),
          { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
        )
      }
      tableId = payload['table_id'] as string

      // Fetch table to verify it exists and get restaurant_id
      const tableRes = await fetchFn(
        `${supabaseUrl}/rest/v1/tables?select=id,restaurant_id&id=eq.${tableId}`,
        { headers: dbHeaders },
      )
      if (!tableRes.ok) {
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to fetch table' }),
          { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
        )
      }
      const tables = (await tableRes.json()) as Array<{ id: string; restaurant_id: string }>
      if (tables.length === 0) {
        return new Response(
          JSON.stringify({ success: false, error: 'Table not found' }),
          { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
        )
      }
      restaurantId = tables[0].restaurant_id
    } else {
      // Takeaway / Delivery: no table required — get restaurant_id from the user's record
      const userRes = await fetchFn(
        `${supabaseUrl}/rest/v1/users?select=restaurant_id&id=eq.${encodeURIComponent(caller.actorId)}&limit=1`,
        { headers: dbHeaders },
      )
      if (!userRes.ok) {
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to fetch user restaurant' }),
          { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
        )
      }
      const users = (await userRes.json()) as Array<{ restaurant_id: string }>
      if (users.length === 0) {
        return new Response(
          JSON.stringify({ success: false, error: 'User not found' }),
          { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
        )
      }
      restaurantId = users[0].restaurant_id

      // Accept optional table_id for future flexibility, but do not require it
      if (typeof payload['table_id'] === 'string' && payload['table_id'] !== '') {
        tableId = payload['table_id'] as string
      }
    }

    // Insert the new order
    const insertBody: Record<string, unknown> = {
      restaurant_id: restaurantId,
      status: 'open',
      server_id: caller.actorId,
      order_type: orderType,
    }
    if (tableId !== null) insertBody['table_id'] = tableId
    if (customerName !== null) insertBody['customer_name'] = customerName
    if (deliveryNote !== null) insertBody['delivery_note'] = deliveryNote

    const insertRes = await fetchFn(
      `${supabaseUrl}/rest/v1/orders`,
      {
        method: 'POST',
        headers: dbHeaders,
        body: JSON.stringify(insertBody),
      },
    )
    if (!insertRes.ok) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to create order' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }
    const inserted = (await insertRes.json()) as Array<{ id: string; status: string }>
    const order = inserted[0]

    return new Response(
      JSON.stringify({ success: true, data: { order_id: order.id, status: order.status } }),
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
