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

  if (!env) {
    return new Response(
      JSON.stringify({ success: false, error: 'Server configuration error' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }

  // Verify JWT and check minimum role (owner required for menu management)
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
  if (typeof payload['restaurant_id'] !== 'string' || payload['restaurant_id'] === '') {
    return new Response(
      JSON.stringify({ success: false, error: 'restaurant_id is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }
  if (typeof payload['name'] !== 'string' || (payload['name'] as string).trim() === '') {
    return new Response(
      JSON.stringify({ success: false, error: 'name is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }

  const restaurantId = payload['restaurant_id'] as string
  const name = (payload['name'] as string).trim()

  const { supabaseUrl, serviceKey } = env
  const dbHeaders = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  }

  try {
    const restRes = await fetchFn(
      `${supabaseUrl}/rest/v1/restaurants?select=id&id=eq.${restaurantId}`,
      { headers: dbHeaders },
    )
    if (!restRes.ok) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to verify restaurant' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }
    const restaurants = (await restRes.json()) as Array<{ id: string }>
    if (restaurants.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Restaurant not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }

    const insertRes = await fetchFn(
      `${supabaseUrl}/rest/v1/menus`,
      {
        method: 'POST',
        headers: dbHeaders,
        body: JSON.stringify({ restaurant_id: restaurantId, name }),
      },
    )
    if (!insertRes.ok) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to create menu' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }
    const inserted = (await insertRes.json()) as Array<{ id: string }>

    return new Response(
      JSON.stringify({ success: true, data: { menu_id: inserted[0].id } }),
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
