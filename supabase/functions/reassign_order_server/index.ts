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

function jsonRes(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
}

export async function handler(
  req: Request,
  fetchFn: FetchFn = fetch,
  env: HandlerEnv | null = readEnv(),
): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }
  if (req.method === 'GET' && new URL(req.url).pathname.endsWith('/health')) {
    return jsonRes({ ok: true, function: 'reassign_order_server' }, 200)
  }
  if (!env) {
    return jsonRes({ success: false, error: 'Server configuration error' }, 500)
  }

  const caller = await verifyAndGetCaller(req, env.supabaseUrl, env.serviceKey, 'manager', fetchFn)
  if ('error' in caller) {
    return jsonRes({ success: false, error: caller.error }, caller.status)
  }

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return jsonRes({ success: false, error: 'Invalid or missing request body' }, 400)
  }

  const orderId = typeof body['order_id'] === 'string' ? body['order_id'] : ''
  if (!orderId) return jsonRes({ success: false, error: 'order_id is required' }, 400)

  const newServerId = typeof body['new_server_id'] === 'string' ? body['new_server_id'] : ''
  if (!newServerId) return jsonRes({ success: false, error: 'new_server_id is required' }, 400)

  const { supabaseUrl, serviceKey } = env
  const dbHeaders = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  }

  try {
    // Look up caller's restaurant_id
    const userRes = await fetchFn(
      `${supabaseUrl}/rest/v1/users?select=restaurant_id&id=eq.${encodeURIComponent(caller.actorId)}&limit=1`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
    )
    if (!userRes.ok) return jsonRes({ success: false, error: 'Failed to fetch user' }, 500)
    const users = (await userRes.json()) as Array<{ restaurant_id: string }>
    if (users.length === 0) return jsonRes({ success: false, error: 'User not found' }, 404)
    const callerRestaurantId = users[0].restaurant_id

    // Verify the target server exists AND belongs to the same restaurant
    const serverRes = await fetchFn(
      `${supabaseUrl}/rest/v1/users?id=eq.${encodeURIComponent(newServerId)}&restaurant_id=eq.${encodeURIComponent(callerRestaurantId)}&select=id,role&limit=1`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
    )
    if (!serverRes.ok) return jsonRes({ success: false, error: 'Failed to verify server' }, 500)
    const servers = (await serverRes.json()) as Array<{ id: string; role: string }>
    if (servers.length === 0) return jsonRes({ success: false, error: 'Target server not found in this restaurant' }, 404)

    // Verify order belongs to caller's restaurant and is in an active state
    const orderCheckRes = await fetchFn(
      `${supabaseUrl}/rest/v1/orders?select=id,status&id=eq.${encodeURIComponent(orderId)}&restaurant_id=eq.${encodeURIComponent(callerRestaurantId)}&limit=1`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
    )
    if (!orderCheckRes.ok) return jsonRes({ success: false, error: 'Failed to verify order' }, 500)
    const orders = (await orderCheckRes.json()) as Array<{ id: string; status: string }>
    if (orders.length === 0) return jsonRes({ success: false, error: 'Order not found or access denied' }, 404)
    if (orders[0].status !== 'open' && orders[0].status !== 'pending_payment') {
      return jsonRes({ success: false, error: 'Cannot reassign server on a completed or cancelled order' }, 400)
    }

    // Update orders.server_id — scoped to caller's restaurant
    const res = await fetchFn(
      `${supabaseUrl}/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}&restaurant_id=eq.${encodeURIComponent(callerRestaurantId)}`,
      { method: 'PATCH', headers: dbHeaders, body: JSON.stringify({ server_id: newServerId }) },
    )
    if (!res.ok) return jsonRes({ success: false, error: 'Failed to reassign order' }, 500)
    const rows = (await res.json()) as Array<Record<string, unknown>>

    // Audit log — best effort
    await fetchFn(`${supabaseUrl}/rest/v1/audit_log`, {
      method: 'POST',
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({
        restaurant_id: callerRestaurantId,
        user_id: caller.actorId,
        action: 'reassign_order_server',
        entity_type: 'orders',
        entity_id: orderId,
        payload: { new_server_id: newServerId },
      }),
    })

    return jsonRes({ success: true, data: rows[0] ?? null }, 200)
  } catch {
    return jsonRes({ success: false, error: 'Internal server error' }, 500)
  }
}

if (typeof (globalThis as { Deno?: unknown }).Deno !== 'undefined') {
  const g = globalThis as { Deno: { serve: (h: (req: Request) => Promise<Response>) => void } }
  g.Deno.serve((req: Request) => handler(req))
}
