import { describe, it, expect, vi } from 'vitest'
import { handler, corsHeaders, type HandlerEnv } from './index'

const TEST_ORDER_ITEM_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const TEST_RESTAURANT_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'

const mockEnv: HandlerEnv = {
  supabaseUrl: 'https://test.supabase.co',
  serviceKey: 'test-service-key',
}

const mockAuth = {
  actorId: 'user-123',
  role: 'server',
}

// Mock verifyAndGetCaller to avoid real auth
vi.mock('../_shared/auth.ts', () => ({
  verifyAndGetCaller: vi.fn().mockResolvedValue(mockAuth),
}))

/** Build a fetch mock that handles the two-step ownership check + PATCH */
function makeAccessFetch(opts: {
  itemExists?: boolean
  accessGranted?: boolean
  patchStatus?: number
} = {}): (input: string, init?: RequestInit) => Promise<Response> {
  const { itemExists = true, accessGranted = true, patchStatus = 204 } = opts

  return vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    const method = (init?.method ?? 'GET').toUpperCase()

    // Step 1: resolve order_item → restaurant_id via order
    if (method === 'GET' && (url as string).includes('/order_items')) {
      const body = itemExists
        ? JSON.stringify([{ id: TEST_ORDER_ITEM_ID, order: { restaurant_id: TEST_RESTAURANT_ID } }])
        : JSON.stringify([])
      return Promise.resolve(new Response(body, { status: 200 }))
    }

    // Step 2: verify access via user_restaurants
    if (method === 'GET' && (url as string).includes('/user_restaurants')) {
      const body = accessGranted
        ? JSON.stringify([{ user_id: mockAuth.actorId }])
        : JSON.stringify([])
      return Promise.resolve(new Response(body, { status: 200 }))
    }

    // Step 3: PATCH
    if (method === 'PATCH') {
      return Promise.resolve(new Response(null, { status: patchStatus }))
    }

    return Promise.resolve(new Response('[]', { status: 200 }))
  })
}

function makeAuthRequest(body: unknown): Request {
  return new Request('http://localhost/functions/v1/update_order_item_notes', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-jwt' },
    body: JSON.stringify(body),
  })
}

