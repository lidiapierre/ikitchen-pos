import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handler, corsHeaders } from './index'
import type { HandlerEnv, FetchFn } from './index'

const TEST_ENV: HandlerEnv = {
  supabaseUrl: 'https://example.supabase.co',
  serviceKey: 'test-service-key',
}

function mockOkJson(data: unknown): Response {
  return {
    ok: true,
    json: () => Promise.resolve(data),
  } as unknown as Response
}

function mockOkEmpty(): Response {
  return { ok: true, json: () => Promise.resolve(undefined) } as unknown as Response
}

function buildHappyPathFetch(newItemId: string): FetchFn {
  return vi.fn()
    .mockResolvedValueOnce(mockOkJson([{ price_cents: 1200 }]))           // menu_items
    .mockResolvedValueOnce(mockOkJson([{ status: 'open' }]))              // orders
    .mockResolvedValueOnce(mockOkJson([]))                                  // existing order_items (none)
    .mockResolvedValueOnce(mockOkJson([{ id: newItemId }]))               // insert order_item
    .mockResolvedValueOnce(mockOkJson([{ unit_price_cents: 1200, quantity: 1 }])) // total
}

beforeEach(() => {
  vi.restoreAllMocks()
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

  describe('POST — happy path (new item)', () => {
    it('returns 200 with order_item_id and order_total on success', async (): Promise<void> => {
      const mockFetch = buildHappyPathFetch('new-item-uuid-001')
      const req = new Request('http://localhost/functions/v1/add_item_to_order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: 'order-abc-123', menu_item_id: 'item-uuid-001' }),
      })
      const res = await handler(req, mockFetch, TEST_ENV)
      expect(res.status).toBe(200)
      const json = await res.json() as { success: boolean; data: { order_item_id: string; order_total: number } }
      expect(json.success).toBe(true)
      expect(json.data.order_item_id).toBe('new-item-uuid-001')
      expect(json.data.order_total).toBe(1200)
    })

    it('includes CORS headers in success response', async (): Promise<void> => {
      const mockFetch = buildHappyPathFetch('new-item-uuid-002')
      const req = new Request('http://localhost/functions/v1/add_item_to_order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: 'order-abc-123', menu_item_id: 'item-uuid-001' }),
      })
      const res = await handler(req, mockFetch, TEST_ENV)
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
    })
  })

  describe('POST — happy path (increment existing item)', () => {
    it('increments quantity and returns correct total when item already in order', async (): Promise<void> => {
      const existingItemId = 'existing-item-uuid-001'
      const mockFetch: FetchFn = vi.fn()
        .mockResolvedValueOnce(mockOkJson([{ price_cents: 1200 }]))
        .mockResolvedValueOnce(mockOkJson([{ status: 'open' }]))
        .mockResolvedValueOnce(mockOkJson([{ id: existingItemId, quantity: 1 }]))
        .mockResolvedValueOnce(mockOkEmpty())
        .mockResolvedValueOnce(mockOkJson([{ unit_price_cents: 1200, quantity: 2 }]))
      const req = new Request('http://localhost/functions/v1/add_item_to_order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: 'order-abc-123', menu_item_id: 'item-uuid-001' }),
      })
      const res = await handler(req, mockFetch, TEST_ENV)
      expect(res.status).toBe(200)
      const json = await res.json() as { success: boolean; data: { order_item_id: string; order_total: number } }
      expect(json.success).toBe(true)
      expect(json.data.order_item_id).toBe(existingItemId)
      expect(json.data.order_total).toBe(2400)
    })
  })

  describe('POST — state validation', () => {
    it('returns 404 when menu item does not exist', async (): Promise<void> => {
      const mockFetch: FetchFn = vi.fn()
        .mockResolvedValueOnce(mockOkJson([]))
      const req = new Request('http://localhost/functions/v1/add_item_to_order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: 'order-abc-123', menu_item_id: 'nonexistent-item' }),
      })
      const res = await handler(req, mockFetch, TEST_ENV)
      expect(res.status).toBe(404)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toBe('Menu item not found')
    })

    it('returns 404 when order does not exist', async (): Promise<void> => {
      const mockFetch: FetchFn = vi.fn()
        .mockResolvedValueOnce(mockOkJson([{ price_cents: 1200 }]))
        .mockResolvedValueOnce(mockOkJson([]))
      const req = new Request('http://localhost/functions/v1/add_item_to_order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: 'nonexistent-order', menu_item_id: 'item-uuid-001' }),
      })
      const res = await handler(req, mockFetch, TEST_ENV)
      expect(res.status).toBe(404)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toBe('Order not found')
    })

    it('returns 409 when order is not open', async (): Promise<void> => {
      const mockFetch: FetchFn = vi.fn()
        .mockResolvedValueOnce(mockOkJson([{ price_cents: 1200 }]))
        .mockResolvedValueOnce(mockOkJson([{ status: 'closed' }]))
      const req = new Request('http://localhost/functions/v1/add_item_to_order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: 'order-abc-123', menu_item_id: 'item-uuid-001' }),
      })
      const res = await handler(req, mockFetch, TEST_ENV)
      expect(res.status).toBe(409)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toBe('Order is not open')
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

  describe('POST — with modifier_ids', () => {
    it('inserts a new item with modifier_ids when provided', async (): Promise<void> => {
      const newItemId = 'new-item-with-modifier'
      const mockFetch: FetchFn = vi.fn()
        .mockResolvedValueOnce(mockOkJson([{ price_cents: 1200 }]))           // menu_items
        .mockResolvedValueOnce(mockOkJson([{ status: 'open' }]))              // orders
        .mockResolvedValueOnce(mockOkJson([{ id: 'mod-uuid-001', price_delta_cents: 200 }])) // modifiers
        .mockResolvedValueOnce(mockOkJson([{ id: newItemId }]))               // insert order_item
        .mockResolvedValueOnce(mockOkJson([{ unit_price_cents: 1400, quantity: 1 }])) // total

      const req = new Request('http://localhost/functions/v1/add_item_to_order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: 'order-abc-123',
          menu_item_id: 'item-uuid-001',
          modifier_ids: ['mod-uuid-001'],
        }),
      })
      const res = await handler(req, mockFetch, TEST_ENV)
      expect(res.status).toBe(200)
      const json = await res.json() as { success: boolean; data: { order_item_id: string } }
      expect(json.success).toBe(true)
      expect(json.data.order_item_id).toBe(newItemId)
    })

    it('adds modifier price_delta_cents to unit_price_cents', async (): Promise<void> => {
      const mockFetch: FetchFn = vi.fn()
        .mockResolvedValueOnce(mockOkJson([{ price_cents: 1200 }]))           // menu_items
        .mockResolvedValueOnce(mockOkJson([{ status: 'open' }]))              // orders
        .mockResolvedValueOnce(mockOkJson([                                   // modifiers
          { id: 'mod-uuid-001', price_delta_cents: 200 },
          { id: 'mod-uuid-002', price_delta_cents: 150 },
        ]))
        .mockResolvedValueOnce(mockOkJson([{ id: 'new-item-id' }]))           // insert order_item
        .mockResolvedValueOnce(mockOkJson([{ unit_price_cents: 1550, quantity: 1 }])) // total

      const req = new Request('http://localhost/functions/v1/add_item_to_order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: 'order-abc-123',
          menu_item_id: 'item-uuid-001',
          modifier_ids: ['mod-uuid-001', 'mod-uuid-002'],
        }),
      })
      await handler(req, mockFetch, TEST_ENV)

      // The fourth call (index 3) is the insert; check its body contains the correct unit_price_cents
      const insertCall = (mockFetch as ReturnType<typeof vi.fn>).mock.calls[3] as [string, RequestInit]
      const body = JSON.parse(insertCall[1].body as string) as { unit_price_cents: number }
      expect(body.unit_price_cents).toBe(1550) // 1200 base + 200 + 150 deltas
    })

    it('includes modifier_ids in the insert body', async (): Promise<void> => {
      const mockFetch: FetchFn = vi.fn()
        .mockResolvedValueOnce(mockOkJson([{ price_cents: 1200 }]))
        .mockResolvedValueOnce(mockOkJson([{ status: 'open' }]))
        .mockResolvedValueOnce(mockOkJson([                                   // modifiers
          { id: 'mod-uuid-001', price_delta_cents: 100 },
          { id: 'mod-uuid-002', price_delta_cents: 50 },
        ]))
        .mockResolvedValueOnce(mockOkJson([{ id: 'new-item-id' }]))
        .mockResolvedValueOnce(mockOkJson([{ unit_price_cents: 1350, quantity: 1 }]))

      const req = new Request('http://localhost/functions/v1/add_item_to_order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: 'order-abc-123',
          menu_item_id: 'item-uuid-001',
          modifier_ids: ['mod-uuid-001', 'mod-uuid-002'],
        }),
      })
      await handler(req, mockFetch, TEST_ENV)

      // The fourth call (index 3) is the insert; check its body contains modifier_ids
      const insertCall = (mockFetch as ReturnType<typeof vi.fn>).mock.calls[3] as [string, RequestInit]
      const body = JSON.parse(insertCall[1].body as string) as { modifier_ids: string[] }
      expect(body.modifier_ids).toEqual(['mod-uuid-001', 'mod-uuid-002'])
    })

    it('returns 400 when modifier_ids is not an array', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/add_item_to_order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: 'order-abc-123', menu_item_id: 'item-uuid-001', modifier_ids: 'not-an-array' }),
      })
      const res = await handler(req)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toBe('modifier_ids must be an array of strings')
    })
  })
})
