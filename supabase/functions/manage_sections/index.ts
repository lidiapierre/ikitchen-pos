import { verifyAndGetCaller } from '../_shared/auth.ts'

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-demo-staff-id',
  'Access-Control-Allow-Methods': 'POST, PATCH, DELETE, GET, OPTIONS',
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

function jsonRes(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
}

/**
 * Look up the caller's restaurant_id from the users table.
 */
async function getCallerRestaurantId(
  actorId: string,
  supabaseUrl: string,
  serviceKey: string,
  fetchFn: FetchFn,
): Promise<string | null> {
  const res = await fetchFn(
    `${supabaseUrl}/rest/v1/users?select=restaurant_id&id=eq.${encodeURIComponent(actorId)}&limit=1`,
    { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
  )
  if (!res.ok) return null
  const users = (await res.json()) as Array<{ restaurant_id: string }>
  return users.length > 0 ? users[0].restaurant_id : null
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
    return jsonRes({ ok: true, function: 'manage_sections' }, 200)
  }
  if (!env) {
    return jsonRes({ success: false, error: 'Server configuration error' }, 500)
  }

  const caller = await verifyAndGetCaller(req, env.supabaseUrl, env.serviceKey, 'manager', fetchFn)
  if ('error' in caller) {
    return jsonRes({ success: false, error: caller.error }, caller.status)
  }

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return jsonRes({ success: false, error: 'Invalid or missing request body' }, 400)
  }

  const { supabaseUrl, serviceKey } = env
  const dbHeaders = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  }

  // Look up caller's restaurant_id — used for all operations
  const callerRestaurantId = await getCallerRestaurantId(caller.actorId, supabaseUrl, serviceKey, fetchFn)
  if (!callerRestaurantId) {
    return jsonRes({ success: false, error: 'Could not determine caller restaurant' }, 403)
  }

  try {
    if (req.method === 'POST') {
      const name = typeof body['name'] === 'string' ? body['name'].trim() : ''
      if (!name) return jsonRes({ success: false, error: 'name is required' }, 400)

      // Use caller's restaurant_id, NOT from request body
      const payload: Record<string, unknown> = { name, restaurant_id: callerRestaurantId }
      if (typeof body['grid_cols'] === 'number') payload['grid_cols'] = body['grid_cols']
      if (typeof body['grid_rows'] === 'number') payload['grid_rows'] = body['grid_rows']

      const res = await fetchFn(`${supabaseUrl}/rest/v1/sections`, {
        method: 'POST',
        headers: dbHeaders,
        body: JSON.stringify(payload),
      })
      if (!res.ok) return jsonRes({ success: false, error: 'Failed to create section' }, 500)
      const rows = (await res.json()) as Array<Record<string, unknown>>
      return jsonRes({ success: true, data: rows[0] ?? null }, 200)
    }

    if (req.method === 'PATCH') {
      const sectionId = typeof body['section_id'] === 'string' ? body['section_id'] : ''
      if (!sectionId) return jsonRes({ success: false, error: 'section_id is required' }, 400)

      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (typeof body['name'] === 'string' && body['name'].trim()) updates['name'] = body['name'].trim()
      if (typeof body['assigned_server_id'] === 'string' || body['assigned_server_id'] === null) {
        updates['assigned_server_id'] = body['assigned_server_id']
      }
      if (typeof body['grid_cols'] === 'number') updates['grid_cols'] = body['grid_cols']
      if (typeof body['grid_rows'] === 'number') updates['grid_rows'] = body['grid_rows']
      if (typeof body['sort_order'] === 'number') updates['sort_order'] = body['sort_order']

      // Filter by both section_id AND caller's restaurant_id
      const res = await fetchFn(
        `${supabaseUrl}/rest/v1/sections?id=eq.${encodeURIComponent(sectionId)}&restaurant_id=eq.${encodeURIComponent(callerRestaurantId)}`,
        { method: 'PATCH', headers: dbHeaders, body: JSON.stringify(updates) },
      )
      if (!res.ok) return jsonRes({ success: false, error: 'Failed to update section' }, 500)
      const rows = (await res.json()) as Array<Record<string, unknown>>
      if (rows.length === 0) return jsonRes({ success: false, error: 'Section not found or access denied' }, 404)
      return jsonRes({ success: true, data: rows[0] ?? null }, 200)
    }

    if (req.method === 'DELETE') {
      const sectionId = typeof body['section_id'] === 'string' ? body['section_id'] : ''
      if (!sectionId) return jsonRes({ success: false, error: 'section_id is required' }, 400)

      // Verify section belongs to caller's restaurant before deleting
      const checkRes = await fetchFn(
        `${supabaseUrl}/rest/v1/sections?select=id&id=eq.${encodeURIComponent(sectionId)}&restaurant_id=eq.${encodeURIComponent(callerRestaurantId)}&limit=1`,
        { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
      )
      if (!checkRes.ok) return jsonRes({ success: false, error: 'Failed to verify section' }, 500)
      const found = (await checkRes.json()) as Array<{ id: string }>
      if (found.length === 0) return jsonRes({ success: false, error: 'Section not found or access denied' }, 404)

      // Delete (FK ON DELETE SET NULL handles table unassignment)
      const res = await fetchFn(
        `${supabaseUrl}/rest/v1/sections?id=eq.${encodeURIComponent(sectionId)}&restaurant_id=eq.${encodeURIComponent(callerRestaurantId)}`,
        { method: 'DELETE', headers: dbHeaders },
      )
      if (!res.ok) return jsonRes({ success: false, error: 'Failed to delete section' }, 500)

      // Audit log — best effort
      await fetchFn(`${supabaseUrl}/rest/v1/audit_log`, {
        method: 'POST',
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({
          restaurant_id: callerRestaurantId,
          user_id: caller.actorId,
          action: 'delete_section',
          entity_type: 'sections',
          entity_id: sectionId,
          payload: {},
        }),
      })

      return jsonRes({ success: true }, 200)
    }

    return jsonRes({ success: false, error: `Method ${req.method} not allowed` }, 405)
  } catch {
    return jsonRes({ success: false, error: 'Internal server error' }, 500)
  }
}

if (typeof (globalThis as { Deno?: unknown }).Deno !== 'undefined') {
  const g = globalThis as { Deno: { serve: (h: (req: Request) => Promise<Response>) => void } }
  g.Deno.serve((req: Request) => handler(req))
}
