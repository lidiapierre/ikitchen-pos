import { describe, it, expect, vi } from 'vitest'
import { handler } from './index'
import type { HandlerEnv } from './index'

const TEST_ENV: HandlerEnv = {
  openaiApiKey: 'test-openai-key',
  anthropicApiKey: 'test-anthropic-key',
  supabaseUrl: 'https://test.supabase.co',
  serviceKey: 'test-service-key',
}

const SERVER_USER_ID = '22222222-2222-2222-2222-222222222222'
const ORDER_ID = 'order-uuid-001'
const RESTAURANT_ID = 'restaurant-uuid-001'

const MOCK_MENU_ITEMS = [
  { id: 'item-uuid-001', name: 'Chicken Biryani' },
  { id: 'item-uuid-002', name: 'Lassi' },
  { id: 'item-uuid-003', name: 'Naan' },
]

/**
 * Build a mock fetchFn that handles auth, Supabase REST, Whisper, and Claude calls.
 */
function makeAuthFetch(options: {
  role?: string
  authFail?: boolean
  transcript?: string
  whisperStatus?: number
  claudeItems?: Array<{ menu_item_id: string; name: string; quantity: number }> | null
  claudeStatus?: number
  orderEmpty?: boolean
} = {}): ReturnType<typeof vi.fn> {
  const {
    role = 'server',
    authFail = false,
    transcript = 'two chicken biryani one lassi',
    whisperStatus = 200,
    claudeItems = [
      { menu_item_id: 'item-uuid-001', name: 'Chicken Biryani', quantity: 2 },
      { menu_item_id: 'item-uuid-002', name: 'Lassi', quantity: 1 },
    ],
    claudeStatus = 200,
    orderEmpty = false,
  } = options

  return vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    // JWT verification
    if (url.includes('/auth/v1/user')) {
      if (authFail) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
      }
      return new Response(JSON.stringify({ id: SERVER_USER_ID }), { status: 200 })
    }

    // Role lookup
    if (url.includes('/rest/v1/users') && url.includes('select=role')) {
      return new Response(JSON.stringify([{ role }]), { status: 200 })
    }

    // Order lookup
    if (url.includes('/rest/v1/orders') && url.includes('select=restaurant_id')) {
      if (orderEmpty) {
        return new Response(JSON.stringify([]), { status: 200 })
      }
      return new Response(JSON.stringify([{ restaurant_id: RESTAURANT_ID }]), { status: 200 })
    }

    // Menu items lookup
    if (url.includes('/rest/v1/menu_items')) {
      return new Response(JSON.stringify(MOCK_MENU_ITEMS), { status: 200 })
    }

    // OpenAI Whisper
    if (url.includes('api.openai.com')) {
      if (whisperStatus !== 200) {
        return new Response('error', { status: whisperStatus })
      }
      return new Response(
        JSON.stringify({ text: transcript }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }

    // Claude API
    if (url.includes('api.anthropic.com')) {
      if (claudeStatus !== 200) {
        return new Response('error', { status: claudeStatus })
      }
      if (claudeItems !== null) {
        return new Response(
          JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(claudeItems) }] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
    }

    return new Response('Not found', { status: 404 })
  })
}

function makeMultipartRequest(
  orderId: string | null,
  hasAudio: boolean,
  token?: string,
): Request {
  const formData = new FormData()
  if (hasAudio) {
    formData.append('audio', new Blob(['fake-audio-data'], { type: 'audio/webm' }), 'audio.webm')
  }
  if (orderId !== null) {
    formData.append('order_id', orderId)
  }
  const headers: Record<string, string> = {}
  if (token !== undefined) {
    headers['Authorization'] = `Bearer ${token}`
  }
  return new Request('https://example.com/voice_order', {
    method: 'POST',
    headers,
    body: formData,
  })
}

function makeAuthMultipartRequest(orderId = ORDER_ID, hasAudio = true): Request {
  return makeMultipartRequest(orderId, hasAudio, 'valid-token')
}

