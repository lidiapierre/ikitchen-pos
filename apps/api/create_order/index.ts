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
  if (typeof payload['table_id'] !== 'number') {
    return new Response(
      JSON.stringify({ success: false, error: 'table_id is required and must be a number' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }
  if (typeof payload['staff_id'] !== 'string' || payload['staff_id'] === '') {
    return new Response(
      JSON.stringify({ success: false, error: 'staff_id is required and must be a non-empty string' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }

  return new Response(
    JSON.stringify({ success: true, data: { order_id: crypto.randomUUID(), status: 'open' } }),
    { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
  )
}

Deno.serve(handler)
