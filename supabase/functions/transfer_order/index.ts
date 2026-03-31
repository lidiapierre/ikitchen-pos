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
      JSON.stringify({ ok: true, function: 'transfer_order' }),
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

  const payload = body as Record<string, unknown>
  if (typeof payload['order_id'] !== 'string' || payload['order_id'] === '') {
    return new Response(
      JSON.stringify({ success: false, error: 'order_id is required and must be a non-empty string' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }
  if (typeof payload['target_table_id'] !== 'string' || payload['target_table_id'] === '') {
    return new Response(
      JSON.stringify({ success: false, error: 'target_table_id is required and must be a non-empty string' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }

  const orderId = payload['order_id'] as string
  const targetTableId = payload['target_table_id'] as string

  const { supabaseUrl, serviceKey } = env
  const dbHeaders = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  }

  try {
    // 1. Fetch the order — must be open
    const orderRes = await fetchFn(
      `${supabaseUrl}/rest/v1/orders?select=id,status,table_id&id=eq.${orderId}`,
      { headers: dbHeaders },
    )
    if (!orderRes.ok) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch order' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }
    const orders = (await orderRes.json()) as Array<{ id: string; status: string; table_id: string }>
    if (orders.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Order not found' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }
    const order = orders[0]
    if (order.status !== 'open') {
      return new Response(
        JSON.stringify({ success: false, error: 'Order is not open' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }

    // 2. Fetch the target table — must exist
    const tableRes = await fetchFn(
      `${supabaseUrl}/rest/v1/tables?select=id,label&id=eq.${targetTableId}`,
      { headers: dbHeaders },
    )
    if (!tableRes.ok) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch target table' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }
    const tables = (await tableRes.json()) as Array<{ id: string; label: string }>
    if (tables.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Target table not found' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }

    // 3. Check target table has no other open order
    const occupiedRes = await fetchFn(
      `${supabaseUrl}/rest/v1/orders?select=id&table_id=eq.${targetTableId}&status=eq.open`,
      { headers: dbHeaders },
    )
    if (!occupiedRes.ok) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to check target table occupancy' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }
    const occupiedOrders = (await occupiedRes.json()) as Array<{ id: string }>
    if (occupiedOrders.length > 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Target table already has an open order' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }

    // 4. Update the order's table_id
    const updateRes = await fetchFn(
      `${supabaseUrl}/rest/v1/orders?id=eq.${orderId}`,
      {
        method: 'PATCH',
        headers: { ...dbHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({ table_id: targetTableId }),
      },
    )
    if (!updateRes.ok) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to transfer order' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }

    return new Response(
      JSON.stringify({ success: true, data: { order_id: orderId, new_table_id: targetTableId } }),
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