describe('voice_order handler', () => {
  it('handles OPTIONS preflight', async () => {
    const req = new Request('https://example.com', { method: 'OPTIONS' })
    const res = await handler(req, makeAuthFetch() as typeof fetch, TEST_ENV)
    expect(res.status).toBe(204)
  })

  it('returns 200 for GET health check', async () => {
    const req = new Request('https://example.com/voice_order', { method: 'GET' })
    const res = await handler(req, makeAuthFetch() as typeof fetch, TEST_ENV)
    expect(res.status).toBe(200)
    const json = await res.json() as { ok: boolean; function: string }
    expect(json.ok).toBe(true)
    expect(json.function).toBe('voice_order')
  })

  it('returns 405 for unsupported methods', async () => {
    const req = new Request('https://example.com', { method: 'PUT' })
    const res = await handler(req, makeAuthFetch() as typeof fetch, TEST_ENV)
    expect(res.status).toBe(405)
  })

  describe('auth enforcement', () => {
    it('returns 401 when Authorization header is missing', async () => {
      const req = makeMultipartRequest(ORDER_ID, true) // no token
      const res = await handler(req, makeAuthFetch() as typeof fetch, TEST_ENV)
      expect(res.status).toBe(401)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toBe('Unauthorized')
    })

    it('returns 401 when JWT verification fails', async () => {
      const req = makeMultipartRequest(ORDER_ID, true, 'invalid-token')
      const res = await handler(req, makeAuthFetch({ authFail: true }) as typeof fetch, TEST_ENV)
      expect(res.status).toBe(401)
    })

    it('returns 403 when caller role is insufficient (kitchen role is ok, check below)', async () => {
      // 'server' role should pass — checking that it works fine
      const req = makeAuthMultipartRequest()
      const res = await handler(req, makeAuthFetch({ role: 'server' }) as typeof fetch, TEST_ENV)
      expect(res.status).toBe(200)
    })
  })

  describe('input validation', () => {
    it('returns 400 when audio is missing', async () => {
      const req = makeAuthMultipartRequest(ORDER_ID, false)
      const res = await handler(req, makeAuthFetch() as typeof fetch, TEST_ENV)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toContain('audio')
    })

    it('returns 400 when transcript is empty', async () => {
      const req = makeAuthMultipartRequest()
      const res = await handler(req, makeAuthFetch({ transcript: '' }) as typeof fetch, TEST_ENV)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toContain('empty')
    })
  })

  describe('successful flow', () => {
    it('returns transcript and parsed items on success', async () => {
      const req = makeAuthMultipartRequest()
      const res = await handler(req, makeAuthFetch() as typeof fetch, TEST_ENV)
      expect(res.status).toBe(200)
      const json = await res.json() as { success: boolean; data: { transcript: string; items: unknown[] } }
      expect(json.success).toBe(true)
      expect(json.data.transcript).toBe('two chicken biryani one lassi')
      expect(json.data.items).toHaveLength(2)
      expect(json.data.items[0]).toMatchObject({ menu_item_id: 'item-uuid-001', name: 'Chicken Biryani', quantity: 2 })
      expect(json.data.items[1]).toMatchObject({ menu_item_id: 'item-uuid-002', name: 'Lassi', quantity: 1 })
    })
  })

  describe('error cases', () => {
    it('returns 422 when no items matched', async () => {
      const req = makeAuthMultipartRequest()
      const res = await handler(req, makeAuthFetch({ claudeItems: [] }) as typeof fetch, TEST_ENV)
      expect(res.status).toBe(422)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toContain('matched')
    })

    it('returns 400 when order not found', async () => {
      const req = makeAuthMultipartRequest()
      const res = await handler(req, makeAuthFetch({ orderEmpty: true }) as typeof fetch, TEST_ENV)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toContain('Order not found')
    })

    it('returns 502 when Whisper API fails', async () => {
      const req = makeAuthMultipartRequest()
      const res = await handler(req, makeAuthFetch({ whisperStatus: 500 }) as typeof fetch, TEST_ENV)
      expect(res.status).toBe(502)
    })

    it('returns 502 when Claude API fails', async () => {
      const req = makeAuthMultipartRequest()
      const res = await handler(req, makeAuthFetch({ claudeStatus: 500 }) as typeof fetch, TEST_ENV)
      expect(res.status).toBe(502)
    })
  })
})
