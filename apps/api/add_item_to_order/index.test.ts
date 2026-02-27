import { describe, it, expect, vi } from 'vitest'
import { handler, corsHeaders, DbClient } from './index'

const VALID_AUTH = 'Bearer valid-jwt-token'
const ORDER_ID = '00000000-0000-0000-0000-000000000501'
const MENU_ITEM_ID = '00000000-0000-0000-0000-000000000301'
const RESTAURANT_ID = '00000000-0000-0000-0000-000000000001'
const USER_ID = '00000000-0000-0000-0000-000000000401'
const ORDER_ITEM_ID = '11111111-1111-1111-1111-111111111111'

function makeDb(overrides: Partial<DbClient> = {}): DbClient {
  return {
    getUserId: vi.fn().mockResolvedValue(USER_ID),
    fetchOrder: vi.fn().mockResolvedValue({
      data: { status: 'open', restaurant_id: RESTAURANT_ID },
      error: null,
    }),
    fetchMenuItem: vi.fn().mockResolvedValue({
      data: { price_cents: 850 },
      error: null,
    }),
    insertOrderItem: vi.fn().mockResolvedValue({ data: { id: ORDER_ITEM_ID }, error: null }),
    computeOrderTotal: vi.fn().mockResolvedValue({ total: 850, error: null }),
    insertAuditLog: vi.fn().mockResolvedValue({ error: null }),
    ...overrides,
  }
}

function makeRequest(body: unknown, auth: string = VALID_AUTH): Request {
  return new Request('http://localhost/functions/v1/add_item_to_order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: auth },
    body: JSON.stringify(body),
  })
}

