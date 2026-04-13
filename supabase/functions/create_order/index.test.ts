import { describe, it, expect, vi } from 'vitest'
import { handler, corsHeaders, type HandlerEnv } from './index'

const TEST_TABLE_ID = '00000000-0000-0000-0000-000000000101'
const TEST_RESTAURANT_ID = '00000000-0000-0000-0000-000000000001'
const TEST_ORDER_ID = '11111111-1111-1111-1111-111111111111'
const TEST_USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

const mockEnv: HandlerEnv = {
  supabaseUrl: 'https://test.supabase.co',
  serviceKey: 'test-service-key',
}

/**
 * Build a mock fetch that handles all Supabase REST/Auth calls used by the handler.
 *
 * Auth flow:
 *   1. GET /auth/v1/user                       → { id: TEST_USER_ID }
 *   2. GET /rest/v1/users?id=eq.TEST_USER_ID…  → [{ role: 'server' }]
 *
 * Data flows (configurable):
 *   - GET /rest/v1/tables?…  → tableRows
 *   - POST /rest/v1/orders   → orderRows
 *   - GET /rest/v1/users?select=restaurant_id… → [{ restaurant_id: TEST_RESTAURANT_ID }]
 */
function makeMockFetch(
  tableRows: unknown[],
  orderRows: unknown[],
): (input: string, init?: RequestInit) => Promise<Response> {
  return vi.fn().mockImplementation((url: string) => {
    // Auth: verify JWT
    if ((url as string).includes('/auth/v1/user')) {
      return Promise.resolve(new Response(JSON.stringify({ id: TEST_USER_ID }), { status: 200 }))
    }
    // Auth: role lookup (contains 'select=role')
    if ((url as string).includes('select=role')) {
      return Promise.resolve(new Response(JSON.stringify([{ role: 'server' }]), { status: 200 }))
    }
    // Restaurant ID lookup for takeaway/delivery (contains 'select=restaurant_id')
    if ((url as string).includes('select=restaurant_id')) {
      return Promise.resolve(new Response(JSON.stringify([{ restaurant_id: TEST_RESTAURANT_ID }]), { status: 200 }))
    }
    // Tables
    if ((url as string).includes('/rest/v1/tables')) {
      return Promise.resolve(new Response(JSON.stringify(tableRows), { status: 200 }))
    }
    // Orders insert
    if ((url as string).includes('/rest/v1/orders')) {
      return Promise.resolve(new Response(JSON.stringify(orderRows), { status: 200 }))
    }
    return Promise.resolve(new Response('[]', { status: 200 }))
  })
}

/** Helper: build an authenticated POST request */
function makeAuthPost(body: unknown): Request {
  return new Request('http://localhost/functions/v1/create_order', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer test-token',
    },
    body: JSON.stringify(body),
  })
}

