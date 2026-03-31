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
  name: string
  description?: string
  price?: number
  category?: string
}

type SupportedMediaType = 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf'

const SUPPORTED_IMAGE_TYPES: string[] = ['image/jpeg', 'image/png', 'image/webp']
const SUPPORTED_TYPES: string[] = [...SUPPORTED_IMAGE_TYPES, 'application/pdf']
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB
const MAX_FILES = 5

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

function parseClaudeJsonArray(text: string): ExtractedMenuItem[] {
  // Strip markdown code fences if present
  const stripped = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
  const parsed = JSON.parse(stripped) as unknown[]
  if (!Array.isArray(parsed)) {
    throw new Error('Expected a JSON array')
  }
  const results: ExtractedMenuItem[] = []
  for (const item of parsed) {
    if (typeof item !== 'object' || item === null) continue
    const obj = item as Record<string, unknown>
    if (typeof obj['name'] !== 'string' || obj['name'].trim() === '') continue
    const extracted: ExtractedMenuItem = { name: obj['name'].trim() }
    if (typeof obj['description'] === 'string' && obj['description'].trim() !== '') {
      extracted.description = obj['description'].trim()
    }
    if (typeof obj['price'] === 'number' && obj['price'] >= 0) {
      extracted.price = obj['price']
    }
    if (typeof obj['category'] === 'string' && obj['category'].trim() !== '') {
      extracted.category = obj['category'].trim()
    }
    results.push(extracted)
  }
  return results
}

const PROMPT =
  'You are a restaurant menu data extractor. Analyze this menu and extract ALL menu items you can find.\n\n' +
  'Return ONLY a valid JSON array. Each element must have these exact fields (omit any field you cannot confidently extract):\n' +
  '[\n' +
  '  {\n' +
  '    "name": "item name",\n' +
  '    "description": "brief description",\n' +
  '    "price": 9.99,\n' +
  '    "category": "category or section name"\n' +
  '  }\n' +
  ']\n\n' +
  'Rules:\n' +
  '- price must be a number (not a string with currency symbols)\n' +
  '- Include every single item visible in the menu\n' +
  '- category should be the section name (e.g. "Starters", "Mains", "Desserts")\n' +
  '- Return ONLY the JSON array, nothing else'

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
      JSON.stringify({ ok: true, function: 'extract_menu_bulk' }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
    )
  }

  if (req.method !== 'POST') {
    return jsonResponse({ success: false, error: 'Method not allowed' }, 405)
  }

  if (!env) {
    return jsonResponse({ success: false, error: 'Server configuration error' }, 500)
  }

  // Verify JWT — minimum role: server
  const caller = await verifyAndGetCaller(req, env.supabaseUrl, env.serviceKey, 'server', fetchFn)
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

  if (!Array.isArray(payload['files']) || payload['files'].length === 0) {
    return jsonResponse({ success: false, error: 'files array is required and must not be empty' }, 400)
  }

  const files = payload['files'] as Array<Record<string, unknown>>

  if (files.length > MAX_FILES) {
    return jsonResponse({ success: false, error: `Maximum ${MAX_FILES} files allowed` }, 400)
  }

  // Validate each file
  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    if (typeof file['data'] !== 'string' || file['data'] === '') {
      return jsonResponse({ success: false, error: `files[${i}].data is required (base64-encoded)` }, 400)
    }
    if (typeof file['media_type'] !== 'string' || !SUPPORTED_TYPES.includes(file['media_type'])) {
      return jsonResponse(
        { success: false, error: `files[${i}].media_type must be one of: ${SUPPORTED_TYPES.join(', ')}` },
        400,
      )
    }
    const approxBytes = Math.ceil((file['data'].length * 3) / 4)
    if (approxBytes > MAX_FILE_SIZE_BYTES) {
      return jsonResponse({ success: false, error: `files[${i}] exceeds 10 MB limit` }, 400)
    }
  }

  // Build content blocks for all files
  const contentBlocks: Array<Record<string, unknown>> = files.map((file) =>
    buildContentBlock(file['data'] as string, file['media_type'] as SupportedMediaType),
  )

  // Add prompt as final text block
  contentBlocks.push({ type: 'text', text: PROMPT })

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
        max_tokens: 4096,
        messages: [
          {
            role: 'user',
            content: contentBlocks,
          },
        ],
      }),
    })

    if (!claudeRes.ok) {
      const errText = await claudeRes.text()
      console.error('Claude API error:', claudeRes.status, errText)
      return jsonResponse(
        { success: false, error: `AI extraction failed (status ${claudeRes.status}).` },
        502,
      )
    }

    const claudeData = (await claudeRes.json()) as {
      content: Array<{ type: string; text?: string }>
    }

    const textBlock = claudeData.content.find((b) => b.type === 'text')
    if (!textBlock?.text) {
      return jsonResponse(
        { success: false, error: 'AI returned an empty response.' },
        502,
      )
    }

    let items: ExtractedMenuItem[]
    try {
      items = parseClaudeJsonArray(textBlock.text)
    } catch {
      return jsonResponse(
        { success: false, error: 'AI response could not be parsed as a JSON array.' },
        502,
      )
    }

    return jsonResponse({ success: true, items })
  } catch {
    return jsonResponse({ success: false, error: 'Internal server error' }, 500)
  }
}

if (typeof (globalThis as { Deno?: unknown }).Deno !== 'undefined') {
  const g = globalThis as { Deno: { serve: (h: (req: Request) => Promise<Response>) => void } }
  g.Deno.serve((req: Request) => handler(req))
}
