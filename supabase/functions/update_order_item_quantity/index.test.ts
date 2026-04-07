import { describe, it, expect, vi } from 'vitest'
import { handler, type HandlerEnv } from './index'

const TEST_ORDER_ITEM_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const TEST_ORDER_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
const TEST_RESTAURANT_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'

const mockEnv: HandlerEnv = {
  supabaseUrl: 'https://test.supabase.co',
  serviceKey: 'test-service-key',
}

vi.mock('../_shared/auth.ts', () => ({
  verifyAndGetCaller: vi.fn().mockResolvedValue({ actorId: 'user-123', role: 'server' }),
}))

function makeFetch(opts: {
  itemExists?: boolean
  voided?: boolean
  orderStatus?: string
  accessGranted?: boolean
  patchStatus?: number
  auditFails?: boolean
} = {}): (input: string, init?: RequestInit) => Promise<Response> {
  const {
    itemExists = true,
    voided = false,
    orderStatus = 'open',
    accessGranted = true,
    patchStatus = 204,
    auditFails = false,
  } = opts

  return vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    const method = (init?.method ?? 'GET').toUpperCase()

    // Step 1: resolve order_item → order
    if (method === 'GET' && (url as string).includes('/order_items')) {
      const body = itemExists
        ? JSON.stringify([{
            id: TEST_ORDER_ITEM_ID,
            voided,
            order: { id: TEST_ORDER_ID, restaurant_id: TEST_RESTAURANT_ID, status: orderStatus },
          }])
        : JSON.stringify([])
      return Promise.resolve(new Response(body, { status: 200 }))
    }

    // Step 2: verify restaurant access
    if (method === 'GET' && (url as string).includes('/user_restaurants')) {
      const body = accessGranted
        ? JSON.stringify([{ user_id: 'user-123' }])
        : JSON.stringify([])
      return Promise.resolve(new Response(body, { status: 200 }))
    }

    // Step 3: PATCH quantity
    if (method === 'PATCH') {
      return Promise.resolve(new Response(null, { status: patchStatus }))
    }

    // Step 4: audit log POST
    if (method === 'POST' && (url as string).includes('/audit_log')) {
      if (auditFails) {
        return Promise.resolve(new Response('error', { status: 500 }))
      }
      return Promise.resolve(new Response(null, { status: 201 }))
    }

    return Promise.resolve(new Response('[]', { status: 200 }))
  })
}

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/functions/v1/update_order_item_quantity', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-jwt' },
    body: JSON.stringify(body),
  })
}

