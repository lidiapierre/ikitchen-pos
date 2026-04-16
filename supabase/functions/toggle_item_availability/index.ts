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

  // Health check – keeps the function warm (issue #283)
  if (req.method === 'GET' && new URL(req.url).pathname.endsWith('/health')) {
    return new Response(
      JSON.stringify({ ok: true, function: 'toggle_item_availability' }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }

  if (!env) {
    return new Response(
      JSON.stringify({ success: false, error: 'Server configuration error' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }

  // Verify JWT and check minimum role (owner required for availability management)
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

  if (typeof payload['menu_item_id'] !== 'string' || payload['menu_item_id'] === '') {
    return new Response(
      JSON.stringify({ success: false, error: 'menu_item_id is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }

  if (typeof payload['available'] !== 'boolean') {
    return new Response(
      JSON.stringify({ success: false, error: 'available must be a boolean' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }

  const menuItemId = payload['menu_item_id'] as string
  const available = payload['available'] as boolean

  const { supabaseUrl, serviceKey } = env
  const dbHeaders = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  }

  try {
    // ── Step 1: resolve the restaurant that owns this menu_item ─────────────
    const itemRes = await fetchFn(
      `${supabaseUrl}/rest/v1/menu_items?id=eq.${menuItemId}&select=id,menu:menus!inner(restaurant_id)`,
      { method: 'GET', headers: dbHeaders },
    )
    if (!itemRes.ok) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to resolve menu item' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }
    const itemRows = await itemRes.json() as Array<{ id: string; menu: { restaurant_id: string } }>
    if (!Array.isArray(itemRows) || itemRows.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Item not found or access denied' }),
        { status: 403, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }
    const restaurantId = itemRows[0].menu.restaurant_id

    // ── Step 2: verify the caller has access to that restaurant ─────────────
    // Note: users.restaurant_id is the primary user-restaurant link for MVP.
    // user_restaurants is a future multi-location junction table not yet in use.
    const ownerRes = await fetchFn(
      `${supabaseUrl}/rest/v1/users?id=eq.${caller.actorId}&restaurant_id=eq.${restaurantId}&select=id&limit=1`,
      { method: 'GET', headers: dbHeaders },
    )
    if (!ownerRes.ok) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to verify ownership' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }
    const ownerRows = await ownerRes.json() as Array<{ id: string }>
    if (!Array.isArray(ownerRows) || ownerRows.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Item not found or access denied' }),
        { status: 403, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }

    // ── Step 3: ownership confirmed — apply the update ─────────────────────
    const patchRes = await fetchFn(
      `${supabaseUrl}/rest/v1/menu_items?id=eq.${menuItemId}`,
      {
        method: 'PATCH',
        headers: { ...dbHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({ available }),
      },
    )

    if (!patchRes.ok) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to update item availability' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
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
