import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  fetchMenuCategoriesCached,
  fetchFreshAvailability,
  invalidateMenuCache,
  MENU_CACHE_TTL_MS,
} from './menuCache'

const BASE_URL = 'https://example.supabase.co'
const API_KEY = 'test-api-key'
const ORDER_ID = 'order-abc'
const RESTAURANT_ID = 'restaurant-uuid'

// ---------------------------------------------------------------------------
// Mock localStorage
// ---------------------------------------------------------------------------

const localStorageStore: Record<string, string> = {}
const localStorageMock = {
  getItem: vi.fn((key: string) => localStorageStore[key] ?? null),
  setItem: vi.fn((key: string, value: string) => { localStorageStore[key] = value }),
  removeItem: vi.fn((key: string) => { delete localStorageStore[key] }),
  key: vi.fn((i: number) => Object.keys(localStorageStore)[i] ?? null),
  get length() { return Object.keys(localStorageStore).length },
  clear: vi.fn(() => { for (const k in localStorageStore) delete localStorageStore[k] }),
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function orderResponse() {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: () => Promise.resolve([{ restaurant_id: RESTAURANT_ID }]),
    text: () => Promise.resolve(''),
  }
}

function menusResponse() {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: () =>
      Promise.resolve([
        {
          id: 'menu-1',
          name: 'Starters',
          menu_items: [
            {
              id: 'item-1',
              name: 'Bruschetta',
              price_cents: 850,
              available: true,
              allergens: [],
              dietary_badges: ['halal'],
              spicy_level: 'none',
              modifiers: [],
            },
          ],
        },
      ]),
    text: () => Promise.resolve(''),
  }
}

function availabilityResponse(available = true) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: () =>
      Promise.resolve([{ menu_items: [{ id: 'item-1', available }] }]),
    text: () => Promise.resolve(''),
  }
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  // Global invalidate clears memCache + orderRestaurantMap (module-level state)
  invalidateMenuCache()
  // Clear mock localStorage store
  for (const k in localStorageStore) delete localStorageStore[k]
  vi.stubGlobal('localStorage', localStorageMock)
  // Reset call history on mock fns
  localStorageMock.getItem.mockClear()
  localStorageMock.setItem.mockClear()
  localStorageMock.removeItem.mockClear()
  localStorageMock.key.mockClear()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

// ---------------------------------------------------------------------------
// Tests: fetchFreshAvailability
// ---------------------------------------------------------------------------

describe('fetchFreshAvailability', () => {
  it('returns a map of item id to available boolean', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(availabilityResponse(true)))

    const map = await fetchFreshAvailability(BASE_URL, API_KEY, RESTAURANT_ID)
    expect(map.get('item-1')).toBe(true)
  })

  it('returns false for 86\'d items', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(availabilityResponse(false)))

    const map = await fetchFreshAvailability(BASE_URL, API_KEY, RESTAURANT_ID)
    expect(map.get('item-1')).toBe(false)
  })

  it('throws when fetch fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({ ok: false, status: 500, text: () => Promise.resolve('err') }),
    )
    await expect(fetchFreshAvailability(BASE_URL, API_KEY, RESTAURANT_ID)).rejects.toThrow(
      'Failed to fetch availability',
    )
  })
})

// ---------------------------------------------------------------------------
// Tests: fetchMenuCategoriesCached — cache miss (first fetch)
// ---------------------------------------------------------------------------

describe('fetchMenuCategoriesCached — first fetch (cache miss)', () => {
  it('fetches order → menus → availability and returns categories', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(orderResponse())   // resolve restaurant_id
      .mockResolvedValueOnce(menusResponse())   // full menu fetch
      .mockResolvedValueOnce(availabilityResponse(true)) // fresh availability

    vi.stubGlobal('fetch', mockFetch)

    const result = await fetchMenuCategoriesCached(BASE_URL, API_KEY, ORDER_ID)

    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Starters')
    expect(result[0].items[0].name).toBe('Bruschetta')
    expect(mockFetch).toHaveBeenCalledTimes(3)
  })

  it('overlays availability from dedicated fetch onto categories', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(orderResponse())
      .mockResolvedValueOnce(menusResponse()) // menu has available:true
      .mockResolvedValueOnce(availabilityResponse(false)) // but availability says false

    vi.stubGlobal('fetch', mockFetch)

    const result = await fetchMenuCategoriesCached(BASE_URL, API_KEY, ORDER_ID)
    // Availability overlay must win
    expect(result[0].items[0].available).toBe(false)
  })

  it('persists fetched data to localStorage', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn()
        .mockResolvedValueOnce(orderResponse())
        .mockResolvedValueOnce(menusResponse())
        .mockResolvedValueOnce(availabilityResponse(true)),
    )

    await fetchMenuCategoriesCached(BASE_URL, API_KEY, ORDER_ID)

    expect(localStorageMock.setItem).toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Tests: fetchMenuCategoriesCached — cache hit
// ---------------------------------------------------------------------------

