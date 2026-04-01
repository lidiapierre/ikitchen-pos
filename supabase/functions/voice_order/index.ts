import { verifyAndGetCaller } from '../_shared/auth.ts'
import { validateVoiceOrderInput } from './validator.ts'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-demo-staff-id',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>

export interface HandlerEnv {
  openaiApiKey: string
  anthropicApiKey: string
  supabaseUrl: string
  serviceKey: string
}

export interface VoiceOrderItem {
  menu_item_id: string
  name: string
  quantity: number
}

export interface VoiceOrderResult {
  transcript: string
  items: VoiceOrderItem[]
}

function readEnv(): HandlerEnv | null {
  const g = globalThis as { Deno?: { env: { get: (key: string) => string | undefined } } }
  if (!g.Deno) return null
  const openaiApiKey = g.Deno.env.get('OPENAI_API_KEY') ?? ''
  const anthropicApiKey = g.Deno.env.get('ANTHROPIC_API_KEY') ?? ''
  const supabaseUrl = g.Deno.env.get('SUPABASE_URL') ?? ''
  const serviceKey = g.Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!openaiApiKey || !anthropicApiKey || !supabaseUrl || !serviceKey) return null
  return { openaiApiKey, anthropicApiKey, supabaseUrl, serviceKey }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  })
}

function parseClaudeJson(text: string): VoiceOrderItem[] {
  // Strip markdown code fences if present
  const stripped = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
  const parsed = JSON.parse(stripped) as unknown[]
  if (!Array.isArray(parsed)) {
    throw new Error('Expected JSON array')
  }
  return parsed.map((item) => {
    const obj = item as Record<string, unknown>
    return {
      menu_item_id: String(obj['menu_item_id'] ?? ''),
      name: String(obj['name'] ?? ''),
      quantity: typeof obj['quantity'] === 'number' ? obj['quantity'] : Number(obj['quantity'] ?? 1),
    }
  }).filter((item) => item.menu_item_id !== '' && item.quantity > 0)
}

export async function handler(
  req: Request,
  fetchFn: FetchFn = fetch,
  env: HandlerEnv | null = readEnv(),
): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  // Health check
  if (req.method === 'GET') {
    return new Response(
      JSON.stringify({ ok: true, function: 'voice_order' }),
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

  // Parse multipart form
  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return jsonResponse({ success: false, error: 'Invalid multipart form data' }, 400)
  }

  const validation = validateVoiceOrderInput(formData)
  if ('error' in validation) {
    return jsonResponse({ success: false, error: validation.error }, validation.status)
  }
  const { audioBlob: audioEntry, orderId } = validation

  // Step 1: Transcribe audio with OpenAI Whisper
  const whisperForm = new FormData()
  whisperForm.append('file', audioEntry, 'audio.webm')
  whisperForm.append('model', 'whisper-1')
  whisperForm.append('language', 'en')

  let transcript: string
  try {
    const whisperRes = await fetchFn('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.openaiApiKey}`,
      },
      body: whisperForm,
    })

    if (!whisperRes.ok) {
      return jsonResponse(
        { success: false, error: `Transcription failed (status ${whisperRes.status})` },
        502,
      )
    }

    const whisperData = (await whisperRes.json()) as { text?: string }
    transcript = (whisperData.text ?? '').trim()
  } catch {
    return jsonResponse({ success: false, error: 'Transcription service unavailable' }, 502)
  }

  if (transcript === '') {
    return jsonResponse({ success: false, error: 'Transcript is empty — please speak clearly and try again' }, 400)
  }

  // Step 2: Fetch menu items for the restaurant via order_id
  let menuItems: Array<{ id: string; name: string }>
  try {
    // Get restaurant_id from the order
    const orderRes = await fetchFn(
      `${env.supabaseUrl}/rest/v1/orders?id=eq.${orderId}&select=restaurant_id`,
      {
        headers: {
          Authorization: `Bearer ${env.serviceKey}`,
          apikey: env.serviceKey,
          'Content-Type': 'application/json',
        },
      },
    )

    if (!orderRes.ok) {
      return jsonResponse({ success: false, error: 'Failed to fetch order' }, 502)
    }

    const orders = (await orderRes.json()) as Array<{ restaurant_id: string }>
    if (orders.length === 0) {
      return jsonResponse({ success: false, error: 'Order not found' }, 400)
    }

    const restaurantId = orders[0].restaurant_id

    // Get available menu items for the restaurant
    const menuRes = await fetchFn(
      `${env.supabaseUrl}/rest/v1/menu_items?restaurant_id=eq.${restaurantId}&available=eq.true&select=id,name`,
      {
        headers: {
          Authorization: `Bearer ${env.serviceKey}`,
          apikey: env.serviceKey,
          'Content-Type': 'application/json',
        },
      },
    )

    if (!menuRes.ok) {
      return jsonResponse({ success: false, error: 'Failed to fetch menu items' }, 502)
    }

    menuItems = (await menuRes.json()) as Array<{ id: string; name: string }>
  } catch {
    return jsonResponse({ success: false, error: 'Failed to fetch menu data' }, 502)
  }

  if (menuItems.length === 0) {
    return jsonResponse({ success: false, error: 'No menu items available' }, 422)
  }

  // Step 3: Parse transcript with Claude
  const menuList = menuItems.map((item) => JSON.stringify({ id: item.id, name: item.name })).join(', ')
  const prompt =
    `Given this list of menu items: [${menuList}], and this spoken order transcript:\n` +
    `<transcript>${transcript}</transcript>\n` +
    'return a JSON array of matched items with quantities. Use fuzzy matching for item names. ' +
    'Format: [{"menu_item_id": "...", "name": "...", "quantity": N}]. ' +
    'Only include items that clearly match something in the menu. ' +
    'Return ONLY the JSON array, no other text or explanation.'

  let parsedItems: VoiceOrderItem[]
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
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    })

    if (!claudeRes.ok) {
      return jsonResponse(
        { success: false, error: `Item parsing failed (status ${claudeRes.status})` },
        502,
      )
    }

    const claudeData = (await claudeRes.json()) as {
      content: Array<{ type: string; text?: string }>
    }

    const textBlock = claudeData.content.find((b) => b.type === 'text')
    if (!textBlock?.text) {
      return jsonResponse({ success: false, error: 'AI returned an empty response' }, 502)
    }

    parsedItems = parseClaudeJson(textBlock.text)
  } catch {
    return jsonResponse({ success: false, error: 'Failed to parse order items' }, 502)
  }

  if (parsedItems.length === 0) {
    return jsonResponse(
      { success: false, error: 'No menu items matched the spoken order' },
      422,
    )
  }

  const result: VoiceOrderResult = { transcript, items: parsedItems }
  return jsonResponse({ success: true, data: result })
}

if (typeof (globalThis as { Deno?: unknown }).Deno !== 'undefined') {
  const g = globalThis as { Deno: { serve: (h: (req: Request) => Promise<Response>) => void } }
  g.Deno.serve((req: Request) => handler(req))
}
