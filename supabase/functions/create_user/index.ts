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

const VALID_ROLES = ['manager', 'server', 'kitchen'] as const
type StaffRole = (typeof VALID_ROLES)[number]

/**
 * Roles that the caller must have to create a given role.
 * owner → can create manager / server / kitchen
 * manager → can create server / kitchen only
 */
export function canCreateRole(callerRole: string, targetRole: string): boolean {
  if (callerRole === 'owner') return VALID_ROLES.includes(targetRole as StaffRole)
  if (callerRole === 'manager') return targetRole === 'server' || targetRole === 'kitchen'
  return false
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
      JSON.stringify({ ok: true, function: 'create_user' }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
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

  // --- input validation ---
  if (typeof payload['email'] !== 'string' || !(payload['email'] as string).includes('@')) {
    return new Response(
      JSON.stringify({ success: false, error: 'email is required and must be valid' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }
  if (typeof payload['role'] !== 'string' || !VALID_ROLES.includes(payload['role'] as StaffRole)) {
    return new Response(
      JSON.stringify({ success: false, error: `role must be one of: ${VALID_ROLES.join(', ')}` }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }
  if (typeof payload['restaurant_id'] !== 'string' || payload['restaurant_id'] === '') {
    return new Response(
      JSON.stringify({ success: false, error: 'restaurant_id is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }
  if (typeof payload['caller_role'] !== 'string') {
    return new Response(
      JSON.stringify({ success: false, error: 'caller_role is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }

  const email = (payload['email'] as string).trim().toLowerCase()
  const role = payload['role'] as StaffRole
  const restaurantId = payload['restaurant_id'] as string
  const callerRole = payload['caller_role'] as string
  const name = typeof payload['name'] === 'string' ? payload['name'].trim() || null : null

  // --- role hierarchy check ---
  if (!canCreateRole(callerRole, role)) {
    return new Response(
      JSON.stringify({
        success: false,
        error: `A ${callerRole} cannot create a ${role} account`,
      }),
      { status: 403, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }

  if (!env) {
    return new Response(
      JSON.stringify({ success: false, error: 'Server configuration error' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }

  const { supabaseUrl, serviceKey } = env
  const authHeaders = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  }

  // --- invite user via Supabase Auth Admin API ---
  // POST /auth/v1/invite creates the user (if not exists) and sends a magic-link invite email
  const inviteRes = await fetchFn(`${supabaseUrl}/auth/v1/invite`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      email,
      data: name ? { name } : {},
    }),
  })

  if (!inviteRes.ok) {
    const errBody = await inviteRes.json().catch(() => ({})) as Record<string, unknown>
    const errMsg = (errBody['msg'] ?? errBody['message'] ?? 'Failed to create auth account') as string
    return new Response(
      JSON.stringify({ success: false, error: errMsg }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }

  const authUser = (await inviteRes.json()) as { id: string }

  // --- insert into users table ---
  const dbHeaders = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  }

  const insertRes = await fetchFn(`${supabaseUrl}/rest/v1/users`, {
    method: 'POST',
    headers: dbHeaders,
    body: JSON.stringify({
      id: authUser.id,
      restaurant_id: restaurantId,
      email,
      name,
      role,
      is_active: true,
    }),
  })

  if (!insertRes.ok) {
    // Rollback: delete the auth user we just created
    await fetchFn(`${supabaseUrl}/auth/v1/admin/users/${authUser.id}`, {
      method: 'DELETE',
      headers: authHeaders,
    }).catch(() => undefined)

    return new Response(
      JSON.stringify({ success: false, error: 'Failed to create user profile' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }

  const rows = (await insertRes.json()) as Array<{
    id: string
    email: string
    name: string | null
    role: string
    is_active: boolean
    created_at: string
  }>

  if (!rows || rows.length === 0) {
    return new Response(
      JSON.stringify({ success: false, error: 'User creation returned no data' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }

  return new Response(
    JSON.stringify({ success: true, data: { user: rows[0] } }),
    { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
  )
}

if (typeof (globalThis as { Deno?: unknown }).Deno !== 'undefined') {
  const g = globalThis as { Deno: { serve: (h: (req: Request) => Promise<Response>) => void } }
  g.Deno.serve((req: Request) => handler(req))
}
