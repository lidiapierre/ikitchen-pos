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

  // Health check – keeps the function warm (issue #283)
  if (req.method === 'GET' && new URL(req.url).pathname.endsWith('/health')) {
    return new Response(
      JSON.stringify({ ok: true, function: 'comp_item' }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }

  if (!env) {
    return new Response(
      JSON.stringify({ success: false, error: 'Server configuration error' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }

  // Only owners can mark items as complimentary
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

  if (typeof payload['reason'] !== 'string' || payload['reason'].trim() === '') {
    return new Response(
      JSON.stringify({ success: false, error: 'reason is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }

  const reason = payload['reason'] as string
  const orderItemId = typeof payload['order_item_id'] === 'string' ? payload['order_item_id'] : null
  const orderId = typeof payload['order_id'] === 'string' ? payload['order_id'] : null

  if (!orderItemId && !orderId) {
    return new Response(
      JSON.stringify({ success: false, error: 'Either order_item_id or order_id is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }

  if (orderItemId && !isValidUuid(orderItemId)) {
    return new Response(
      JSON.stringify({ success: false, error: 'order_item_id must be a valid UUID' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }

  if (orderId && !isValidUuid(orderId)) {
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
    Prefer: 'return=minimal',
  }

  try {
    if (orderItemId) {
      // Item-level comp
      const updateRes = await fetchFn(
        `${supabaseUrl}/rest/v1/order_items?id=eq.${orderItemId}`,
        {
          method: 'PATCH',
          headers: dbHeaders,
          body: JSON.stringify({ comp: true, comp_reason: reason }),
        },
      )
      if (!updateRes.ok) {
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to comp item' }),
          { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
        )
      }
    } else if (orderId) {
      // Order-level comp
      const updateRes = await fetchFn(
        `${supabaseUrl}/rest/v1/orders?id=eq.${orderId}`,
        {
          method: 'PATCH',
          headers: dbHeaders,
          body: JSON.stringify({
            order_comp: true,
            order_comp_reason: reason,
            order_comp_by: caller.actorId,
          }),
        },
      )
      if (!updateRes.ok) {
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to comp order' }),
          { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
        )
      }
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
