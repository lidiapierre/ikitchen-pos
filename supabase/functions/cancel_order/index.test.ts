import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handler, corsHeaders } from './index'
import type { HandlerEnv, FetchFn } from './index'

const TEST_ENV: HandlerEnv = {
  supabaseUrl: 'https://example.supabase.co',
  serviceKey: 'test-service-key',
}

const ORDER_ID = 'aaaaaaaa-0000-0000-0000-000000000001'
const RESTAURANT_ID = 'bbbbbbbb-0000-0000-0000-000000000001'
const STAFF_ID = 'cccccccc-0000-0000-0000-000000000001'

function mockOkJson(data: unknown): Response {
  return {
    ok: true,
    json: () => Promise.resolve(data),
  } as unknown as Response
}

function mockOkEmpty(): Response {
  return { ok: true, json: () => Promise.resolve(undefined) } as unknown as Response
}

function mockError(status: number): Response {
  return { ok: false, status, json: () => Promise.resolve({}) } as unknown as Response
}

function buildHappyPathFetch(): FetchFn {
  return vi.fn()
    .mockResolvedValueOnce(mockOkJson([{ id: ORDER_ID, restaurant_id: RESTAURANT_ID, status: 'open' }]))  // GET orders
    .mockResolvedValueOnce(mockOkEmpty())   // PATCH orders (cancel)
    .mockResolvedValueOnce(mockOkEmpty())   // POST audit_log
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('cancel_order handler', () => {
  describe('OPTIONS preflight', () => {
    it('returns 200 with CORS headers', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/cancel_order', {
        method: 'OPTIONS',
      })
      const res = await handler(req)
      expect(res.status).toBe(200)
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe(corsHeaders['Access-Control-Allow-Origin'])
      expect(res.headers.get('Access-Control-Allow-Methods')).toBe(corsHeaders['Access-Control-Allow-Methods'])
    })
  })

  describe('POST — happy path', () => {
    it('returns 200 with success true when reason is provided', async (): Promise<void> => {
      const mockFetch = buildHappyPathFetch()
      const req = new Request('http://localhost/functions/v1/cancel_order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-demo-staff-id': STAFF_ID },
        body: JSON.stringify({ order_id: ORDER_ID, reason: 'Customer request' }),
      })
      const res = await handler(req, mockFetch, TEST_ENV)
      expect(res.status).toBe(200)
      const json = await res.json() as { success: boolean; data: { success: boolean } }
      expect(json.success).toBe(true)
      expect(json.data.success).toBe(true)
    })

    it('includes CORS headers in success response', async (): Promise<void> => {
      const mockFetch = buildHappyPathFetch()
      const req = new Request('http://localhost/functions/v1/cancel_order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: ORDER_ID, reason: 'Customer request' }),
      })
      const res = await handler(req, mockFetch, TEST_ENV)
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
    })

    it('uses SYSTEM_USER_ID when x-demo-staff-id header is absent', async (): Promise<void> => {
      const mockFetch = buildHappyPathFetch()
      const req = new Request('http://localhost/functions/v1/cancel_order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: ORDER_ID, reason: 'Customer request' }),
      })
      await handler(req, mockFetch, TEST_ENV)
      const auditCall = (mockFetch as ReturnType<typeof vi.fn>).mock.calls[2] as [string, RequestInit]
      const body = JSON.parse(auditCall[1].body as string) as { user_id: string }
      expect(body.user_id).toBe('00000000-0000-0000-0000-000000000001')
    })

    it('uses staff ID from x-demo-staff-id header when valid UUID', async (): Promise<void> => {
      const mockFetch = buildHappyPathFetch()
      const req = new Request('http://localhost/functions/v1/cancel_order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-demo-staff-id': STAFF_ID },
        body: JSON.stringify({ order_id: ORDER_ID, reason: 'Customer request' }),
      })
      await handler(req, mockFetch, TEST_ENV)
      const auditCall = (mockFetch as ReturnType<typeof vi.fn>).mock.calls[2] as [string, RequestInit]
      const body = JSON.parse(auditCall[1].body as string) as { user_id: string }
      expect(body.user_id).toBe(STAFF_ID)
    })
  })

  describe('POST — invalid body', () => {
    it('returns 400 when body is malformed JSON', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/cancel_order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not-valid-json',
      })
      const res = await handler(req)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toBe('Invalid request body')
    })

    it('returns 400 when body is null', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/cancel_order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'null',
      })
      const res = await handler(req)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toBe('Invalid request body')
    })
  })

  describe('POST — missing required fields', () => {
    it('returns 400 when reason is absent', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/cancel_order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: ORDER_ID }),
      })
      const res = await handler(req)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toBe('reason is required')
    })

    it('returns 400 when reason is an empty string', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/cancel_order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: ORDER_ID, reason: '' }),
      })
      const res = await handler(req)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toBe('reason is required')
    })

    it('returns 400 when order_id is absent', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/cancel_order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Customer request' }),
      })
      const res = await handler(req)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toBe('order_id is required')
    })

    it('returns 400 when order_id is an empty string', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/cancel_order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: '', reason: 'Customer request' }),
      })
      const res = await handler(req)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toBe('order_id is required')
    })

    it('returns 400 when order_id is a number instead of a string', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/cancel_order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: 123, reason: 'Customer request' }),
      })
      const res = await handler(req)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toBe('order_id is required')
    })

    it('returns 400 when reason is a number instead of a string', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/cancel_order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: ORDER_ID, reason: 42 }),
      })
      const res = await handler(req)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toBe('reason is required')
    })

    it('returns CORS headers on error responses', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/cancel_order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: ORDER_ID }),
      })
      const res = await handler(req)
      expect(res.status).toBe(400)
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
    })
  })

  describe('POST — server configuration', () => {
    it('returns 500 when env is null (no Deno environment)', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/cancel_order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: ORDER_ID, reason: 'Customer request' }),
      })
      const res = await handler(req, fetch, null)
      expect(res.status).toBe(500)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toBe('Server configuration error')
    })
  })

  describe('POST — invalid state transition', () => {
    it('returns 404 when order is not found', async (): Promise<void> => {
      const mockFetch: FetchFn = vi.fn()
        .mockResolvedValueOnce(mockOkJson([]))  // GET orders — empty
      const req = new Request('http://localhost/functions/v1/cancel_order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: ORDER_ID, reason: 'Customer request' }),
      })
      const res = await handler(req, mockFetch, TEST_ENV)
      expect(res.status).toBe(404)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toBe('Order not found')
    })

    it('returns 409 when order is not open', async (): Promise<void> => {
      const mockFetch: FetchFn = vi.fn()
        .mockResolvedValueOnce(mockOkJson([{ id: ORDER_ID, restaurant_id: RESTAURANT_ID, status: 'cancelled' }]))
      const req = new Request('http://localhost/functions/v1/cancel_order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: ORDER_ID, reason: 'Customer request' }),
      })
      const res = await handler(req, mockFetch, TEST_ENV)
      expect(res.status).toBe(409)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toBe('Order is not open')
    })

    it('returns 409 when order is already closed', async (): Promise<void> => {
      const mockFetch: FetchFn = vi.fn()
        .mockResolvedValueOnce(mockOkJson([{ id: ORDER_ID, restaurant_id: RESTAURANT_ID, status: 'closed' }]))
      const req = new Request('http://localhost/functions/v1/cancel_order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: ORDER_ID, reason: 'Customer request' }),
      })
      const res = await handler(req, mockFetch, TEST_ENV)
      expect(res.status).toBe(409)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
    })
  })

  describe('POST — DB failures', () => {
    it('returns 500 when fetching order fails', async (): Promise<void> => {
      const mockFetch: FetchFn = vi.fn()
        .mockResolvedValueOnce(mockError(503))  // GET orders fails
      const req = new Request('http://localhost/functions/v1/cancel_order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: ORDER_ID, reason: 'Customer request' }),
      })
      const res = await handler(req, mockFetch, TEST_ENV)
      expect(res.status).toBe(500)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toBe('Failed to fetch order')
    })

    it('returns 500 when PATCH to cancel order fails', async (): Promise<void> => {
      const mockFetch: FetchFn = vi.fn()
        .mockResolvedValueOnce(mockOkJson([{ id: ORDER_ID, restaurant_id: RESTAURANT_ID, status: 'open' }]))
        .mockResolvedValueOnce(mockError(503))  // PATCH fails
      const req = new Request('http://localhost/functions/v1/cancel_order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: ORDER_ID, reason: 'Customer request' }),
      })
      const res = await handler(req, mockFetch, TEST_ENV)
      expect(res.status).toBe(500)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toBe('Failed to cancel order')
    })
  })

  describe('POST — audit logging', () => {
    it('calls audit_log with correct action, entity_type, and reason payload', async (): Promise<void> => {
      const mockFetch = buildHappyPathFetch()
      const req = new Request('http://localhost/functions/v1/cancel_order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-demo-staff-id': STAFF_ID },
        body: JSON.stringify({ order_id: ORDER_ID, reason: 'Customer left' }),
      })
      await handler(req, mockFetch, TEST_ENV)
      const auditCall = (mockFetch as ReturnType<typeof vi.fn>).mock.calls[2] as [string, RequestInit]
      expect(auditCall[0]).toContain('/audit_log')
      const body = JSON.parse(auditCall[1].body as string) as {
        action: string
        entity_type: string
        entity_id: string
        user_id: string
        restaurant_id: string
        payload: { reason: string }
      }
      expect(body.action).toBe('cancel_order')
      expect(body.entity_type).toBe('orders')
      expect(body.entity_id).toBe(ORDER_ID)
      expect(body.user_id).toBe(STAFF_ID)
      expect(body.restaurant_id).toBe(RESTAURANT_ID)
      expect(body.payload.reason).toBe('Customer left')
    })

    // BUG: architecture §12 requires the action to fail if audit_log insert fails.
    // Currently the audit_log response is not checked, so failures are silently swallowed.
    it.todo('returns 500 and does not return success if audit_log insert fails')
  })

  describe('POST — permission denied', () => {
    // Permission enforcement not yet implemented (dev stub mode per architecture §13)
    it.todo('returns 403 when Authorization header is absent (cancel_order requires manager role)')
    it.todo('returns 403 when caller does not have manager role')
  })

  describe('non-POST/non-OPTIONS methods', () => {
    it('returns 400 for a GET request (no body to parse)', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/cancel_order', {
        method: 'GET',
      })
      const res = await handler(req)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
    })
  })
})
