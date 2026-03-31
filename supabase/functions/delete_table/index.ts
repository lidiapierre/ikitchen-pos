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
      JSON.stringify({ ok: true, function: 'delete_table' }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }

  if (!env) {
    return new Response(
      JSON.stringify({ success: false, error: 'Server configuration error' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }

  // Verify JWT and check minimum role (owner required for table management)
  const caller = await verifyAndGetCaller(req, env.supabaseUrl, env.serviceKey, 'owner', fetchFn)
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
  if (typeof payload['table_id'] !== 'string' || payload['table_id'] === '') {
    return new Response(
      JSON.stringify({ success: false, error: 'table_id is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }

  const tableId = payload['table_id'] as string
  // actor_id comes from the verified JWT — no more x-demo-staff-id header
  const userId = caller.actorId

  const { supabaseUrl, serviceKey } = env
  const baseHeaders = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  }

  try {
    // Fetch table to get restaurant_id for audit log
    const tableRes = await fetchFn(
      `${supabaseUrl}/rest/v1/tables?select=id,restaurant_id&id=eq.${tableId}`,
      { headers: { ...baseHeaders, Prefer: 'return=representation' } },
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
    const restaurantId = tables[0].restaurant_id

    // Check for open orders on this table (server-side guard)
    const ordersRes = await fetchFn(
      `${supabaseUrl}/rest/v1/orders?select=id&table_id=eq.${tableId}&status=eq.open`,
      { headers: baseHeaders },
    )
    if (!ordersRes.ok) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to check table orders' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }
    const openOrders = (await ordersRes.json()) as Array<{ id: string }>
    if (openOrders.length > 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Cannot delete a table with an open order' }),
        { status: 409, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }

    // Delete the table
    const deleteRes = await fetchFn(`${supabaseUrl}/rest/v1/tables?id=eq.${tableId}`, {
      method: 'DELETE',
      headers: { ...baseHeaders, Prefer: 'return=minimal' },
    })
    if (!deleteRes.ok) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to delete table' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }

    // Audit log — best effort, do not fail the request if this fails
    await fetchFn(`${supabaseUrl}/rest/v1/audit_log`, {
      method: 'POST',
      headers: { ...baseHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify({
        restaurant_id: restaurantId,
        user_id: userId,
        action: 'delete_table',
        entity_type: 'tables',
        entity_id: tableId,
        payload: {},
      }),
    })

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
