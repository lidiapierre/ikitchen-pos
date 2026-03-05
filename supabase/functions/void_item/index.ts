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
  if (typeof payload['order_item_id'] !== 'string' || payload['order_item_id'] === '') {
    return new Response(
      JSON.stringify({ success: false, error: 'order_item_id is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }
  if (typeof payload['reason'] !== 'string' || payload['reason'] === '') {
    return new Response(
      JSON.stringify({ success: false, error: 'reason is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }

  return new Response(
    JSON.stringify({ success: true, data: { success: true, order_total: 0 } }),
    { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
  )
}

if (typeof (globalThis as { Deno?: unknown }).Deno !== 'undefined') {
  Deno.serve(handler)
}
