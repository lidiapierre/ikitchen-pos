const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-demo-staff-id',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req: Request): Promise<Response> => {
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
  if (typeof payload['order_id'] !== 'string' || payload['order_id'] === '') {
    return new Response(
      JSON.stringify({ success: false, error: 'order_id is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }
  if (typeof payload['amount'] !== 'number') {
    return new Response(
      JSON.stringify({ success: false, error: 'amount is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }
  if ((payload['amount'] as number) <= 0) {
    return new Response(
      JSON.stringify({ success: false, error: 'amount must be greater than 0' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }
  if (typeof payload['method'] !== 'string' || payload['method'] === '') {
    return new Response(
      JSON.stringify({ success: false, error: 'method is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }
  if (payload['method'] !== 'cash' && payload['method'] !== 'card') {
    return new Response(
      JSON.stringify({ success: false, error: 'method must be cash or card' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }

  const orderTotalCents = typeof payload['order_total_cents'] === 'number' ? payload['order_total_cents'] as number : null
  const changeDue = orderTotalCents !== null && payload['method'] === 'cash'
    ? Math.max(0, (payload['amount'] as number) - orderTotalCents)
    : 0

  return new Response(
    JSON.stringify({ success: true, data: { payment_id: crypto.randomUUID(), change_due: changeDue } }),
    { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
  )
})
