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
  if (typeof payload['staff_id'] !== 'string' || payload['staff_id'] === '') {
    return new Response(
      JSON.stringify({ success: false, error: 'staff_id is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }
  if (typeof payload['opening_float'] !== 'number') {
    return new Response(
      JSON.stringify({ success: false, error: 'opening_float is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }

  const staffId = payload['staff_id'] as string
  if (!isValidUuid(staffId)) {
    return new Response(
      JSON.stringify({ success: false, error: 'staff_id must be a valid UUID' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }
  const openingFloat = payload['opening_float'] as number

  if (!env) {
    return new Response(
      JSON.stringify({ success: false, error: 'Server configuration error' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }

  const { supabaseUrl, serviceKey } = env
  const dbHeaders = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  }

  try {
    // 1. Look up user to get restaurant_id
    const userRes = await fetchFn(
      `${supabaseUrl}/rest/v1/users?select=id,restaurant_id&id=eq.${staffId}`,
      { headers: dbHeaders },
    )
    if (!userRes.ok) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch user' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }
    const users = (await userRes.json()) as Array<{ id: string; restaurant_id: string }>
    if (users.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'User not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }
    const restaurantId = users[0].restaurant_id

    // 2. Guard against duplicate open shifts
    const openShiftRes = await fetchFn(
      `${supabaseUrl}/rest/v1/shifts?select=id&user_id=eq.${staffId}&closed_at=is.null`,
      { headers: { ...dbHeaders, Prefer: 'count=none' } },
    )
    if (!openShiftRes.ok) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to check existing shifts' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }
    const openShifts = (await openShiftRes.json()) as Array<{ id: string }>
    if (openShifts.length > 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'User already has an open shift' }),
        { status: 409, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }

    // 3. Insert row into shifts, persisting opening_float_cents
    const insertRes = await fetchFn(
      `${supabaseUrl}/rest/v1/shifts`,
      {
        method: 'POST',
        headers: dbHeaders,
        body: JSON.stringify({
          restaurant_id: restaurantId,
          user_id: staffId,
          opening_float_cents: openingFloat,
        }),
      },
    )
    if (!insertRes.ok) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to open shift' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }
    const inserted = (await insertRes.json()) as Array<{ id: string; opened_at: string }>
    const shift = inserted[0]

    // 4. Emit audit log entry
    const auditRes = await fetchFn(
      `${supabaseUrl}/rest/v1/audit_log`,
      {
        method: 'POST',
        headers: { ...dbHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({
          restaurant_id: restaurantId,
          user_id: staffId,
          action: 'open_shift',
          entity_type: 'shifts',
          entity_id: shift.id,
          payload: { opening_float_cents: openingFloat },
        }),
      },
    )
    if (!auditRes.ok) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to write audit log' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }

    return new Response(
      JSON.stringify({ success: true, data: { shift_id: shift.id, started_at: shift.opened_at } }),
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