describe('fetchMenuCategoriesCached — cache hit (second fetch within TTL)', () => {
  it('skips the full menu fetch on second call within TTL', async () => {
    // Call sequence:
    //   1st fetchMenuCategoriesCached: order(1) + full-menu(1) + avail(1)
    //   2nd fetchMenuCategoriesCached: order cached in memory, menu served from
    //       cache → only avail(1)
    // Total: 4 fetches
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(orderResponse())         // 1: resolve restaurant_id
      .mockResolvedValueOnce(menusResponse())         // 2: full menu
      .mockResolvedValueOnce(availabilityResponse())  // 3: availability (1st call)
      .mockResolvedValueOnce(availabilityResponse())  // 4: availability only (2nd call)

    vi.stubGlobal('fetch', mockFetch)

    await fetchMenuCategoriesCached(BASE_URL, API_KEY, ORDER_ID)
    await fetchMenuCategoriesCached(BASE_URL, API_KEY, ORDER_ID)

    // Only 4 calls total (not 6 which would happen if menu was re-fetched)
    expect(mockFetch).toHaveBeenCalledTimes(4)

    // The full-menu fetch uses select=id,name,menu_items(...) which URL-encodes
    // as select=id%2Cname... — distinguish it from avail fetch by checking
    // that ONLY ONE menus request includes price_cents in the select param
    const calls = mockFetch.mock.calls.map(([url]: [string]) => decodeURIComponent(url as string))
    const fullMenuFetches = calls.filter((url) => url.includes('price_cents'))
    expect(fullMenuFetches).toHaveLength(1)
  })

  it('always fetches fresh availability even on cache hit', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(orderResponse())
      .mockResolvedValueOnce(menusResponse())
      .mockResolvedValueOnce(availabilityResponse(true))
      .mockResolvedValueOnce(availabilityResponse(false)) // availability changes

    vi.stubGlobal('fetch', mockFetch)

    await fetchMenuCategoriesCached(BASE_URL, API_KEY, ORDER_ID)
    const result = await fetchMenuCategoriesCached(BASE_URL, API_KEY, ORDER_ID)

    // Must reflect the latest availability, not the cached one
    expect(result[0].items[0].available).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Tests: invalidateMenuCache
// ---------------------------------------------------------------------------

describe('invalidateMenuCache', () => {
  it('forces a full re-fetch after invalidation', async () => {
    // Note: invalidateMenuCache(restaurantId) does NOT clear the order→restaurant
    // map, so on the second call the order lookup is still skipped.
    // Calls: order(1) + menu(1) + avail(1) | menu(1) + avail(1) = 5 total
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(orderResponse())   // resolve restaurant_id
      .mockResolvedValueOnce(menusResponse())   // full menu fetch
      .mockResolvedValueOnce(availabilityResponse()) // fresh avail
      // After invalidation (order→restaurant still cached, so no order fetch):
      .mockResolvedValueOnce(menusResponse())   // full menu re-fetch
      .mockResolvedValueOnce(availabilityResponse()) // fresh avail again

    vi.stubGlobal('fetch', mockFetch)

    await fetchMenuCategoriesCached(BASE_URL, API_KEY, ORDER_ID)
    invalidateMenuCache(RESTAURANT_ID)
    await fetchMenuCategoriesCached(BASE_URL, API_KEY, ORDER_ID)

    expect(mockFetch).toHaveBeenCalledTimes(5)
  })

  it('removes entry from localStorage on invalidation', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn()
        .mockResolvedValueOnce(orderResponse())
        .mockResolvedValueOnce(menusResponse())
        .mockResolvedValueOnce(availabilityResponse()),
    )
    await fetchMenuCategoriesCached(BASE_URL, API_KEY, ORDER_ID)

    invalidateMenuCache(RESTAURANT_ID)
    expect(localStorageMock.removeItem).toHaveBeenCalledWith(
      expect.stringContaining(RESTAURANT_ID),
    )
  })

  it('global invalidate (no restaurantId) clears all cached keys', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn()
        .mockResolvedValueOnce(orderResponse())
        .mockResolvedValueOnce(menusResponse())
        .mockResolvedValueOnce(availabilityResponse()),
    )
    await fetchMenuCategoriesCached(BASE_URL, API_KEY, ORDER_ID)
    // Confirm something was written
    expect(localStorageMock.setItem).toHaveBeenCalled()

    localStorageMock.removeItem.mockClear()
    invalidateMenuCache() // no args = clear all including order→restaurant map
    // removeItem should have been called for the ikitchen_menu_v1_ key
    const removed = localStorageMock.removeItem.mock.calls.map(([k]: [string]) => k)
    expect(removed.some((k: string) => k.startsWith('ikitchen_menu_v1_'))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Tests: TTL expiry
// ---------------------------------------------------------------------------

describe('fetchMenuCategoriesCached — TTL expiry', () => {
  it('re-fetches from network after TTL expires', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(orderResponse())
      .mockResolvedValueOnce(menusResponse())
      .mockResolvedValueOnce(availabilityResponse())
      // After TTL expiry:
      .mockResolvedValueOnce(menusResponse())
      .mockResolvedValueOnce(availabilityResponse())

    vi.stubGlobal('fetch', mockFetch)

    // Populate cache
    await fetchMenuCategoriesCached(BASE_URL, API_KEY, ORDER_ID)

    // Fast-forward time past TTL by manipulating the localStorage entry's cachedAt
    const key = `ikitchen_menu_v1_${RESTAURANT_ID}`
    const stored = JSON.parse(localStorageStore[key] ?? '{}') as { categories: unknown; cachedAt: number }
    stored.cachedAt = Date.now() - MENU_CACHE_TTL_MS - 1000
    localStorageStore[key] = JSON.stringify(stored)

    // Evict in-memory cache so it falls back to (now-stale) localStorage
    invalidateMenuCache(RESTAURANT_ID)
    // Re-seed stale entry into localStorage manually (invalidate cleared it)
    localStorageStore[key] = JSON.stringify(stored)

    await fetchMenuCategoriesCached(BASE_URL, API_KEY, ORDER_ID)

    // Should have done 2 full menu fetches total (5 calls: order + 2×menu + 2×avail)
    expect(mockFetch).toHaveBeenCalledTimes(5)
  })
})
