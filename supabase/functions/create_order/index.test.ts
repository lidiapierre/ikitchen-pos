import { describe, it, expect, vi } from 'vitest'
import { handler, corsHeaders, type HandlerEnv } from './index'

const TEST_TABLE_ID = '00000000-0000-0000-0000-000000000101'
const TEST_RESTAURANT_ID = '00000000-0000-0000-0000-000000000001'
const TEST_ORDER_ID = '11111111-1111-1111-1111-111111111111'

const mockEnv: HandlerEnv = {
  supabaseUrl: 'https://test.supabase.co',
  serviceKey: 'test-service-key',
}

function makeMockFetch(tableRows: unknown[], orderRows: unknown[]): (input: string, init?: RequestInit) => Promise<Response> {
  return vi.fn().mockImplementation((url: string) => {
    if ((url as string).includes('/tables')) {
      return Promise.resolve(new Response(JSON.stringify(tableRows), { status: 200 }))
    }
    if ((url as string).includes('/orders')) {
      return Promise.resolve(new Response(JSON.stringify(orderRows), { status: 200 }))
    }
    return Promise.resolve(new Response('[]', { status: 200 }))
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

  describe('POST — happy path', () => {
    it('returns 200 with order_id and status open', async (): Promise<void> => {
      const mockFetch = makeMockFetch(
        [{ id: TEST_TABLE_ID, restaurant_id: TEST_RESTAURANT_ID }],
        [{ id: TEST_ORDER_ID, status: 'open' }],
      )
      const req = new Request('http://localhost/functions/v1/create_order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table_id: TEST_TABLE_ID, staff_id: 'staff-abc' }),
      })
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
      const req = new Request('http://localhost/functions/v1/create_order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table_id: TEST_TABLE_ID, staff_id: 'staff-xyz' }),
      })
      const res = await handler(req, mockFetch, mockEnv)
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
    })
  })

  describe('POST — table not found', () => {
    it('returns 404 when table does not exist', async (): Promise<void> => {
      const mockFetch = makeMockFetch([], [])
      const req = new Request('http://localhost/functions/v1/create_order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table_id: TEST_TABLE_ID, staff_id: 'staff-abc' }),
      })
      const res = await handler(req, mockFetch, mockEnv)
      expect(res.status).toBe(404)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toBe('Table not found')
    })
  })

  describe('POST — missing env', () => {
    it('returns 500 when env is not configured', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/create_order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table_id: TEST_TABLE_ID, staff_id: 'staff-abc' }),
      })
      const res = await handler(req, fetch, null)
      expect(res.status).toBe(500)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toBe('Server configuration error')
    })
  })

  describe('non-POST / non-OPTIONS methods', () => {
    it('returns 400 when method is GET (no body to parse)', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/create_order', {
        method: 'GET',
      })
      const res = await handler(req)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
    })
  })

  describe('POST — invalid body', () => {
    it('returns 400 when body is malformed JSON', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/create_order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not-valid-json',
      })
      const res = await handler(req)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toBe('Invalid or missing request body')
    })

    it('returns 400 when body is null', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/create_order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'null',
      })
      const res = await handler(req)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toBe('Missing request body')
    })

    it('returns CORS headers even on error responses', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/create_order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'bad{json',
      })
      const res = await handler(req)
      expect(res.status).toBe(400)
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
    })
  })

  describe('POST — missing required fields', () => {
    it('returns 400 when table_id is absent', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/create_order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staff_id: 'staff-abc' }),
      })
      const res = await handler(req)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toBe('table_id is required and must be a non-empty string')
    })

    it('returns 400 when table_id is a number instead of a string', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/create_order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table_id: 1, staff_id: 'staff-abc' }),
      })
      const res = await handler(req)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toBe('table_id is required and must be a non-empty string')
    })

    it('returns 400 when staff_id is absent', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/create_order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table_id: TEST_TABLE_ID }),
      })
      const res = await handler(req)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toBe('staff_id is required and must be a non-empty string')
    })

    it('returns 400 when staff_id is an empty string', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/create_order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table_id: TEST_TABLE_ID, staff_id: '' }),
      })
      const res = await handler(req)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toBe('staff_id is required and must be a non-empty string')
    })
  })
})