describe('add_item_to_order handler', () => {
  describe('OPTIONS preflight', () => {
    it('returns 200 with CORS headers', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/add_item_to_order', { method: 'OPTIONS' })
      const res = await handler(req)
      expect(res.status).toBe(200)
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe(corsHeaders['Access-Control-Allow-Origin'])
      expect(res.headers.get('Access-Control-Allow-Methods')).toBe(corsHeaders['Access-Control-Allow-Methods'])
    })
  })

  describe('authentication', () => {
    it('returns 401 when Authorization header is missing', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/add_item_to_order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: ORDER_ID, menu_item_id: MENU_ITEM_ID, quantity: 1 }),
      })
      const res = await handler(req)
      expect(res.status).toBe(401)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
    })

    it('returns 401 when Authorization header does not start with Bearer', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/add_item_to_order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Basic abc123' },
        body: JSON.stringify({ order_id: ORDER_ID, menu_item_id: MENU_ITEM_ID, quantity: 1 }),
      })
      const res = await handler(req)
      expect(res.status).toBe(401)
    })

    it('returns 401 when getUserId returns null', async (): Promise<void> => {
      const db = makeDb({ getUserId: vi.fn().mockResolvedValue(null) })
      const req = makeRequest({ order_id: ORDER_ID, menu_item_id: MENU_ITEM_ID, quantity: 1 })
      const res = await handler(req, async () => db)
      expect(res.status).toBe(401)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
    })
  })

  describe('input validation', () => {
    it('returns 400 when body is malformed JSON', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/add_item_to_order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: VALID_AUTH },
        body: 'not-valid-json',
      })
      const res = await handler(req)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.error).toBe('Invalid or missing request body')
    })

    it('returns 400 when order_id is missing', async (): Promise<void> => {
      const db = makeDb()
      const req = makeRequest({ menu_item_id: MENU_ITEM_ID, quantity: 1 })
      const res = await handler(req, async () => db)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.error).toBe('order_id is required and must be a non-empty string')
    })

    it('returns 400 when menu_item_id is missing', async (): Promise<void> => {
      const db = makeDb()
      const req = makeRequest({ order_id: ORDER_ID, quantity: 1 })
      const res = await handler(req, async () => db)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.error).toBe('menu_item_id is required and must be a non-empty string')
    })

    it('returns 400 when quantity is missing', async (): Promise<void> => {
      const db = makeDb()
      const req = makeRequest({ order_id: ORDER_ID, menu_item_id: MENU_ITEM_ID })
      const res = await handler(req, async () => db)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.error).toBe('quantity is required and must be a positive integer')
    })

    it('returns 400 when quantity is zero', async (): Promise<void> => {
      const db = makeDb()
      const req = makeRequest({ order_id: ORDER_ID, menu_item_id: MENU_ITEM_ID, quantity: 0 })
      const res = await handler(req, async () => db)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.error).toBe('quantity is required and must be a positive integer')
    })

    it('returns 400 when quantity is a float', async (): Promise<void> => {
      const db = makeDb()
      const req = makeRequest({ order_id: ORDER_ID, menu_item_id: MENU_ITEM_ID, quantity: 1.5 })
      const res = await handler(req, async () => db)
      expect(res.status).toBe(400)
    })
  })

  describe('state transition validation', () => {
    it('returns 404 when the order does not exist', async (): Promise<void> => {
      const db = makeDb({ fetchOrder: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }) })
      const req = makeRequest({ order_id: ORDER_ID, menu_item_id: MENU_ITEM_ID, quantity: 1 })
      const res = await handler(req, async () => db)
      expect(res.status).toBe(404)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.error).toBe('Order not found')
    })

    it('returns 409 when the order is closed', async (): Promise<void> => {
      const db = makeDb({
        fetchOrder: vi.fn().mockResolvedValue({
          data: { status: 'closed', restaurant_id: RESTAURANT_ID },
          error: null,
        }),
      })
      const req = makeRequest({ order_id: ORDER_ID, menu_item_id: MENU_ITEM_ID, quantity: 1 })
      const res = await handler(req, async () => db)
      expect(res.status).toBe(409)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.error).toBe('Order is not open')
    })

    it('returns 409 when the order is cancelled', async (): Promise<void> => {
      const db = makeDb({
        fetchOrder: vi.fn().mockResolvedValue({
          data: { status: 'cancelled', restaurant_id: RESTAURANT_ID },
          error: null,
        }),
      })
      const req = makeRequest({ order_id: ORDER_ID, menu_item_id: MENU_ITEM_ID, quantity: 1 })
      const res = await handler(req, async () => db)
      expect(res.status).toBe(409)
    })
  })

  describe('menu item lookup', () => {
    it('returns 404 when the menu item does not exist', async (): Promise<void> => {
      const db = makeDb({ fetchMenuItem: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }) })
      const req = makeRequest({ order_id: ORDER_ID, menu_item_id: MENU_ITEM_ID, quantity: 1 })
      const res = await handler(req, async () => db)
      expect(res.status).toBe(404)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.error).toBe('Menu item not found')
    })
  })

  describe('DB write failure', () => {
    it('returns 500 when insertOrderItem fails', async (): Promise<void> => {
      const db = makeDb({
        insertOrderItem: vi.fn().mockResolvedValue({ data: null, error: { message: 'constraint violation' } }),
      })
      const req = makeRequest({ order_id: ORDER_ID, menu_item_id: MENU_ITEM_ID, quantity: 1 })
      const res = await handler(req, async () => db)
      expect(res.status).toBe(500)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.error).toBe('Failed to add item to order')
    })
  })

  describe('happy path', () => {
    it('returns 200 with order_item_id and order_total', async (): Promise<void> => {
      const db = makeDb()
      const req = makeRequest({ order_id: ORDER_ID, menu_item_id: MENU_ITEM_ID, quantity: 1 })
      const res = await handler(req, async () => db)
      expect(res.status).toBe(200)
      const json = await res.json() as { success: boolean; data: { order_item_id: string; order_total: number } }
      expect(json.success).toBe(true)
      expect(json.data.order_item_id).toBe(ORDER_ITEM_ID)
      expect(json.data.order_total).toBe(850)
    })

    it('inserts order item with correct fields', async (): Promise<void> => {
      const db = makeDb()
      const req = makeRequest({ order_id: ORDER_ID, menu_item_id: MENU_ITEM_ID, quantity: 2 })
      await handler(req, async () => db)
      expect(db.insertOrderItem).toHaveBeenCalledWith({
        order_id: ORDER_ID,
        menu_item_id: MENU_ITEM_ID,
        quantity: 2,
        unit_price_cents: 850,
      })
    })

    it('emits an audit event with correct fields', async (): Promise<void> => {
      const db = makeDb()
      const req = makeRequest({ order_id: ORDER_ID, menu_item_id: MENU_ITEM_ID, quantity: 1 })
      await handler(req, async () => db)
      expect(db.insertAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          restaurant_id: RESTAURANT_ID,
          user_id: USER_ID,
          action: 'add_item_to_order',
          entity_type: 'order_item',
          entity_id: ORDER_ITEM_ID,
        }),
      )
    })

    it('includes CORS headers in success response', async (): Promise<void> => {
      const db = makeDb()
      const req = makeRequest({ order_id: ORDER_ID, menu_item_id: MENU_ITEM_ID, quantity: 1 })
      const res = await handler(req, async () => db)
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
    })
  })
})
