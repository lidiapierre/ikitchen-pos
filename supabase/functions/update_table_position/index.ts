import { verifyAndGetCaller } from '../_shared/auth.ts'

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-demo-staff-id',
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
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  // Health check – keeps the function warm
  if (req.method === 'GET' && new URL(req.url).pathname.endsWith('/health')) {
    return new Response(
      JSON.stringify({ ok: true, function: 'update_table_position' }),
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

  // grid_x/grid_y must be non-negative integers or null
  const rawX = payload['grid_x']
  const rawY = payload['grid_y']

  if (rawX !== null && rawX !== undefined) {
    if (typeof rawX !== 'number' || !Number.isInteger(rawX) || rawX < 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'grid_x must be a non-negative integer or null' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }
  }

  if (rawY !== null && rawY !== undefined) {
    if (typeof rawY !== 'number' || !Number.isInteger(rawY) || rawY < 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'grid_y must be a non-negative integer or null' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }
  }

  const tableId = payload['table_id'] as string
  const gridX = (rawX === undefined ? null : rawX) as number | null
  const gridY = (rawY === undefined ? null : rawY) as number | null

  // Atomicity: grid_x and grid_y must be set together (both non-null or both null)
  if ((gridX === null) !== (gridY === null)) {
    return new Response(
      JSON.stringify({ success: false, error: 'grid_x and grid_y must be set together' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }

  const { supabaseUrl, serviceKey } = env
  const baseHeaders = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  }

  // Resolve restaurant_id from the table and verify caller owns it
  let restaurantId: string
  try {
    const tableRes = await fetchFn(
      `${supabaseUrl}/rest/v1/tables?id=eq.${tableId}&select=id,restaurant_id`,
      { headers: baseHeaders },
    )
    if (!tableRes.ok) {
      return new Response(
        JSON.stringify({ success: false, error: 'Table not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }
    const tableRows = await tableRes.json() as Array<{ id: string; restaurant_id: string }>
    if (!tableRows || tableRows.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Table not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }
    restaurantId = tableRows[0].restaurant_id
  } catch {
    return new Response(
      JSON.stringify({ success: false, error: 'Failed to resolve table' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }

  // Verify caller belongs to that restaurant
  try {
    const ownerRes = await fetchFn(
      `${supabaseUrl}/rest/v1/user_restaurants?user_id=eq.${caller.actorId}&restaurant_id=eq.${restaurantId}&select=user_id`,
      { headers: baseHeaders },
    )
    if (!ownerRes.ok) {
      return new Response(
        JSON.stringify({ success: false, error: 'Forbidden' }),
        { status: 403, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }
    const ownerRows = await ownerRes.json() as Array<unknown>
    if (!ownerRows || ownerRows.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Forbidden' }),
        { status: 403, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }
  } catch {
    return new Response(
      JSON.stringify({ success: false, error: 'Failed to verify ownership' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }

  try {
    const patchRes = await fetchFn(
      `${supabaseUrl}/rest/v1/tables?id=eq.${tableId}&restaurant_id=eq.${restaurantId}`,
      {
        method: 'PATCH',
        headers: { ...baseHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({ grid_x: gridX, grid_y: gridY }),
      },
    )

    if (!patchRes.ok) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to update table position' }),
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
