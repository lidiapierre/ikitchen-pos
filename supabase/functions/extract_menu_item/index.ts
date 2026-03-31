import { verifyAndGetCaller } from '../_shared/auth.ts'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>

export interface HandlerEnv {
  anthropicApiKey: string
  supabaseUrl: string
  serviceKey: string
}

export interface ExtractedMenuItem {
  name?: string
  description?: string
  price?: number
  category?: string
}

type SupportedMediaType = 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf'

const SUPPORTED_IMAGE_TYPES: string[] = ['image/jpeg', 'image/png', 'image/webp']
const SUPPORTED_TYPES: string[] = [...SUPPORTED_IMAGE_TYPES, 'application/pdf']
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB

function readEnv(): HandlerEnv | null {
  const g = globalThis as { Deno?: { env: { get: (key: string) => string | undefined } } }
  if (!g.Deno) return null
  const anthropicApiKey = g.Deno.env.get('ANTHROPIC_API_KEY') ?? ''
  const supabaseUrl = g.Deno.env.get('SUPABASE_URL') ?? ''
  const serviceKey = g.Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!anthropicApiKey || !supabaseUrl || !serviceKey) return null
  return { anthropicApiKey, supabaseUrl, serviceKey }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  })
}

function buildContentBlock(
  fileData: string,
  mediaType: SupportedMediaType,
): Record<string, unknown> {
  if (mediaType === 'application/pdf') {
    return {
      type: 'document',
      source: { type: 'base64', media_type: mediaType, data: fileData },
    }
  }
  return {
    type: 'image',
    source: { type: 'base64', media_type: mediaType, data: fileData },
  }
}

function parseClaudeJson(text: string): ExtractedMenuItem {
  // Strip markdown code fences if present
  const stripped = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
  const parsed = JSON.parse(stripped) as Record<string, unknown>
  const result: ExtractedMenuItem = {}
  if (typeof parsed['name'] === 'string' && parsed['name'].trim() !== '') {
    result.name = parsed['name'].trim()
  }
  if (typeof parsed['description'] === 'string' && parsed['description'].trim() !== '') {
    result.description = parsed['description'].trim()
  }
  if (typeof parsed['price'] === 'number' && parsed['price'] >= 0) {
    result.price = parsed['price']
  }
  if (typeof parsed['category'] === 'string' && parsed['category'].trim() !== '') {
    result.category = parsed['category'].trim()
  }
  return result
}

export async function handler(
  req: Request,
  fetchFn: FetchFn = fetch,
  env: HandlerEnv | null = readEnv(),
): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  // Health check – keeps the function warm (issue #283)
  if (req.method === 'GET' && new URL(req.url).pathname.endsWith('/health')) {
    return new Response(
      JSON.stringify({ ok: true, function: 'extract_menu_item' }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
    )
  }

  if (req.method !== 'POST') {
    return jsonResponse({ success: false, error: 'Method not allowed' }, 405)
  }

  if (!env) {
    return jsonResponse({ success: false, error: 'Server configuration error' }, 500)
  }

  // Verify JWT and check minimum role (owner required for menu item extraction)
  const caller = await verifyAndGetCaller(req, env.supabaseUrl, env.serviceKey, 'owner', fetchFn)
  if ('error' in caller) {
    return jsonResponse({ success: false, error: caller.error }, caller.status)
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ success: false, error: 'Invalid or missing request body' }, 400)
  }

  const payload = body as Record<string, unknown>

  if (typeof payload['file_data'] !== 'string' || payload['file_data'] === '') {
    return jsonResponse({ success: false, error: 'file_data is required (base64-encoded file)' }, 400)
  }
  if (typeof payload['media_type'] !== 'string' || !SUPPORTED_TYPES.includes(payload['media_type'])) {
    return jsonResponse(
      { success: false, error: `media_type must be one of: ${SUPPORTED_TYPES.join(', ')}` },
      400,
    )
  }

  const fileData = payload['file_data'] as string
  const mediaType = payload['media_type'] as SupportedMediaType

  // Approximate base64 size check (base64 is ~4/3 of original)
  const approxBytes = Math.ceil((fileData.length * 3) / 4)
  if (approxBytes > MAX_FILE_SIZE_BYTES) {
    return jsonResponse({ success: false, error: 'File exceeds 10 MB limit' }, 400)
  }

  const contentBlock = buildContentBlock(fileData, mediaType)
  const prompt =
    'You are a restaurant menu data extractor. Analyze this file and extract menu item details.\n\n' +
    'Return ONLY a valid JSON object with these exact fields (omit any field you cannot confidently extract):\n' +
    '{\n' +
    '  "name": "item name",\n' +
    '  "description": "brief description",\n' +
    '  "price": 9.99,\n' +
    '  "category": "menu category name"\n' +
    '}\n\n' +
    'Rules:\n' +
    '- price must be a number (e.g. 9.99, not "£9.99")\n' +
    '- If you cannot confidently determine a field value, omit that field entirely\n' +
    '- Return ONLY the JSON object, no other text or explanation'

  try {
    const claudeRes = await fetchFn('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.anthropicApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 512,
        messages: [
          {
            role: 'user',
            content: [contentBlock, { type: 'text', text: prompt }],
          },
        ],
      }),
    })

    if (!claudeRes.ok) {
      const errText = await claudeRes.text()
      // Log internally but return a safe message
      console.error('Claude API error:', claudeRes.status, errText)
      return jsonResponse(
        { success: false, error: `AI extraction failed (status ${claudeRes.status}). Please fill in the form manually.` },
        502,
      )
    }

    const claudeData = (await claudeRes.json()) as {
      content: Array<{ type: string; text?: string }>
    }

    const textBlock = claudeData.content.find((b) => b.type === 'text')
    if (!textBlock?.text) {
      return jsonResponse(
        { success: false, error: 'AI returned an empty response. Please fill in the form manually.' },
        502,
      )
    }

    let extracted: ExtractedMenuItem
    try {
      extracted = parseClaudeJson(textBlock.text)
    } catch {
      return jsonResponse(
        { success: false, error: 'AI response could not be parsed. Please fill in the form manually.' },
        502,
      )
    }

    return jsonResponse({ success: true, data: extracted })
  } catch {
    return jsonResponse({ success: false, error: 'Internal server error' }, 500)
  }
}

if (typeof (globalThis as { Deno?: unknown }).Deno !== 'undefined') {
  const g = globalThis as { Deno: { serve: (h: (req: Request) => Promise<Response>) => void } }
  g.Deno.serve((req: Request) => handler(req))
}
