import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handler, corsHeaders } from './index'
import type { HandlerEnv, FetchFn } from './index'

const TEST_ENV: HandlerEnv = {
  supabaseUrl: 'https://example.supabase.co',
  serviceKey: 'test-service-key',
}

const ORDER_ID = 'aaaaaaaa-0000-0000-0000-000000000001'
const PAYMENT_ID = '33333333-3333-3333-3333-333333333333'

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

/**
 * Happy path: 3 DB calls in order:
 * 1. GET orders — order is open
 * 2. POST payments — returns inserted payment record
 * 3. PATCH orders — close the order
 */
function buildHappyPathFetch(): FetchFn {
  return vi.fn()
    .mockResolvedValueOnce(mockOkJson([{ id: ORDER_ID, status: 'open' }]))
    .mockResolvedValueOnce(mockOkJson([{ id: PAYMENT_ID }]))
    .mockResolvedValueOnce(mockOkEmpty())
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('record_payment handler', () => {
  describe('OPTIONS preflight', () => {
    it('returns 200 with CORS headers', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/record_payment', {
        method: 'OPTIONS',
      })
      const res = await handler(req)
      expect(res.status).toBe(200)
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe(corsHeaders['Access-Control-Allow-Origin'])
      expect(res.headers.get('Access-Control-Allow-Methods')).toBe(corsHeaders['Access-Control-Allow-Methods'])
    })
  })

  describe('POST — happy path', () => {
    it('returns 200 with payment_id from DB and change_due 0 when order_total_cents is absent', async (): Promise<void> => {
      const mockFetch = buildHappyPathFetch()
      const req = new Request('http://localhost/functions/v1/record_payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: ORDER_ID, amount: 2550, method: 'cash' }),
      })
      const res = await handler(req, mockFetch, TEST_ENV)
      expect(res.status).toBe(200)
      const json = await res.json() as { success: boolean; data: { payment_id: string; change_due: number } }
      expect(json.success).toBe(true)
      expect(json.data.payment_id).toBe(PAYMENT_ID)
      expect(json.data.change_due).toBe(0)
    })

    it('returns change_due computed from amount minus order_total_cents for cash', async (): Promise<void> => {
      const mockFetch = buildHappyPathFetch()
      const req = new Request('http://localhost/functions/v1/record_payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: ORDER_ID, amount: 6000, method: 'cash', order_total_cents: 5450 }),
      })
      const res = await handler(req, mockFetch, TEST_ENV)
      expect(res.status).toBe(200)
      const json = await res.json() as { success: boolean; data: { payment_id: string; change_due: number } }
      expect(json.success).toBe(true)
      expect(json.data.change_due).toBe(550)
    })

    it('returns change_due 0 for card even when order_total_cents is provided', async (): Promise<void> => {
      const mockFetch = buildHappyPathFetch()
      const req = new Request('http://localhost/functions/v1/record_payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: ORDER_ID, amount: 5450, method: 'card', order_total_cents: 5450 }),
      })
      const res = await handler(req, mockFetch, TEST_ENV)
      expect(res.status).toBe(200)
      const json = await res.json() as { success: boolean; data: { payment_id: string; change_due: number } }
      expect(json.success).toBe(true)
      expect(json.data.change_due).toBe(0)
    })

    it('returns change_due 0 when amount equals order_total_cents for cash', async (): Promise<void> => {
      const mockFetch = buildHappyPathFetch()
      const req = new Request('http://localhost/functions/v1/record_payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: ORDER_ID, amount: 5000, method: 'cash', order_total_cents: 5000 }),
      })
      const res = await handler(req, mockFetch, TEST_ENV)
      expect(res.status).toBe(200)
      const json = await res.json() as { success: boolean; data: { change_due: number } }
      expect(json.data.change_due).toBe(0)
    })

    it('includes CORS headers in success response', async (): Promise<void> => {
      const mockFetch = buildHappyPathFetch()
      const req = new Request('http://localhost/functions/v1/record_payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: ORDER_ID, amount: 1000, method: 'card' }),
      })
      const res = await handler(req, mockFetch, TEST_ENV)
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
    })

    it('inserts payment with correct order_id, method, and amount_cents', async (): Promise<void> => {
      const mockFetch = buildHappyPathFetch()
      const req = new Request('http://localhost/functions/v1/record_payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: ORDER_ID, amount: 4200, method: 'card' }),
      })
      await handler(req, mockFetch, TEST_ENV)
      const paymentCall = (mockFetch as ReturnType<typeof vi.fn>).mock.calls[1] as [string, RequestInit]
      expect(paymentCall[0]).toContain('/payments')
      const body = JSON.parse(paymentCall[1].body as string) as {
        order_id: string
        method: string
        amount_cents: number
      }
      expect(body.order_id).toBe(ORDER_ID)
      expect(body.method).toBe('card')
      expect(body.amount_cents).toBe(4200)
    })

    it('closes the order after recording payment', async (): Promise<void> => {
      const mockFetch = buildHappyPathFetch()
      const req = new Request('http://localhost/functions/v1/record_payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: ORDER_ID, amount: 1000, method: 'card' }),
      })
      await handler(req, mockFetch, TEST_ENV)
      const closeCall = (mockFetch as ReturnType<typeof vi.fn>).mock.calls[2] as [string, RequestInit]
      expect(closeCall[0]).toContain(`/orders?id=eq.${ORDER_ID}`)
      const body = JSON.parse(closeCall[1].body as string) as { status: string }
      expect(body.status).toBe('closed')
    })
  })

  describe('POST — invalid body', () => {
    it('returns 400 when body is malformed JSON', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/record_payment', {
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
      const req = new Request('http://localhost/functions/v1/record_payment', {
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
    it('returns 400 when order_id is absent', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/record_payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: 10, method: 'cash' }),
      })
      const res = await handler(req)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toBe('order_id is required')
    })

    it('returns 400 when order_id is an empty string', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/record_payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: '', amount: 10, method: 'cash' }),
      })
      const res = await handler(req)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toBe('order_id is required')
    })

    it('returns 400 when amount is absent', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/record_payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: ORDER_ID, method: 'cash' }),
      })
      const res = await handler(req)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toBe('amount is required')
    })

    it('returns 400 when amount is a string instead of a number', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/record_payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: ORDER_ID, amount: '10', method: 'cash' }),
      })
      const res = await handler(req)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toBe('amount is required')
    })

    it('returns 400 when amount is null', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/record_payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: ORDER_ID, amount: null, method: 'cash' }),
      })
      const res = await handler(req)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toBe('amount is required')
    })

    it('returns 400 when method is absent', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/record_payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: ORDER_ID, amount: 10 }),
      })
      const res = await handler(req)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toBe('method is required')
    })

    it('returns 400 when method is an empty string', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/record_payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: ORDER_ID, amount: 10, method: '' }),
      })
      const res = await handler(req)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toBe('method is required')
    })

    it('returns 400 when method is not cash or card', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/record_payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: ORDER_ID, amount: 10, method: 'bitcoin' }),
      })
      const res = await handler(req)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toBe('method must be cash or card')
    })

    it('returns 400 when amount is zero', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/record_payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: ORDER_ID, amount: 0, method: 'cash' }),
      })
      const res = await handler(req)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toBe('amount must be greater than 0')
    })

    it('returns 400 when amount is negative', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/record_payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: ORDER_ID, amount: -10, method: 'cash' }),
      })
      const res = await handler(req)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toBe('amount must be greater than 0')
    })

    it('returns CORS headers on error responses', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/record_payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: 10, method: 'cash' }),
      })
      const res = await handler(req)
      expect(res.status).toBe(400)
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
    })
  })

  describe('POST — server configuration', () => {
    it('returns 500 when env is null (no Deno environment)', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/record_payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: ORDER_ID, amount: 1000, method: 'card' }),
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
      const req = new Request('http://localhost/functions/v1/record_payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: ORDER_ID, amount: 1000, method: 'card' }),
      })
      const res = await handler(req, mockFetch, TEST_ENV)
      expect(res.status).toBe(404)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toBe('Order not found')
    })

    it('returns 409 when order is not open', async (): Promise<void> => {
      const mockFetch: FetchFn = vi.fn()
        .mockResolvedValueOnce(mockOkJson([{ id: ORDER_ID, status: 'closed' }]))
      const req = new Request('http://localhost/functions/v1/record_payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: ORDER_ID, amount: 1000, method: 'card' }),
      })
      const res = await handler(req, mockFetch, TEST_ENV)
      expect(res.status).toBe(409)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toBe('Order is not open')
    })

    it('returns 409 when order is already cancelled', async (): Promise<void> => {
      const mockFetch: FetchFn = vi.fn()
        .mockResolvedValueOnce(mockOkJson([{ id: ORDER_ID, status: 'cancelled' }]))
      const req = new Request('http://localhost/functions/v1/record_payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: ORDER_ID, amount: 1000, method: 'card' }),
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
        .mockResolvedValueOnce(mockError(503))
      const req = new Request('http://localhost/functions/v1/record_payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: ORDER_ID, amount: 1000, method: 'card' }),
      })
      const res = await handler(req, mockFetch, TEST_ENV)
      expect(res.status).toBe(500)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toBe('Failed to fetch order')
    })

    it('returns 500 when inserting payment fails', async (): Promise<void> => {
      const mockFetch: FetchFn = vi.fn()
        .mockResolvedValueOnce(mockOkJson([{ id: ORDER_ID, status: 'open' }]))
        .mockResolvedValueOnce(mockError(503))
      const req = new Request('http://localhost/functions/v1/record_payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: ORDER_ID, amount: 1000, method: 'card' }),
      })
      const res = await handler(req, mockFetch, TEST_ENV)
      expect(res.status).toBe(500)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toBe('Failed to record payment')
    })

    it('returns 500 when closing order fails', async (): Promise<void> => {
      const mockFetch: FetchFn = vi.fn()
        .mockResolvedValueOnce(mockOkJson([{ id: ORDER_ID, status: 'open' }]))
        .mockResolvedValueOnce(mockOkJson([{ id: PAYMENT_ID }]))
        .mockResolvedValueOnce(mockError(503))
      const req = new Request('http://localhost/functions/v1/record_payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: ORDER_ID, amount: 1000, method: 'card' }),
      })
      const res = await handler(req, mockFetch, TEST_ENV)
      expect(res.status).toBe(500)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toBe('Failed to close order')
    })
  })

  describe('POST — audit logging', () => {
    // BUG: architecture §12 requires record_payment to emit an audit log entry.
    // Currently no audit log call is made in record_payment.
    it.todo('inserts an audit_log row on successful record_payment')
    it.todo('returns 500 and does not return success if audit_log insert fails')
  })

  describe('POST — permission denied', () => {
    // Permission enforcement not yet implemented (dev stub mode per architecture §13)
    it.todo('returns 403 when Authorization header is absent')
    it.todo('returns 403 when caller does not have sufficient role')
  })

  describe('non-POST/non-OPTIONS methods', () => {
    it('returns 400 for a GET request (no body to parse)', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/record_payment', {
        method: 'GET',
      })
      const res = await handler(req)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
    })
  })
})
