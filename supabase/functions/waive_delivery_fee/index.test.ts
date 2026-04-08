import { describe, it, expect, vi } from 'vitest'
import { handler, corsHeaders, type HandlerEnv } from './index'

const TEST_ORDER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const TEST_RESTAURANT_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const TEST_ACTOR_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc'

const mockEnv: HandlerEnv = {
  supabaseUrl: 'https://test.supabase.co',
  serviceKey: 'test-service-key',
}

// Mock verifyAndGetCaller — require admin role by default
vi.mock('../_shared/auth.ts', () => ({
  verifyAndGetCaller: vi.fn().mockResolvedValue({ actorId: TEST_ACTOR_ID, role: 'admin' }),
}))

type FetchCall = [string, RequestInit | undefined]

/** Build a fetch mock for the three-step handler flow */
function makeFetch(opts: {
  orderExists?: boolean
  orderIsDelivery?: boolean
  membershipGranted?: boolean
  patchStatus?: number
  auditStatus?: number
  previousCharge?: number
} = {}): ReturnType<typeof vi.fn> {
  const {
    orderExists = true,
    orderIsDelivery = true,
    membershipGranted = true,
    patchStatus = 204,
    auditStatus = 201,
    previousCharge = 9900,
  } = opts

  return vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    const method = (init?.method ?? 'GET').toUpperCase()

    // Step 1: order ownership check
    if (method === 'GET' && (url as string).includes('/orders')) {
      if (!orderExists || !orderIsDelivery) {
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }))
      }
      return Promise.resolve(
        new Response(
          JSON.stringify([{ id: TEST_ORDER_ID, restaurant_id: TEST_RESTAURANT_ID, delivery_charge: previousCharge }]),
          { status: 200 },
        ),
      )
    }

    // Step 2: restaurant membership check
    if (method === 'GET' && (url as string).includes('/user_restaurants')) {
      const body = membershipGranted
        ? JSON.stringify([{ user_id: TEST_ACTOR_ID }])
        : JSON.stringify([])
      return Promise.resolve(new Response(body, { status: 200 }))
    }

    // Step 3: PATCH delivery_charge
    if (method === 'PATCH') {
      return Promise.resolve(new Response(null, { status: patchStatus }))
    }

    // Step 4: audit_log insert
    if (method === 'POST' && (url as string).includes('/audit_log')) {
      return Promise.resolve(new Response(null, { status: auditStatus }))
    }

    return Promise.resolve(new Response('[]', { status: 200 }))
  })
}

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/functions/v1/waive_delivery_fee', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-jwt' },
    body: JSON.stringify(body),
  })
}

