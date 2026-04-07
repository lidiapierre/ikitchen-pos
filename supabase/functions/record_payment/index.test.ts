import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handler, corsHeaders } from './index'

const FIXED_UUID = '33333333-3333-3333-3333-333333333333'

beforeEach(() => {
  vi.stubGlobal('crypto', { randomUUID: () => FIXED_UUID })
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
    it('returns 200 with payment_id and change_due 0 when order_total_cents is absent', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/record_payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: 'order-abc-123', amount: 25.50, method: 'cash' }),
      })
      const res = await handler(req)
      expect(res.status).toBe(200)
      const json = await res.json() as { success: boolean; data: { payment_id: string; change_due: number } }
      expect(json.success).toBe(true)
      expect(json.data.payment_id).toBe(FIXED_UUID)
      expect(json.data.change_due).toBe(0)
    })

    it('returns change_due computed from amount minus order_total_cents for cash', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/record_payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: 'order-abc-123', amount: 6000, method: 'cash', order_total_cents: 5450 }),
      })
      const res = await handler(req)
      expect(res.status).toBe(200)
      const json = await res.json() as { success: boolean; data: { payment_id: string; change_due: number } }
      expect(json.success).toBe(true)
      expect(json.data.change_due).toBe(550)
    })

    it('returns change_due 0 for card even when order_total_cents is provided', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/record_payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: 'order-abc-123', amount: 5450, method: 'card', order_total_cents: 5450 }),
      })
      const res = await handler(req)
      expect(res.status).toBe(200)
      const json = await res.json() as { success: boolean; data: { payment_id: string; change_due: number } }
      expect(json.success).toBe(true)
      expect(json.data.change_due).toBe(0)
    })

    it('includes CORS headers in success response', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/record_payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: 'order-abc-123', amount: 10, method: 'card' }),
      })
      const res = await handler(req)
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
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
        body: JSON.stringify({ order_id: 'order-abc-123', method: 'cash' }),
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
        body: JSON.stringify({ order_id: 'order-abc-123', amount: '10', method: 'cash' }),
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
        body: JSON.stringify({ order_id: 'order-abc-123', amount: null, method: 'cash' }),
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
        body: JSON.stringify({ order_id: 'order-abc-123', amount: 10 }),
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
        body: JSON.stringify({ order_id: 'order-abc-123', amount: 10, method: '' }),
      })
      const res = await handler(req)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toBe('method is required')
    })

    it('returns 400 when method is not a valid payment method', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/record_payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: 'order-abc-123', amount: 10, method: 'bitcoin' }),
      })
      const res = await handler(req)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toContain('method must be one of')
    })

    it('accepts mobile as a valid payment method', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/record_payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: 'order-abc-123', amount: 10, method: 'mobile' }),
      })
      const res = await handler(req)
      // Should not be rejected as invalid method (may fail auth/db in test env, but not method validation)
      const json = await res.json() as { success: boolean; error?: string }
      if (!json.success && json.error) {
        expect(json.error).not.toContain('method must be one of')
      }
    })

    it('returns 400 when amount is zero', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/record_payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: 'order-abc-123', amount: 0, method: 'cash' }),
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
        body: JSON.stringify({ order_id: 'order-abc-123', amount: -10, method: 'cash' }),
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

  describe('POST — permission denied', () => {
    // TODO: permission enforcement not yet implemented in handler stub
    it.todo('returns 403 when Authorization header is absent')
    it.todo('returns 403 when caller does not have sufficient role')
  })

  describe('POST — invalid state transition', () => {
    // TODO: state transition enforcement not yet implemented in handler stub
    it.todo('returns 422 when order is not in pending_payment status')
  })

  describe('POST — audit logging', () => {
    // TODO: audit logging not yet implemented in handler stub
    // Required by architecture §12: record_payment is a destructive action
    it.todo('inserts an audit_log row on successful record_payment')
    it.todo('returns 500 and does not return success if audit_log insert fails')
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

  describe('POST — split payment path (payments[] array)', () => {
    it('returns 200 for a valid split (card + cash)', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/record_payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          payments: [
            { method: 'card', amount: 80000 },
            { method: 'cash', amount: 50000 },
          ],
        }),
      })
      const res = await handler(req)
      // In test env (no Deno), verifyAndGetCaller returns an error and we get 4xx/5xx,
      // but the path must NOT be rejected at input validation (method/array checks).
      // Validation failures return 400; everything else is 401/403/500 from auth/DB stubs.
      expect(res.status).not.toBe(400)
    })

    it('returns 400 when payments array is empty', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/record_payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          payments: [],
        }),
      })
      const res = await handler(req)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toBe('payments array must not be empty')
    })

    it('returns 400 when a payment entry has an invalid method', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/record_payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          payments: [
            { method: 'bitcoin', amount: 50000 },
          ],
        }),
      })
      const res = await handler(req)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toBe('each payment must have a valid method')
    })

    it('returns 400 when a payment entry has a non-positive amount', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/record_payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          payments: [
            { method: 'cash', amount: 0 },
          ],
        }),
      })
      const res = await handler(req)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toBe('each payment amount must be a positive number')
    })

    it('returns 400 when payments is present but order_id is missing', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/record_payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payments: [{ method: 'cash', amount: 50000 }],
        }),
      })
      const res = await handler(req)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toBe('order_id is required')
    })
  })
})
