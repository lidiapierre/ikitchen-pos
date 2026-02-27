import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handler, corsHeaders } from './index'

const FIXED_UUID = '22222222-2222-2222-2222-222222222222'

beforeEach(() => {
  vi.stubGlobal('crypto', { randomUUID: () => FIXED_UUID })
})

describe('add_item_to_order handler', () => {
  describe('OPTIONS preflight', () => {
    it('returns 200 with CORS headers', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/add_item_to_order', {
        method: 'OPTIONS',
      })
      const res = await handler(req)
      expect(res.status).toBe(200)
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe(corsHeaders['Access-Control-Allow-Origin'])
      expect(res.headers.get('Access-Control-Allow-Methods')).toBe(corsHeaders['Access-Control-Allow-Methods'])
    })
  })

  describe('POST — happy path', () => {
    it('returns 200 with order_item_id and order_total on success', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/add_item_to_order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: 'order-abc-123', menu_item_id: 'item-uuid-001' }),
      })
      const res = await handler(req)
      expect(res.status).toBe(200)
      const json = await res.json() as { success: boolean; data: { order_item_id: string; order_total: number } }
      expect(json.success).toBe(true)
      expect(json.data.order_item_id).toBe(FIXED_UUID)
      expect(typeof json.data.order_total).toBe('number')
    })

    it('includes CORS headers in success response', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/add_item_to_order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: 'order-abc-123', menu_item_id: 'item-uuid-001' }),
      })
      const res = await handler(req)
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
    })
  })

  describe('POST — invalid body', () => {
    it('returns 400 when body is malformed JSON', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/add_item_to_order', {
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
      const req = new Request('http://localhost/functions/v1/add_item_to_order', {
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
      const req = new Request('http://localhost/functions/v1/add_item_to_order', {
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
    it('returns 400 when order_id is absent', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/add_item_to_order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ menu_item_id: 'item-uuid-001' }),
      })
      const res = await handler(req)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toBe('order_id is required and must be a non-empty string')
    })

    it('returns 400 when order_id is an empty string', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/add_item_to_order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: '', menu_item_id: 'item-uuid-001' }),
      })
      const res = await handler(req)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toBe('order_id is required and must be a non-empty string')
    })

    it('returns 400 when order_id is a number instead of a string', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/add_item_to_order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: 123, menu_item_id: 'item-uuid-001' }),
      })
      const res = await handler(req)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toBe('order_id is required and must be a non-empty string')
    })

    it('returns 400 when menu_item_id is absent', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/add_item_to_order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: 'order-abc-123' }),
      })
      const res = await handler(req)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toBe('menu_item_id is required and must be a non-empty string')
    })

    it('returns 400 when menu_item_id is an empty string', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/add_item_to_order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: 'order-abc-123', menu_item_id: '' }),
      })
      const res = await handler(req)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toBe('menu_item_id is required and must be a non-empty string')
    })

    it('returns 400 when menu_item_id is a number instead of a string', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/add_item_to_order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: 'order-abc-123', menu_item_id: 99 }),
      })
      const res = await handler(req)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toBe('menu_item_id is required and must be a non-empty string')
    })
  })

  describe('non-POST / non-OPTIONS methods', () => {
    it('returns 400 when method is GET (no body to parse)', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/add_item_to_order', {
        method: 'GET',
      })
      const res = await handler(req)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
    })
  })
})
