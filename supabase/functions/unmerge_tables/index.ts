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
      JSON.stringify({ ok: true, function: 'unmerge_tables' }),
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
      JSON.stringify({ success: false, error: 'Invalid or missing request body' }),
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
  const { supabaseUrl, serviceKey } = env
  const dbHeaders = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  }

  try {
    // 1. Fetch the primary order — must exist and have a merge_label
    const orderRes = await fetchFn(
      `${supabaseUrl}/rest/v1/orders?select=id,status,merge_label&id=eq.${orderId}`,
      { headers: dbHeaders },
    )
    if (!orderRes.ok) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch order' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }
    const orders = (await orderRes.json()) as Array<{ id: string; status: string; merge_label: string | null }>
    if (orders.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Order not found' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }
    const order = orders[0]
    if (!['open', 'pending_payment'].includes(order.status)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Order is not open' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }
    if (!order.merge_label) {
      return new Response(
        JSON.stringify({ success: false, error: 'Order is not part of a merge' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }

    // 2. Find all tables locked by this order
    const lockedTablesRes = await fetchFn(
      `${supabaseUrl}/rest/v1/tables?select=id,label&locked_by_order_id=eq.${orderId}`,
      { headers: dbHeaders },
    )
    if (!lockedTablesRes.ok) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch locked tables' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }
    const lockedTables = (await lockedTablesRes.json()) as Array<{ id: string; label: string }>

    // 3. Unlock all secondary tables: set locked_by_order_id = null
    if (lockedTables.length > 0) {
      const lockedTableIds = lockedTables.map((t) => t.id).join(',')
      const unlockRes = await fetchFn(
        `${supabaseUrl}/rest/v1/tables?id=in.(${lockedTableIds})`,
        {
          method: 'PATCH',
          headers: { ...dbHeaders, Prefer: 'return=minimal' },
          body: JSON.stringify({ locked_by_order_id: null }),
        },
      )
      if (!unlockRes.ok) {
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to unlock secondary tables' }),
          { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
        )
      }
    }

    // 4. Clear the merge_label from the primary order
    const clearLabelRes = await fetchFn(
      `${supabaseUrl}/rest/v1/orders?id=eq.${orderId}`,
      {
        method: 'PATCH',
        headers: { ...dbHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({ merge_label: null }),
      },
    )
    if (!clearLabelRes.ok) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to clear merge label' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }

    // 5. Audit log
    await fetchFn(`${supabaseUrl}/rest/v1/audit_log`, {
      method: 'POST',
      headers: { ...dbHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify({
        actor_id: caller.actorId,
        action: 'unmerge_tables',
        target_type: 'order',
        target_id: orderId,
        meta: {
          unmerged_table_ids: lockedTables.map((t) => t.id),
          previous_merge_label: order.merge_label,
        },
      }),
    }).catch(() => { /* non-fatal */ })

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          order_id: orderId,
          unmerged_table_count: lockedTables.length,
        },
      }),
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
