import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchKdsOrders, fetchKdsSettings, markOrderKitchenDone } from './kdsApi'

const SUPABASE_URL = 'https://example.supabase.co'
const API_KEY = 'test-key'

// Helper to build a mock fetch that returns different responses per URL
function mockFetchSequence(responses: Array<{ ok: boolean; body: unknown }>): typeof fetch {
  let callCount = 0
  return vi.fn(async () => {
    const r = responses[callCount++] ?? responses[responses.length - 1]
    return {
      ok: r.ok,
      status: r.ok ? 200 : 500,
      json: async () => r.body,
      text: async () => JSON.stringify(r.body),
    } as Response
  })
}

beforeEach(() => {
  vi.restoreAllMocks()
})

// ── fetchKdsOrders ────────────────────────────────────────────────────────

describe('fetchKdsOrders', () => {
  it('returns empty array when no orders exist', async () => {
    global.fetch = vi.fn(async (url) => {
      const urlStr = String(url)
      if (urlStr.includes('/rest/v1/orders')) {
        return { ok: true, status: 200, json: async () => [], text: async () => '[]' } as Response
      }
      return { ok: true, status: 200, json: async () => [], text: async () => '[]' } as Response
    })

    const result = await fetchKdsOrders(SUPABASE_URL, API_KEY)
    expect(result).toEqual([])
  })

  it('filters out orders with no sent-to-kitchen items', async () => {
    global.fetch = vi.fn(async (url) => {
      const urlStr = String(url)
      if (urlStr.includes('/rest/v1/orders')) {
        return {
          ok: true, status: 200,
          json: async () => [{ id: 'order-1', created_at: '2024-01-01T10:00:00Z', tables: { label: 'T1' } }],
          text: async () => '[]',
        } as Response
      }
      if (urlStr.includes('/rest/v1/order_items')) {
        // No items returned
        return { ok: true, status: 200, json: async () => [], text: async () => '[]' } as Response
      }
      return { ok: true, status: 200, json: async () => [], text: async () => '[]' } as Response
    })

    const result = await fetchKdsOrders(SUPABASE_URL, API_KEY)
    expect(result).toEqual([])
  })

  it('returns orders with items sorted oldest-first', async () => {
    global.fetch = vi.fn(async (url) => {
      const urlStr = String(url)
      if (urlStr.includes('/rest/v1/orders')) {
        return {
          ok: true, status: 200,
          json: async () => [
            { id: 'order-2', created_at: '2024-01-01T10:10:00Z', tables: { label: 'T2' } },
            { id: 'order-1', created_at: '2024-01-01T10:00:00Z', tables: { label: 'T1' } },
          ],
          text: async () => '[]',
        } as Response
      }
      if (urlStr.includes('/rest/v1/order_items')) {
        return {
          ok: true, status: 200,
          json: async () => [
            { id: 'item-1', order_id: 'order-1', quantity: 2, sent_to_kitchen: true, voided: false, modifier_ids: [], menu_items: { name: 'Burger' } },
            { id: 'item-2', order_id: 'order-2', quantity: 1, sent_to_kitchen: true, voided: false, modifier_ids: [], menu_items: { name: 'Pizza' } },
          ],
          text: async () => '[]',
        } as Response
      }
      return { ok: true, status: 200, json: async () => [], text: async () => '[]' } as Response
    })

    const result = await fetchKdsOrders(SUPABASE_URL, API_KEY)
    expect(result).toHaveLength(2)
    expect(result[0].id).toBe('order-1')  // oldest first
    expect(result[1].id).toBe('order-2')
    expect(result[0].tableLabel).toBe('T1')
    expect(result[0].items[0].name).toBe('Burger')
    expect(result[0].items[0].quantity).toBe(2)
  })

  it('throws on network error', async () => {
    global.fetch = vi.fn(async () => ({
      ok: false,
      status: 500,
      json: async () => ({}),
      text: async () => 'Server Error',
    } as Response))

    await expect(fetchKdsOrders(SUPABASE_URL, API_KEY)).rejects.toThrow(
      'Failed to fetch orders: 500',
    )
  })
})

// ── fetchKdsSettings ──────────────────────────────────────────────────────

describe('fetchKdsSettings', () => {
  it('returns defaults when no settings row exists', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true, status: 200, json: async () => [], text: async () => '[]',
    } as Response))

    const settings = await fetchKdsSettings(SUPABASE_URL, API_KEY)
    expect(settings.pinEnabled).toBe(false)
    expect(settings.pin).toBeNull()
    expect(settings.refreshIntervalSeconds).toBe(15)
  })

  it('returns defaults on fetch error', async () => {
    global.fetch = vi.fn(async () => ({
      ok: false, status: 500, json: async () => ({}), text: async () => 'error',
    } as Response))

    const settings = await fetchKdsSettings(SUPABASE_URL, API_KEY)
    expect(settings.pinEnabled).toBe(false)
    expect(settings.refreshIntervalSeconds).toBe(15)
  })

  it('returns saved settings when row exists', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => [{ pin_enabled: true, pin: '1234', refresh_interval_seconds: 30 }],
      text: async () => '',
    } as Response))

    const settings = await fetchKdsSettings(SUPABASE_URL, API_KEY)
    expect(settings.pinEnabled).toBe(true)
    expect(settings.pin).toBe('1234')
    expect(settings.refreshIntervalSeconds).toBe(30)
  })
})

// ── markOrderKitchenDone ──────────────────────────────────────────────────

describe('markOrderKitchenDone', () => {
  it('resolves on success', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true, status: 200, json: async () => ({ success: true }), text: async () => '',
    } as Response))

    await expect(markOrderKitchenDone(SUPABASE_URL, API_KEY, 'order-1')).resolves.toBeUndefined()
  })

  it('throws on failure', async () => {
    global.fetch = vi.fn(async () => ({
      ok: false, status: 500, json: async () => ({}), text: async () => 'Internal error',
    } as Response))

    await expect(markOrderKitchenDone(SUPABASE_URL, API_KEY, 'order-1')).rejects.toThrow(
      'Failed to mark order done: 500',
    )
  })
})