describe('waive_delivery_fee handler', () => {
  describe('OPTIONS preflight', () => {
    it('returns 204 with CORS headers', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/waive_delivery_fee', {
        method: 'OPTIONS',
      })
      const res = await handler(req)
      expect(res.status).toBe(204)
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
      expect(res.headers.get('Access-Control-Allow-Headers')).toContain('x-demo-staff-id')
    })
  })

  describe('GET /health', () => {
    it('returns ok:true', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/waive_delivery_fee/health', {
        method: 'GET',
      })
      const res = await handler(req)
      expect(res.status).toBe(200)
      const json = await res.json() as { ok: boolean; function: string }
      expect(json.ok).toBe(true)
      expect(json.function).toBe('waive_delivery_fee')
    })
  })

  describe('missing env', () => {
    it('returns 500 when env is null', async (): Promise<void> => {
      const req = makeRequest({ order_id: TEST_ORDER_ID, delivery_charge_cents: 0 })
      const res = await handler(req, fetch, null)
      expect(res.status).toBe(500)
      const json = await res.json() as { success: boolean }
      expect(json.success).toBe(false)
    })
  })

  describe('input validation', () => {
    it('returns 400 when body is not valid JSON', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/waive_delivery_fee', {
        method: 'POST',
        headers: { Authorization: 'Bearer test-jwt' },
        body: 'not-json',
      })
      const res = await handler(req, makeFetch(), mockEnv)
      expect(res.status).toBe(400)
    })

    it('returns 400 when order_id is missing', async (): Promise<void> => {
      const req = makeRequest({ delivery_charge_cents: 0 })
      const res = await handler(req, makeFetch(), mockEnv)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toMatch(/order_id/)
    })

    it('returns 400 when delivery_charge_cents is missing', async (): Promise<void> => {
      const req = makeRequest({ order_id: TEST_ORDER_ID })
      const res = await handler(req, makeFetch(), mockEnv)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toMatch(/delivery_charge_cents/)
    })

    it('returns 400 when order_id is not a valid UUID', async (): Promise<void> => {
      const req = makeRequest({ order_id: 'not-a-uuid', delivery_charge_cents: 0 })
      const res = await handler(req, makeFetch(), mockEnv)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toMatch(/UUID/)
    })

    it('returns 400 when delivery_charge_cents is negative', async (): Promise<void> => {
      const req = makeRequest({ order_id: TEST_ORDER_ID, delivery_charge_cents: -1 })
      const res = await handler(req, makeFetch(), mockEnv)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toMatch(/non-negative/)
    })

    it('returns 400 when delivery_charge_cents is a float', async (): Promise<void> => {
      const req = makeRequest({ order_id: TEST_ORDER_ID, delivery_charge_cents: 9.9 })
      const res = await handler(req, makeFetch(), mockEnv)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
    })
  })

  describe('access control', () => {
    it('returns 404 when delivery order not found', async (): Promise<void> => {
      const req = makeRequest({ order_id: TEST_ORDER_ID, delivery_charge_cents: 0 })
      const res = await handler(req, makeFetch({ orderExists: false }), mockEnv)
      expect(res.status).toBe(404)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toMatch(/not found/)
    })

    it('returns 403 when caller is not a member of the restaurant', async (): Promise<void> => {
      const req = makeRequest({ order_id: TEST_ORDER_ID, delivery_charge_cents: 0 })
      const res = await handler(req, makeFetch({ membershipGranted: false }), mockEnv)
      expect(res.status).toBe(403)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toMatch(/authorised/)
    })
  })

  describe('happy path', () => {
    it('returns 200 success when waiving delivery fee (0)', async (): Promise<void> => {
      const req = makeRequest({ order_id: TEST_ORDER_ID, delivery_charge_cents: 0 })
      const res = await handler(req, makeFetch(), mockEnv)
      expect(res.status).toBe(200)
      const json = await res.json() as { success: boolean }
      expect(json.success).toBe(true)
    })

    it('returns 200 success when restoring delivery fee', async (): Promise<void> => {
      const req = makeRequest({ order_id: TEST_ORDER_ID, delivery_charge_cents: 9900 })
      const res = await handler(req, makeFetch(), mockEnv)
      expect(res.status).toBe(200)
      const json = await res.json() as { success: boolean }
      expect(json.success).toBe(true)
    })

    it('emits an audit_log row on success', async (): Promise<void> => {
      const mockFetch = makeFetch()
      const req = makeRequest({ order_id: TEST_ORDER_ID, delivery_charge_cents: 0 })
      await handler(req, mockFetch, mockEnv)
      const calls = (mockFetch as ReturnType<typeof vi.fn>).mock.calls as FetchCall[]
      const auditCall = calls.find(([url]) => (url as string).includes('/audit_log'))
      expect(auditCall).toBeDefined()
      const body = JSON.parse(auditCall![1]?.body as string) as {
        action: string
        payload: { previous_charge_cents: number; waived: boolean }
      }
      expect(body.action).toBe('waive_delivery_fee')
      expect(body.payload.waived).toBe(true)
      expect(typeof body.payload.previous_charge_cents).toBe('number')
    })

    it('includes CORS headers in success response', async (): Promise<void> => {
      const req = makeRequest({ order_id: TEST_ORDER_ID, delivery_charge_cents: 0 })
      const res = await handler(req, makeFetch(), mockEnv)
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe(corsHeaders['Access-Control-Allow-Origin'])
    })
  })

  describe('DB failures', () => {
    it('returns 500 when PATCH fails', async (): Promise<void> => {
      const req = makeRequest({ order_id: TEST_ORDER_ID, delivery_charge_cents: 0 })
      const res = await handler(req, makeFetch({ patchStatus: 500 }), mockEnv)
      expect(res.status).toBe(500)
      const json = await res.json() as { success: boolean }
      expect(json.success).toBe(false)
    })

    it('returns 500 when audit log insert fails', async (): Promise<void> => {
      const req = makeRequest({ order_id: TEST_ORDER_ID, delivery_charge_cents: 0 })
      const res = await handler(req, makeFetch({ auditStatus: 500 }), mockEnv)
      expect(res.status).toBe(500)
      const json = await res.json() as { success: boolean }
      expect(json.success).toBe(false)
    })
  })
})
