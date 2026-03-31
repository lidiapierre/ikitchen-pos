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
      JSON.stringify({ ok: true, function: 'delete_menu' }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
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
  if (typeof payload['menu_id'] !== 'string' || payload['menu_id'] === '') {
    return new Response(
      JSON.stringify({ success: false, error: 'menu_id is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }

  const menuId = payload['menu_id'] as string
  // actor_id comes from the verified JWT — no more x-demo-staff-id header
  const userId = caller.actorId

  const { supabaseUrl, serviceKey } = env
  const dbHeaders = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  }

  try {
    const menuRes = await fetchFn(
      `${supabaseUrl}/rest/v1/menus?select=id,restaurant_id&id=eq.${menuId}`,
      { headers: dbHeaders },
    )
    if (!menuRes.ok) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch menu' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }
    const menus = (await menuRes.json()) as Array<{ id: string; restaurant_id: string }>
    if (menus.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Menu not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }
    const restaurantId = menus[0].restaurant_id

    const itemsRes = await fetchFn(
      `${supabaseUrl}/rest/v1/menu_items?select=id&menu_id=eq.${menuId}&limit=1`,
      { headers: dbHeaders },
    )
    if (!itemsRes.ok) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to check menu items' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }
    const items = (await itemsRes.json()) as Array<{ id: string }>
    if (items.length > 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Cannot delete a menu that still has items' }),
        { status: 409, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }

    const deleteRes = await fetchFn(
      `${supabaseUrl}/rest/v1/menus?id=eq.${menuId}`,
      {
        method: 'DELETE',
        headers: { ...dbHeaders, Prefer: 'return=minimal' },
      },
    )
    if (!deleteRes.ok) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to delete menu' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }

    await fetchFn(
      `${supabaseUrl}/rest/v1/audit_log`,
      {
        method: 'POST',
        headers: { ...dbHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({
          restaurant_id: restaurantId,
          user_id: userId,
          action: 'delete_menu',
          entity_type: 'menus',
          entity_id: menuId,
          payload: {},
        }),
      },
    )

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