describe('create_order handler', () => {
  describe('OPTIONS preflight', () => {
    it('returns 200 with CORS headers', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/create_order', {
        method: 'OPTIONS',
      })
      const res = await handler(req)
      expect(res.status).toBe(200)
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe(corsHeaders['Access-Control-Allow-Origin'])
      expect(res.headers.get('Access-Control-Allow-Methods')).toBe(corsHeaders['Access-Control-Allow-Methods'])
    })
  })

  describe('POST — missing env', () => {
    it('returns 500 when env is not configured', async (): Promise<void> => {
      const req = makeAuthPost({ table_id: TEST_TABLE_ID })
      const res = await handler(req, fetch, null)
      expect(res.status).toBe(500)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toBe('Server configuration error')
    })
  })

  describe('POST — authentication', () => {
    it('returns 401 when Authorization header is missing', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/create_order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table_id: TEST_TABLE_ID }),
      })
      const mockFetch = vi.fn().mockResolvedValue(new Response('[]', { status: 200 }))
      const res = await handler(req, mockFetch, mockEnv)
      expect(res.status).toBe(401)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toBe('Unauthorized')
    })
  })

  describe('POST — invalid body', () => {
    it('returns 400 when body is malformed JSON', async (): Promise<void> => {
      const mockFetch = makeMockFetch([], [])
      const req = new Request('http://localhost/functions/v1/create_order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-token' },
        body: 'not-valid-json',
      })
      const res = await handler(req, mockFetch, mockEnv)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toBe('Invalid or missing request body')
    })

    it('returns 400 when body is null', async (): Promise<void> => {
      const mockFetch = makeMockFetch([], [])
      const req = new Request('http://localhost/functions/v1/create_order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-token' },
        body: 'null',
      })
      const res = await handler(req, mockFetch, mockEnv)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toBe('Missing request body')
    })

    it('returns CORS headers even on error responses', async (): Promise<void> => {
      const mockFetch = makeMockFetch([], [])
      const req = new Request('http://localhost/functions/v1/create_order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-token' },
        body: 'bad{json',
      })
      const res = await handler(req, mockFetch, mockEnv)
      expect(res.status).toBe(400)
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
    })
  })

  describe('POST — dine_in (happy path)', () => {
    it('returns 200 with order_id and status open', async (): Promise<void> => {
      const mockFetch = makeMockFetch(
        [{ id: TEST_TABLE_ID, restaurant_id: TEST_RESTAURANT_ID }],
        [{ id: TEST_ORDER_ID, status: 'open' }],
      )
      const req = makeAuthPost({ table_id: TEST_TABLE_ID })
      const res = await handler(req, mockFetch, mockEnv)
      expect(res.status).toBe(200)
      const json = await res.json() as { success: boolean; data: { order_id: string; status: string } }
      expect(json.success).toBe(true)
      expect(json.data.order_id).toBe(TEST_ORDER_ID)
      expect(json.data.status).toBe('open')
    })

    it('includes CORS headers in success response', async (): Promise<void> => {
      const mockFetch = makeMockFetch(
        [{ id: TEST_TABLE_ID, restaurant_id: TEST_RESTAURANT_ID }],
        [{ id: TEST_ORDER_ID, status: 'open' }],
      )
      const req = makeAuthPost({ table_id: TEST_TABLE_ID })
      const res = await handler(req, mockFetch, mockEnv)
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
    })
  })

  describe('POST — dine_in (table not found)', () => {
    it('returns 404 when table does not exist', async (): Promise<void> => {
      const mockFetch = makeMockFetch([], [])
      const req = makeAuthPost({ table_id: TEST_TABLE_ID })
      const res = await handler(req, mockFetch, mockEnv)
      expect(res.status).toBe(404)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toBe('Table not found')
    })
  })

  describe('POST — dine_in (missing required fields)', () => {
    it('returns 400 when table_id is absent', async (): Promise<void> => {
      const mockFetch = makeMockFetch([], [])
      const req = makeAuthPost({})
      const res = await handler(req, mockFetch, mockEnv)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toBe('table_id is required for dine_in orders')
    })

    it('returns 400 when table_id is empty string', async (): Promise<void> => {
      const mockFetch = makeMockFetch([], [])
      const req = makeAuthPost({ table_id: '' })
      const res = await handler(req, mockFetch, mockEnv)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toBe('table_id is required for dine_in orders')
    })
  })

  describe('POST — takeaway (issue #392)', () => {
    const SCHEDULED_TIME = new Date(Date.now() + 3600_000).toISOString()

    it('returns 400 when customer_name is missing', async (): Promise<void> => {
      const mockFetch = makeMockFetch([], [{ id: TEST_ORDER_ID, status: 'open' }])
      const req = makeAuthPost({
        order_type: 'takeaway',
        customer_mobile: '+8801712345678',
        scheduled_time: SCHEDULED_TIME,
      })
      const res = await handler(req, mockFetch, mockEnv)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toBe('customer_name is required for takeaway orders')
    })

    it('returns 400 when customer_name is empty string', async (): Promise<void> => {
      const mockFetch = makeMockFetch([], [{ id: TEST_ORDER_ID, status: 'open' }])
      const req = makeAuthPost({
        order_type: 'takeaway',
        customer_name: '',
        customer_mobile: '+8801712345678',
        scheduled_time: SCHEDULED_TIME,
      })
      const res = await handler(req, mockFetch, mockEnv)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toBe('customer_name is required for takeaway orders')
    })

    it('returns 400 when customer_name is whitespace-only', async (): Promise<void> => {
      const mockFetch = makeMockFetch([], [{ id: TEST_ORDER_ID, status: 'open' }])
      const req = makeAuthPost({
        order_type: 'takeaway',
        customer_name: '   ',
        customer_mobile: '+8801712345678',
        scheduled_time: SCHEDULED_TIME,
      })
      const res = await handler(req, mockFetch, mockEnv)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toBe('customer_name is required for takeaway orders')
    })

    it('returns 400 when customer_mobile is missing', async (): Promise<void> => {
      const mockFetch = makeMockFetch([], [{ id: TEST_ORDER_ID, status: 'open' }])
      const req = makeAuthPost({
        order_type: 'takeaway',
        customer_name: 'Ahmed Khan',
        scheduled_time: SCHEDULED_TIME,
      })
      const res = await handler(req, mockFetch, mockEnv)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toBe('customer_mobile is required for takeaway orders')
    })

    it('returns 400 when customer_mobile is empty string', async (): Promise<void> => {
      const mockFetch = makeMockFetch([], [{ id: TEST_ORDER_ID, status: 'open' }])
      const req = makeAuthPost({
        order_type: 'takeaway',
        customer_name: 'Ahmed Khan',
        customer_mobile: '',
        scheduled_time: SCHEDULED_TIME,
      })
      const res = await handler(req, mockFetch, mockEnv)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toBe('customer_mobile is required for takeaway orders')
    })

    it('returns 400 when customer_mobile is whitespace-only', async (): Promise<void> => {
      const mockFetch = makeMockFetch([], [{ id: TEST_ORDER_ID, status: 'open' }])
      const req = makeAuthPost({
        order_type: 'takeaway',
        customer_name: 'Ahmed Khan',
        customer_mobile: '   ',
        scheduled_time: SCHEDULED_TIME,
      })
      const res = await handler(req, mockFetch, mockEnv)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toBe('customer_mobile is required for takeaway orders')
    })

    it('returns 200 when both customer_name and customer_mobile are provided', async (): Promise<void> => {
      const mockFetch = makeMockFetch([], [{ id: TEST_ORDER_ID, status: 'open' }])
      const req = makeAuthPost({
        order_type: 'takeaway',
        customer_name: 'Ahmed Khan',
        customer_mobile: '+8801712345678',
        scheduled_time: SCHEDULED_TIME,
      })
      const res = await handler(req, mockFetch, mockEnv)
      expect(res.status).toBe(200)
      const json = await res.json() as { success: boolean; data: { order_id: string; status: string } }
      expect(json.success).toBe(true)
      expect(json.data.order_id).toBe(TEST_ORDER_ID)
      expect(json.data.status).toBe('open')
    })

    it('returns 400 when scheduled_time is missing', async (): Promise<void> => {
      const mockFetch = makeMockFetch([], [])
      const req = makeAuthPost({
        order_type: 'takeaway',
        customer_name: 'Ahmed Khan',
        customer_mobile: '+8801712345678',
      })
      const res = await handler(req, mockFetch, mockEnv)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toBe('scheduled_time is required for takeaway and delivery orders')
    })
  })
})
