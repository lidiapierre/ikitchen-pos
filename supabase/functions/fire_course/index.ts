/**
 * fire_course — fire or serve a specific course for an order.
 *
 * POST { order_id, course, action? }
 *   action: 'fire' (default) | 'serve'
 *
 * 'fire'  → sets sent_to_kitchen = true, course_status = 'fired'  for all
 *            non-voided items in that course that are currently 'waiting'
 * 'serve' → sets course_status = 'served' for all non-voided items in that course
 *
 * Returns { success: true, data: { item_ids: string[] } }
 */

import { verifyAndGetCaller } from '../_shared/auth.ts'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-demo-staff-id',
}

type FetchFn = (input: string, init?: RequestInit) => Promise<Response>

interface HandlerEnv {
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
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  // Health check – keeps the function warm (issue #283)
  if (req.method === 'GET' && new URL(req.url).pathname.endsWith('/health')) {
    return new Response(
      JSON.stringify({ ok: true, function: 'fire_course' }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
    )
  }

  if (!env) {
    return new Response(
      JSON.stringify({ success: false, error: 'Server configuration error' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
    )
  }

  // Verify JWT and require at least 'server' role
  const caller = await verifyAndGetCaller(req, env.supabaseUrl, env.serviceKey, 'server', fetchFn)
  if ('error' in caller) {
    return new Response(
      JSON.stringify({ success: false, error: caller.error }),
      { status: caller.status, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return new Response(
      JSON.stringify({ success: false, error: 'Invalid or missing request body' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
    )
  }

  const payload = body as Record<string, unknown>

  if (typeof payload['order_id'] !== 'string' || payload['order_id'] === '') {
    return new Response(
      JSON.stringify({ success: false, error: 'order_id is required and must be a non-empty string' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
    )
  }

  if (typeof payload['course'] !== 'string' || !['starter', 'main', 'dessert'].includes(payload['course'])) {
    return new Response(
      JSON.stringify({ success: false, error: 'course must be one of: starter, main, dessert' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
    )
  }

  const action = typeof payload['action'] === 'string' ? payload['action'] : 'fire'
  if (!['fire', 'serve'].includes(action)) {
    return new Response(
      JSON.stringify({ success: false, error: 'action must be fire or serve' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
    )
  }

  const orderId = payload['order_id'] as string
  const course = payload['course'] as string

  const dbHeaders = {
    apikey: env.serviceKey,
    Authorization: `Bearer ${env.serviceKey}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  }

  try {
    // 1. Fetch items for this order + course that are not voided
    const itemsUrl = `${env.supabaseUrl}/rest/v1/order_items?select=id,course_status,sent_to_kitchen&order_id=eq.${orderId}&course=eq.${course}&voided=eq.false`
    const itemsRes = await fetchFn(itemsUrl, { headers: dbHeaders })
    if (!itemsRes.ok) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch order items' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
      )
    }
    const items = (await itemsRes.json()) as Array<{ id: string; course_status: string; sent_to_kitchen: boolean }>

    if (items.length === 0) {
      return new Response(
        JSON.stringify({ success: true, data: { item_ids: [] } }),
        { status: 200, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
      )
    }

    const itemIds = items.map((i) => i.id)

    // 2. Build update payload based on action
    const updatePayload: Record<string, unknown> = {}
    if (action === 'fire') {
      updatePayload['sent_to_kitchen'] = true
      updatePayload['course_status'] = 'fired'
    } else {
      // serve
      updatePayload['course_status'] = 'served'
    }

    // 3. PATCH all matching items
    const patchUrl = `${env.supabaseUrl}/rest/v1/order_items?id=in.(${itemIds.join(',')})&order_id=eq.${orderId}`
    const patchRes = await fetchFn(patchUrl, {
      method: 'PATCH',
      headers: { ...dbHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify(updatePayload),
    })

    if (!patchRes.ok) {
      const errBody = await patchRes.text()
      return new Response(
        JSON.stringify({ success: false, error: `Failed to update course status: ${errBody}` }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
      )
    }

    return new Response(
      JSON.stringify({ success: true, data: { item_ids: itemIds } }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
    )
  }
}

if (typeof (globalThis as { Deno?: unknown }).Deno !== 'undefined') {
  const g = globalThis as { Deno: { serve: (h: (req: Request) => Promise<Response>) => void } }
  g.Deno.serve((req: Request) => handler(req))
}