describe('update_order_item_notes handler', () => {
  describe('OPTIONS preflight', () => {
    it('returns 204 with CORS headers', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/update_order_item_notes', {
        method: 'OPTIONS',
      })
      const res = await handler(req)
      expect(res.status).toBe(204)
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
      expect(res.headers.get('Access-Control-Allow-Methods')).toContain('PATCH')
    })
  })

  describe('GET /health', () => {
    it('returns ok:true', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/update_order_item_notes/health', {
        method: 'GET',
      })
      const res = await handler(req)
      expect(res.status).toBe(200)
      const json = await res.json() as { ok: boolean; function: string }
      expect(json.ok).toBe(true)
      expect(json.function).toBe('update_order_item_notes')
    })
  })

  describe('PATCH — missing env', () => {
    it('returns 500 when env is null', async (): Promise<void> => {
      const req = makeAuthRequest({ order_item_id: TEST_ORDER_ITEM_ID, notes: 'no onions' })
      const res = await handler(req, fetch, null)
      expect(res.status).toBe(500)
      const json = await res.json() as { success: boolean }
      expect(json.success).toBe(false)
    })
  })

  describe('PATCH — validation', () => {
    it('returns 400 when order_item_id is missing', async (): Promise<void> => {
      const req = makeAuthRequest({ notes: 'no onions' })
      const res = await handler(req, makeAccessFetch(), mockEnv)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toMatch(/order_item_id/)
    })

    it('returns 400 when order_item_id is empty string', async (): Promise<void> => {
      const req = makeAuthRequest({ order_item_id: '', notes: 'no onions' })
      const res = await handler(req, makeAccessFetch(), mockEnv)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toMatch(/order_item_id/)
    })

    it('returns 400 when notes is not a string or null', async (): Promise<void> => {
      const req = makeAuthRequest({ order_item_id: TEST_ORDER_ITEM_ID, notes: 123 })
      const res = await handler(req, makeAccessFetch(), mockEnv)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toMatch(/notes/)
    })

    it('returns 400 when body is not JSON', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/update_order_item_notes', {
        method: 'PATCH',
        headers: { Authorization: 'Bearer test-jwt' },
        body: 'not json',
      })
      const res = await handler(req, makeAccessFetch(), mockEnv)
      expect(res.status).toBe(400)
    })
  })

  describe('PATCH — happy path', () => {
    it('returns 200 success when setting a note', async (): Promise<void> => {
      const req = makeAuthRequest({ order_item_id: TEST_ORDER_ITEM_ID, notes: 'no onions' })
      const res = await handler(req, makeAccessFetch(), mockEnv)
      expect(res.status).toBe(200)
      const json = await res.json() as { success: boolean }
      expect(json.success).toBe(true)
    })

    it('returns 200 success when clearing a note (null)', async (): Promise<void> => {
      const req = makeAuthRequest({ order_item_id: TEST_ORDER_ITEM_ID, notes: null })
      const res = await handler(req, makeAccessFetch(), mockEnv)
      expect(res.status).toBe(200)
      const json = await res.json() as { success: boolean }
      expect(json.success).toBe(true)
    })

    it('returns 200 success when clearing a note (empty string)', async (): Promise<void> => {
      const req = makeAuthRequest({ order_item_id: TEST_ORDER_ITEM_ID, notes: '' })
      const res = await handler(req, makeAccessFetch(), mockEnv)
      expect(res.status).toBe(200)
      const json = await res.json() as { success: boolean }
      expect(json.success).toBe(true)
    })

    it('queries user_restaurants with the caller actorId', async (): Promise<void> => {
      const mockFetch = makeAccessFetch()
      const req = makeAuthRequest({ order_item_id: TEST_ORDER_ITEM_ID, notes: 'extra spicy' })
      await handler(req, mockFetch, mockEnv)
      const calls = (mockFetch as ReturnType<typeof vi.fn>).mock.calls as [string, RequestInit][]
      const accessCall = calls.find(([url]) => url.includes('/user_restaurants'))
      expect(accessCall).toBeDefined()
      expect(accessCall![0]).toContain(mockAuth.actorId)
      expect(accessCall![0]).toContain(TEST_RESTAURANT_ID)
    })

    it('includes CORS headers in success response', async (): Promise<void> => {
      const req = makeAuthRequest({ order_item_id: TEST_ORDER_ITEM_ID, notes: 'no onions' })
      const res = await handler(req, makeAccessFetch(), mockEnv)
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe(corsHeaders['Access-Control-Allow-Origin'])
    })
  })

  describe('PATCH — DB failure', () => {
    it('returns 500 when PATCH fails', async (): Promise<void> => {
      const mockFetch = makeAccessFetch({ patchStatus: 500 })
      const req = makeAuthRequest({ order_item_id: TEST_ORDER_ITEM_ID, notes: 'no onions' })
      const res = await handler(req, mockFetch, mockEnv)
      expect(res.status).toBe(500)
      const json = await res.json() as { success: boolean }
      expect(json.success).toBe(false)
    })
  })

  describe('PATCH — access check', () => {
    it('returns 403 when order item does not exist', async (): Promise<void> => {
      const mockFetch = makeAccessFetch({ itemExists: false })
      const req = makeAuthRequest({ order_item_id: TEST_ORDER_ITEM_ID, notes: 'no onions' })
      const res = await handler(req, mockFetch, mockEnv)
      expect(res.status).toBe(403)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toMatch(/access denied/)
    })

    it('returns 403 when caller does not have access to the restaurant', async (): Promise<void> => {
      const mockFetch = makeAccessFetch({ accessGranted: false })
      const req = makeAuthRequest({ order_item_id: TEST_ORDER_ITEM_ID, notes: 'no onions' })
      const res = await handler(req, mockFetch, mockEnv)
      expect(res.status).toBe(403)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toMatch(/access denied/)
    })
  })
})