describe('update_order_item_quantity handler', () => {
  describe('OPTIONS preflight', () => {
    it('returns 204 with CORS headers', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/update_order_item_quantity', { method: 'OPTIONS' })
      const res = await handler(req)
      expect(res.status).toBe(204)
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
      expect(res.headers.get('Access-Control-Allow-Methods')).toContain('PATCH')
    })
  })

  describe('GET /health', () => {
    it('returns ok:true', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/update_order_item_quantity/health', { method: 'GET' })
      const res = await handler(req)
      expect(res.status).toBe(200)
      const json = await res.json() as { ok: boolean; function: string }
      expect(json.ok).toBe(true)
      expect(json.function).toBe('update_order_item_quantity')
    })
  })

  describe('missing env', () => {
    it('returns 500 when env is null', async (): Promise<void> => {
      const req = makeRequest({ order_item_id: TEST_ORDER_ITEM_ID, quantity: 2 })
      const res = await handler(req, fetch, null)
      expect(res.status).toBe(500)
      const json = await res.json() as { success: boolean }
      expect(json.success).toBe(false)
    })
  })

  describe('input validation', () => {
    it('returns 400 when order_item_id is missing', async (): Promise<void> => {
      const req = makeRequest({ quantity: 2 })
      const res = await handler(req, makeFetch(), mockEnv)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toMatch(/order_item_id/)
    })

    it('returns 400 when order_item_id is not a valid UUID', async (): Promise<void> => {
      const req = makeRequest({ order_item_id: 'not-a-uuid', quantity: 2 })
      const res = await handler(req, makeFetch(), mockEnv)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toMatch(/UUID/)
    })

    it('returns 400 when quantity is missing', async (): Promise<void> => {
      const req = makeRequest({ order_item_id: TEST_ORDER_ITEM_ID })
      const res = await handler(req, makeFetch(), mockEnv)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toMatch(/quantity/)
    })

    it('returns 400 when quantity is 0', async (): Promise<void> => {
      const req = makeRequest({ order_item_id: TEST_ORDER_ITEM_ID, quantity: 0 })
      const res = await handler(req, makeFetch(), mockEnv)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toMatch(/quantity/)
    })

    it('returns 400 when quantity is negative', async (): Promise<void> => {
      const req = makeRequest({ order_item_id: TEST_ORDER_ITEM_ID, quantity: -1 })
      const res = await handler(req, makeFetch(), mockEnv)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toMatch(/quantity/)
    })

    it('returns 400 when quantity is a float', async (): Promise<void> => {
      const req = makeRequest({ order_item_id: TEST_ORDER_ITEM_ID, quantity: 1.5 })
      const res = await handler(req, makeFetch(), mockEnv)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toMatch(/quantity/)
    })

    it('returns 400 when quantity is a string', async (): Promise<void> => {
      const req = makeRequest({ order_item_id: TEST_ORDER_ITEM_ID, quantity: '2' })
      const res = await handler(req, makeFetch(), mockEnv)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toMatch(/quantity/)
    })
  })

  describe('happy path', () => {
    it('returns 200 success for valid quantity change', async (): Promise<void> => {
      const req = makeRequest({ order_item_id: TEST_ORDER_ITEM_ID, quantity: 3 })
      const res = await handler(req, makeFetch(), mockEnv)
      expect(res.status).toBe(200)
      const json = await res.json() as { success: boolean }
      expect(json.success).toBe(true)
    })

    it('accepts quantity = 1 (minimum valid)', async (): Promise<void> => {
      const req = makeRequest({ order_item_id: TEST_ORDER_ITEM_ID, quantity: 1 })
      const res = await handler(req, makeFetch(), mockEnv)
      expect(res.status).toBe(200)
      const json = await res.json() as { success: boolean }
      expect(json.success).toBe(true)
    })

    it('accepts quantity = 999 (maximum valid)', async (): Promise<void> => {
      const req = makeRequest({ order_item_id: TEST_ORDER_ITEM_ID, quantity: 999 })
      const res = await handler(req, makeFetch(), mockEnv)
      expect(res.status).toBe(200)
      const json = await res.json() as { success: boolean }
      expect(json.success).toBe(true)
    })

    it('succeeds even if audit log fails (non-fatal)', async (): Promise<void> => {
      const req = makeRequest({ order_item_id: TEST_ORDER_ITEM_ID, quantity: 2 })
      const res = await handler(req, makeFetch({ auditFails: true }), mockEnv)
      // audit log failure should not prevent 200 success
      expect(res.status).toBe(200)
    })
  })

  describe('error cases', () => {
    it('returns 404 when order item not found', async (): Promise<void> => {
      const req = makeRequest({ order_item_id: TEST_ORDER_ITEM_ID, quantity: 2 })
      const res = await handler(req, makeFetch({ itemExists: false }), mockEnv)
      expect(res.status).toBe(404)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
    })

    it('returns 422 when item is voided', async (): Promise<void> => {
      const req = makeRequest({ order_item_id: TEST_ORDER_ITEM_ID, quantity: 2 })
      const res = await handler(req, makeFetch({ voided: true }), mockEnv)
      expect(res.status).toBe(422)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toMatch(/voided/)
    })

    it('returns 422 when order is not open', async (): Promise<void> => {
      const req = makeRequest({ order_item_id: TEST_ORDER_ITEM_ID, quantity: 2 })
      const res = await handler(req, makeFetch({ orderStatus: 'paid' }), mockEnv)
      expect(res.status).toBe(422)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toMatch(/not open/)
    })

    it('returns 403 when caller has no restaurant access', async (): Promise<void> => {
      const req = makeRequest({ order_item_id: TEST_ORDER_ITEM_ID, quantity: 2 })
      const res = await handler(req, makeFetch({ accessGranted: false }), mockEnv)
      expect(res.status).toBe(403)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
    })

    it('returns 500 when PATCH fails', async (): Promise<void> => {
      const req = makeRequest({ order_item_id: TEST_ORDER_ITEM_ID, quantity: 2 })
      const res = await handler(req, makeFetch({ patchStatus: 500 }), mockEnv)
      expect(res.status).toBe(500)
      const json = await res.json() as { success: boolean }
      expect(json.success).toBe(false)
    })
  })
})
