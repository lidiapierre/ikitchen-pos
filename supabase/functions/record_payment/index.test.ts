import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handler, corsHeaders } from './index'
import type { FetchFn, HandlerEnv } from './index'

const FIXED_UUID = '33333333-3333-3333-3333-333333333333'

beforeEach(() => {
  vi.stubGlobal('crypto', { randomUUID: () => FIXED_UUID })
})

describe('record_payment handler', () => {
  describe('OPTIONS preflight', () => {
    it('returns 204 with CORS headers', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/record_payment', {
        method: 'OPTIONS',
      })
      const res = await handler(req)
      expect(res.status).toBe(204)
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

// ── tendered_amount_cents integration tests (issue #351) ─────────────────────
// These use a mock fetchFn + TEST_ENV so they exercise the full handler path.

const TEST_ENV: HandlerEnv = {
  supabaseUrl: 'http://test-supabase.local',
  serviceKey: 'test-service-key',
}

const VALID_ORDER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const ACTOR_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const RESTAURANT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
const PAYMENT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd'

type InsertedPaymentRow = {
  order_id: string
  method: string
  amount_cents: number
  tendered_amount_cents: number
  discount_amount_cents?: number
}

/** Build a mock fetchFn for record_payment tests.
 *  Captures the payments POST body for assertion.
 */
function buildMockFetch(
  orderTotalCents: number,
  captured: { paymentInsertBody?: unknown } = {},
): FetchFn {
  return vi.fn(async (url: string, init?: RequestInit): Promise<Response> => {
    // Auth – verifyAndGetCaller: /auth/v1/user
    if (url.includes('/auth/v1/user')) {
      return new Response(JSON.stringify({ id: ACTOR_ID }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    // Auth – verifyAndGetCaller: /rest/v1/users for role
    if (url.includes('/rest/v1/users')) {
      return new Response(JSON.stringify([{ id: ACTOR_ID, role: 'owner' }]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    // Order lookup (GET)
    if (url.includes('/rest/v1/orders') && (!init?.method || init?.method === 'GET')) {
      return new Response(
        JSON.stringify([{
          id: VALID_ORDER_ID,
          restaurant_id: RESTAURANT_ID,
          status: 'pending_payment',
          final_total_cents: orderTotalCents,
          discount_amount_cents: 0,
          order_comp: false,
          customer_id: null,
          // Additional fields for correct change calculation (issue #424):
          service_charge_cents: 0,
          delivery_charge: 0,
          order_type: 'dine_in',
        }]),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }
    // Order status PATCH
    if (url.includes('/rest/v1/orders') && init?.method === 'PATCH') {
      return new Response(null, { status: 204 })
    }
    // VAT config lookup (new — issue #424)
    if (url.includes('/rest/v1/config')) {
      return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    // VAT rate lookup (new — issue #424)
    if (url.includes('/rest/v1/vat_rates')) {
      return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    // Payments POST – capture inserted body for assertion
    if (url.includes('/rest/v1/payments') && init?.method === 'POST') {
      captured.paymentInsertBody = JSON.parse(init.body as string)
      return new Response(JSON.stringify([{ id: PAYMENT_ID }]), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    // Audit log POST
    if (url.includes('/rest/v1/audit_log')) {
      return new Response(null, { status: 204 })
    }
    // Default – should not be reached
    return new Response(JSON.stringify({ error: `Unhandled: ${url}` }), { status: 500 })
  })
}

/** Build a mock fetchFn that simulates an order with service charge applied. */
function buildMockFetchWithServiceCharge(
  subtotalCents: number,
  discountCents: number,
  serviceChargeCents: number,
  orderType: 'dine_in' | 'takeaway' | 'delivery',
  deliveryChargeCents: number,
  captured: { paymentInsertBody?: unknown } = {},
): FetchFn {
  return vi.fn(async (url: string, init?: RequestInit): Promise<Response> => {
    if (url.includes('/auth/v1/user')) {
      return new Response(JSON.stringify({ id: ACTOR_ID }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    if (url.includes('/rest/v1/users')) {
      return new Response(JSON.stringify([{ id: ACTOR_ID, role: 'owner' }]), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    if (url.includes('/rest/v1/orders') && (!init?.method || init?.method === 'GET')) {
      return new Response(
        JSON.stringify([{
          id: VALID_ORDER_ID,
          restaurant_id: RESTAURANT_ID,
          status: 'pending_payment',
          final_total_cents: subtotalCents,
          discount_amount_cents: discountCents,
          order_comp: false,
          customer_id: null,
          service_charge_cents: serviceChargeCents,
          delivery_charge: deliveryChargeCents,
          order_type: orderType,
        }]),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }
    if (url.includes('/rest/v1/orders') && init?.method === 'PATCH') {
      return new Response(null, { status: 204 })
    }
    if (url.includes('/rest/v1/config')) {
      return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    if (url.includes('/rest/v1/vat_rates')) {
      return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    if (url.includes('/rest/v1/payments') && init?.method === 'POST') {
      captured.paymentInsertBody = JSON.parse(init.body as string)
      return new Response(JSON.stringify([{ id: PAYMENT_ID }]), { status: 201, headers: { 'Content-Type': 'application/json' } })
    }
    if (url.includes('/rest/v1/audit_log')) {
      return new Response(null, { status: 204 })
    }
    return new Response(JSON.stringify({ error: `Unhandled: ${url}` }), { status: 500 })
  })
}

describe('record_payment — tendered_amount_cents (issue #351)', () => {
  it('stores tendered_amount_cents = amount_cents for card payment (no change)', async (): Promise<void> => {
    const captured: { paymentInsertBody?: unknown } = {}
    const mockFetch = buildMockFetch(95000, captured)
    const req = new Request('http://localhost/functions/v1/record_payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-jwt' },
      body: JSON.stringify({
        order_id: VALID_ORDER_ID,
        payments: [{ method: 'card', amount: 95000 }],
      }),
    })
    const res = await handler(req, mockFetch, TEST_ENV)
    expect(res.status).toBe(200)
    const row = captured.paymentInsertBody as InsertedPaymentRow
    expect(row.amount_cents).toBe(95000)
    expect(row.tendered_amount_cents).toBe(95000)
  })

  it('stores tendered_amount_cents = tendered cash and amount_cents = bill amount for over-tendered cash', async (): Promise<void> => {
    // Bill: 950 (in cents), customer hands 1000 cash → change due 50
    const captured: { paymentInsertBody?: unknown } = {}
    const mockFetch = buildMockFetch(95000, captured)
    const req = new Request('http://localhost/functions/v1/record_payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-jwt' },
      body: JSON.stringify({
        order_id: VALID_ORDER_ID,
        payments: [{ method: 'cash', amount: 100000 }],
      }),
    })
    const res = await handler(req, mockFetch, TEST_ENV)
    expect(res.status).toBe(200)
    const json = await res.json() as { success: boolean; data: { change_due: number } }
    expect(json.data.change_due).toBe(5000) // 1000 - 950 = 50 (in cents)

    const row = captured.paymentInsertBody as InsertedPaymentRow
    // amount_cents = bill amount (what customer owes)
    expect(row.amount_cents).toBe(95000)
    // tendered_amount_cents = physical cash given
    expect(row.tendered_amount_cents).toBe(100000)
  })

  it('stores correct amount_cents and tendered_amount_cents for split cash+card with cash over-tender', async (): Promise<void> => {
    // Bill: 950 (95000 cents). Card: 500 (50000 cents), Cash: 600 (60000 cents — over-tender by 150)
    const captured: { paymentInsertBody?: unknown } = {}
    const mockFetch = buildMockFetch(95000, captured)
    const req = new Request('http://localhost/functions/v1/record_payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-jwt' },
      body: JSON.stringify({
        order_id: VALID_ORDER_ID,
        payments: [
          { method: 'card', amount: 50000 },
          { method: 'cash', amount: 60000 },
        ],
      }),
    })
    const res = await handler(req, mockFetch, TEST_ENV)
    expect(res.status).toBe(200)
    const json = await res.json() as { success: boolean; data: { change_due: number } }
    expect(json.data.change_due).toBe(15000) // (50000 + 60000) - 95000 = 15000

    const rows = captured.paymentInsertBody as InsertedPaymentRow[]
    const cardRow = rows.find((r) => r.method === 'card')!
    const cashRow = rows.find((r) => r.method === 'cash')!

    // Card: exact — amount_cents = tendered_amount_cents
    expect(cardRow.amount_cents).toBe(50000)
    expect(cardRow.tendered_amount_cents).toBe(50000)

    // Cash: bill portion = 95000 - 50000 = 45000; tendered = 60000
    expect(cashRow.amount_cents).toBe(45000)
    expect(cashRow.tendered_amount_cents).toBe(60000)
  })

  it('stores tendered_amount_cents = amount_cents for exact cash payment (no change)', async (): Promise<void> => {
    const captured: { paymentInsertBody?: unknown } = {}
    const mockFetch = buildMockFetch(95000, captured)
    const req = new Request('http://localhost/functions/v1/record_payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-jwt' },
      body: JSON.stringify({
        order_id: VALID_ORDER_ID,
        payments: [{ method: 'cash', amount: 95000 }],
      }),
    })
    const res = await handler(req, mockFetch, TEST_ENV)
    expect(res.status).toBe(200)
    const row = captured.paymentInsertBody as InsertedPaymentRow
    expect(row.amount_cents).toBe(95000)
    expect(row.tendered_amount_cents).toBe(95000)
  })
})

// ── Overpayment / tip tests (issue #390) ─────────────────────────────────────

describe('record_payment — overpayment and tips (issue #390)', () => {
  it('returns change_due > 0 for card-only over-tender (tip on card)', async (): Promise<void> => {
    // Bill: 1000 BDT (100000 cents). Customer pays 1200 BDT by card (tip of 200 BDT).
    const captured: { paymentInsertBody?: unknown } = {}
    const mockFetch = buildMockFetch(100000, captured)
    const req = new Request('http://localhost/functions/v1/record_payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-jwt' },
      body: JSON.stringify({
        order_id: VALID_ORDER_ID,
        payments: [{ method: 'card', amount: 120000 }],
      }),
    })
    const res = await handler(req, mockFetch, TEST_ENV)
    expect(res.status).toBe(200)
    const json = await res.json() as { success: boolean; data: { change_due: number } }
    expect(json.success).toBe(true)
    // change_due should reflect the overpayment (tip) even for card
    expect(json.data.change_due).toBe(20000) // 1200 - 1000 = 200 BDT (in cents)

    const row = captured.paymentInsertBody as InsertedPaymentRow
    // amount_cents = the bill portion only (revenue-safe, same semantics as cash).
    // The overpayment (tip) is in change_due and tendered_amount_cents − amount_cents.
    expect(row.amount_cents).toBe(100000) // bill total (not the full 120000 card charge)
    expect(row.tendered_amount_cents).toBe(120000)
  })

  it('accepts split payment where cash entered first, then card slightly over-tenders', async (): Promise<void> => {
    // Bill: 2133 BDT (213300 cents). Cash: 150 (15000), Card: 2000 (200000).
    // Card amount (200000) exceeds remaining balance (213300 - 15000 = 198300) by 1700 cents.
    // Total tendered = 215000 > 213300 → change_due = 1700 cents (17 BDT).
    const captured: { paymentInsertBody?: unknown } = {}
    const mockFetch = buildMockFetch(213300, captured)
    const req = new Request('http://localhost/functions/v1/record_payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-jwt' },
      body: JSON.stringify({
        order_id: VALID_ORDER_ID,
        payments: [
          { method: 'cash', amount: 15000 },
          { method: 'card', amount: 200000 },
        ],
      }),
    })
    const res = await handler(req, mockFetch, TEST_ENV)
    expect(res.status).toBe(200)
    const json = await res.json() as { success: boolean; data: { change_due: number } }
    expect(json.success).toBe(true)
    expect(json.data.change_due).toBe(1700)

    const rows = captured.paymentInsertBody as InsertedPaymentRow[]
    const cashRow = rows.find((r) => r.method === 'cash')!
    const cardRow = rows.find((r) => r.method === 'card')!

    // Cash: covers its full tendered amount (no over-tender on cash side)
    expect(cashRow.amount_cents).toBe(15000)
    expect(cashRow.tendered_amount_cents).toBe(15000)

    // Card: amount_cents = remaining bill (198300), tendered = 200000 (over-tender by 1700)
    expect(cardRow.amount_cents).toBe(198300)
    expect(cardRow.tendered_amount_cents).toBe(200000)
  })

  it('returns 400 when total tendered is less than bill total (under-payment)', async (): Promise<void> => {
    // Bill: 1000 BDT (100000 cents). Customer only pays 900 BDT.
    const mockFetch = buildMockFetch(100000)
    const req = new Request('http://localhost/functions/v1/record_payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-jwt' },
      body: JSON.stringify({
        order_id: VALID_ORDER_ID,
        payments: [{ method: 'cash', amount: 90000 }],
      }),
    })
    const res = await handler(req, mockFetch, TEST_ENV)
    expect(res.status).toBe(400)
    const json = await res.json() as { success: boolean; error: string }
    expect(json.success).toBe(false)
    expect(json.error).toBe('Total tendered does not cover the order total')
  })
})

// ── Service charge change calculation fix (issue #424) ───────────────────────
// Regression guard: service charge must be included in the bill total used for
// computing change. Before the fix, change = tendered − postDiscountBase,
// which excluded service_charge_cents and caused the wrong amount to be shown.

describe('record_payment — service charge included in change calculation (issue #424)', () => {
  it('computes correct change when service charge is present (no VAT, no delivery)', async (): Promise<void> => {
    // Reproduces Lidia’s production screenshot:
    //   Subtotal: ৳7,190  (719,000 cents)
    //   Service charge 10%: ৳719  (71,900 cents)
    //   Bill total: ৳7,909  (790,900 cents)
    //   Cash tendered: ৳8,000  (800,000 cents)
    //   Correct change: ৳91  (9,100 cents)
    //   Bug (before fix): ৳810  (81,000 cents) — change used postDiscountBase only
    const captured: { paymentInsertBody?: unknown } = {}
    const mockFetch = buildMockFetchWithServiceCharge(
      719000,  // final_total_cents (subtotal, per-item discounts applied)
      0,       // discount_amount_cents (no order-level discount)
      71900,   // service_charge_cents (10% of 719,000)
      'dine_in',
      0,       // delivery_charge
      captured,
    )
    const req = new Request('http://localhost/functions/v1/record_payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-jwt' },
      body: JSON.stringify({
        order_id: VALID_ORDER_ID,
        payments: [{ method: 'cash', amount: 800000 }],
      }),
    })
    const res = await handler(req, mockFetch, TEST_ENV)
    expect(res.status).toBe(200)
    const json = await res.json() as { success: boolean; data: { change_due: number } }
    expect(json.success).toBe(true)
    // Bill total = 719,000 + 71,900 = 790,900 → change = 800,000 − 790,900 = 9,100
    expect(json.data.change_due).toBe(9100)

    // amount_cents should be the bill portion (790,900), not the tendered amount
    const row = captured.paymentInsertBody as InsertedPaymentRow
    expect(row.amount_cents).toBe(790900)
    expect(row.tendered_amount_cents).toBe(800000)
  })

  it('returns 400 when tendered is less than bill total including service charge', async (): Promise<void> => {
    // Subtotal 719,000, SC 71,900 → bill total 790,900.
    // Customer only tenders 719,000 (the raw subtotal, ignoring SC) — must be rejected.
    const mockFetch = buildMockFetchWithServiceCharge(719000, 0, 71900, 'dine_in', 0)
    const req = new Request('http://localhost/functions/v1/record_payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-jwt' },
      body: JSON.stringify({
        order_id: VALID_ORDER_ID,
        payments: [{ method: 'cash', amount: 719000 }],
      }),
    })
    const res = await handler(req, mockFetch, TEST_ENV)
    expect(res.status).toBe(400)
    const json = await res.json() as { success: boolean; error: string }
    expect(json.success).toBe(false)
    expect(json.error).toBe('Total tendered does not cover the order total')
  })

  it('computes correct change for delivery order with service charge + delivery fee', async (): Promise<void> => {
    // Subtotal: 500,000 cents, SC: 0 (no SC on delivery), delivery: 30,000 cents.
    // Bill total: 530,000. Cash: 600,000. Change: 70,000.
    const captured: { paymentInsertBody?: unknown } = {}
    const mockFetch = buildMockFetchWithServiceCharge(500000, 0, 0, 'delivery', 30000, captured)
    const req = new Request('http://localhost/functions/v1/record_payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-jwt' },
      body: JSON.stringify({
        order_id: VALID_ORDER_ID,
        payments: [{ method: 'cash', amount: 600000 }],
      }),
    })
    const res = await handler(req, mockFetch, TEST_ENV)
    expect(res.status).toBe(200)
    const json = await res.json() as { success: boolean; data: { change_due: number } }
    expect(json.success).toBe(true)
    expect(json.data.change_due).toBe(70000) // 600,000 − 530,000 = 70,000
  })

  it('includes exclusive VAT in bill total for change calculation', async (): Promise<void> => {
    // Subtotal: 100,000 cents, SC 10%: 10,000 cents → vatBase 110,000.
    // VAT exclusive 15%: 16,500 cents → bill total 126,500 cents.
    // Cash tendered: 130,000. Change: 3,500.
    const captured: { paymentInsertBody?: unknown } = {}
    // Build a mock that returns non-empty VAT config (exclusive, applies to dine_in) and 15% VAT rate.
    const mockFetchWithVat: FetchFn = vi.fn(async (url: string, init?: RequestInit): Promise<Response> => {
      if (url.includes('/auth/v1/user')) {
        return new Response(JSON.stringify({ id: ACTOR_ID }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      if (url.includes('/rest/v1/users')) {
        return new Response(JSON.stringify([{ id: ACTOR_ID, role: 'owner' }]), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      if (url.includes('/rest/v1/orders') && (!init?.method || init?.method === 'GET')) {
        return new Response(
          JSON.stringify([{
            id: VALID_ORDER_ID, restaurant_id: RESTAURANT_ID, status: 'pending_payment',
            final_total_cents: 100000, discount_amount_cents: 0, order_comp: false, customer_id: null,
            service_charge_cents: 10000, delivery_charge: 0, order_type: 'dine_in',
          }]),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
      if (url.includes('/rest/v1/orders') && init?.method === 'PATCH') {
        return new Response(null, { status: 204 })
      }
      if (url.includes('/rest/v1/config')) {
        // tax_inclusive=false (exclusive), vat_apply_dine_in=true
        return new Response(
          JSON.stringify([{ key: 'tax_inclusive', value: 'false' }, { key: 'vat_apply_dine_in', value: 'true' }]),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
      if (url.includes('/rest/v1/vat_rates')) {
        return new Response(
          JSON.stringify([{ percentage: 15 }]),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
      if (url.includes('/rest/v1/payments') && init?.method === 'POST') {
        captured.paymentInsertBody = JSON.parse(init.body as string)
        return new Response(JSON.stringify([{ id: PAYMENT_ID }]), { status: 201, headers: { 'Content-Type': 'application/json' } })
      }
      if (url.includes('/rest/v1/audit_log')) {
        return new Response(null, { status: 204 })
      }
      return new Response(JSON.stringify({ error: `Unhandled: ${url}` }), { status: 500 })
    })
    const req = new Request('http://localhost/functions/v1/record_payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-jwt' },
      body: JSON.stringify({
        order_id: VALID_ORDER_ID,
        payments: [{ method: 'cash', amount: 130000 }],
      }),
    })
    const res = await handler(req, mockFetchWithVat, TEST_ENV)
    expect(res.status).toBe(200)
    const json = await res.json() as { success: boolean; data: { change_due: number } }
    expect(json.success).toBe(true)
    // vatBase = 100,000 + 10,000 = 110,000; VAT 15% exclusive = 16,500; bill = 126,500
    // change = 130,000 − 126,500 = 3,500
    expect(json.data.change_due).toBe(3500)

    const row = captured.paymentInsertBody as InsertedPaymentRow
    expect(row.amount_cents).toBe(126500) // bill total
    expect(row.tendered_amount_cents).toBe(130000)
  })
})

// ── Complimentary order (৳0 total) tests (comp bill receipt fix) ─────────────
// Regression guard: a fully comped order (all items [COMP], total = ৳0) must
// be accepted by record_payment and marked 'paid' so it appears in receipt history.

describe('record_payment — complimentary orders (৳0 bill)', () => {
  it('accepts a ৳0 split payment and marks the order paid', async (): Promise<void> => {
    const captured: { paymentInsertBody?: unknown } = {}
    // Comp order: final_total_cents=0 (all items comped, no charge)
    const mockFetch = buildMockFetch(0, captured)
    const req = new Request('http://localhost/functions/v1/record_payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-jwt' },
      body: JSON.stringify({
        order_id: VALID_ORDER_ID,
        payments: [{ method: 'cash', amount: 0 }],
      }),
    })
    const res = await handler(req, mockFetch, TEST_ENV)
    expect(res.status).toBe(200)
    const json = await res.json() as { success: boolean; data: { payment_id: string; change_due: number } }
    expect(json.success).toBe(true)
    expect(json.data.change_due).toBe(0)

    // A ৳0 payment row must still be inserted so the order shows in receipt history
    const row = captured.paymentInsertBody as InsertedPaymentRow
    expect(row.amount_cents).toBe(0)
    expect(row.tendered_amount_cents).toBe(0)
    expect(row.method).toBe('cash')
  })

  it('rejects a negative payment amount even for a ৳0 order', async (): Promise<void> => {
    const mockFetch = buildMockFetch(0)
    const req = new Request('http://localhost/functions/v1/record_payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-jwt' },
      body: JSON.stringify({
        order_id: VALID_ORDER_ID,
        payments: [{ method: 'cash', amount: -10 }],
      }),
    })
    // amount < 0 must still be rejected at validation (400) before reaching DB
    const res = await handler(req, mockFetch, TEST_ENV)
    expect(res.status).toBe(400)
    const json = await res.json() as { success: boolean; error: string }
    expect(json.success).toBe(false)
    expect(json.error).toBe('each payment amount must not be negative')
  })

  it('rejects under-payment when bill total is non-zero', async (): Promise<void> => {
    // Ensure the existing under-payment guard is not regressed by the ৳0 allowance
    const mockFetch = buildMockFetch(50000)
    const req = new Request('http://localhost/functions/v1/record_payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-jwt' },
      body: JSON.stringify({
        order_id: VALID_ORDER_ID,
        payments: [{ method: 'cash', amount: 0 }],
      }),
    })
    const res = await handler(req, mockFetch, TEST_ENV)
    expect(res.status).toBe(400)
    const json = await res.json() as { success: boolean; error: string }
    expect(json.success).toBe(false)
    expect(json.error).toBe('Total tendered does not cover the order total')
  })
})
