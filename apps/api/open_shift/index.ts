export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders })
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

  return new Response(
    JSON.stringify({ success: true, data: { shift_id: crypto.randomUUID(), started_at: new Date().toISOString() } }),
    { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
  )
}

if (typeof (globalThis as { Deno?: unknown }).Deno !== 'undefined') {
  Deno.serve(handler)
}
