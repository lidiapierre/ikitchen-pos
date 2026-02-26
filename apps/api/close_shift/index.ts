Deno.serve(async (req: Request): Promise<Response> => {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return new Response(
      JSON.stringify({ success: false, error: 'Invalid or missing request body' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    )
  }

  if (!body) {
    return new Response(
      JSON.stringify({ success: false, error: 'Missing request body' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    )
  }

  return new Response(
    JSON.stringify({ success: false, error: 'Not implemented' }),
    { status: 501, headers: { 'Content-Type': 'application/json' } },
  )
})
