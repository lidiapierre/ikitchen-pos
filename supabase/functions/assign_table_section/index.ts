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

function jsonRes(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
}

export async function handler(
  req: Request,
  fetchFn: FetchFn = fetch,
  env: HandlerEnv | null = readEnv(),
): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders })
  }
  if (req.method === 'GET' && new URL(req.url).pathname.endsWith('/health')) {
    return jsonRes({ ok: true, function: 'assign_table_section' }, 200)
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

  const tableId = typeof body['table_id'] === 'string' ? body['table_id'] : ''
  if (!tableId) return jsonRes({ success: false, error: 'table_id is required' }, 400)

  const sectionId = body['section_id']
  if (sectionId !== null && typeof sectionId !== 'string') {
    return jsonRes({ success: false, error: 'section_id must be a string or null' }, 400)
  }

  const { supabaseUrl, serviceKey } = env
  const dbHeaders = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  }

  try {
    const res = await fetchFn(
      `${supabaseUrl}/rest/v1/tables?id=eq.${encodeURIComponent(tableId)}`,
      { method: 'PATCH', headers: dbHeaders, body: JSON.stringify({ section_id: sectionId }) },
    )
    if (!res.ok) return jsonRes({ success: false, error: 'Failed to assign table to section' }, 500)
    const rows = (await res.json()) as Array<Record<string, unknown>>
    return jsonRes({ success: true, data: rows[0] ?? null }, 200)
  } catch {
    return jsonRes({ success: false, error: 'Internal server error' }, 500)
  }
}

if (typeof (globalThis as { Deno?: unknown }).Deno !== 'undefined') {
  const g = globalThis as { Deno: { serve: (h: (req: Request) => Promise<Response>) => void } }
  g.Deno.serve((req: Request) => handler(req))
}
