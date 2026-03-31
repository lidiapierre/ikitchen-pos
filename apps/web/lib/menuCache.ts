/**
 * Menu cache module — in-memory + localStorage with a 5-minute TTL.
 *
 * ⚠️  Item availability (86'd status) is ALWAYS fetched fresh and is never
 *     served from cache.  All other menu data (names, prices, modifiers,
 *     allergens, dietary badges) may be served from cache.
 *
 * Invalidation hooks:
 *   • Automatic TTL expiry (5 min)
 *   • Manual call to `invalidateMenuCache()` — call this after any admin
 *     mutation (create/update/delete category or item).
 */

import type { MenuCategory, MenuItem } from '@/app/tables/[id]/order/[order_id]/menu/menuData'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const MENU_CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes
const LS_KEY_PREFIX = 'ikitchen_menu_v1_'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CacheEntry {
  /** Full categories including the availability snapshot taken at fetch time. */
  categories: MenuCategory[]
  cachedAt: number
}

interface AvailabilityMenuRow {
  menu_items: Array<{ id: string; available: boolean }>
}

// ---------------------------------------------------------------------------
// In-memory store (process lifetime)
// ---------------------------------------------------------------------------

/** restaurantId → CacheEntry */
const memCache = new Map<string, CacheEntry>()

/**
 * orderId → restaurantId  (session-scoped; order-to-restaurant mapping never
 * changes so it never needs invalidation)
 */
const orderRestaurantMap = new Map<string, string>()

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function lsKey(restaurantId: string): string {
  return `${LS_KEY_PREFIX}${restaurantId}`
}

function isFresh(entry: CacheEntry): boolean {
  return Date.now() - entry.cachedAt < MENU_CACHE_TTL_MS
}

function readLS(restaurantId: string): CacheEntry | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(lsKey(restaurantId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as CacheEntry
    if (!parsed.categories || !parsed.cachedAt) return null
    return parsed
  } catch {
    return null
  }
}

function writeLS(restaurantId: string, entry: CacheEntry): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(lsKey(restaurantId), JSON.stringify(entry))
  } catch {
    // localStorage full or unavailable — degrade gracefully
  }
}

// ---------------------------------------------------------------------------
// Availability (always fresh)
// ---------------------------------------------------------------------------

/**
 * Fetch ONLY the `available` field for every item in a restaurant.
 * This is always called even on a cache hit so availability is never stale.
 */
export async function fetchFreshAvailability(
  supabaseUrl: string,
  apiKey: string,
  restaurantId: string,
): Promise<Map<string, boolean>> {
  const url = new URL(`${supabaseUrl}/rest/v1/menus`)
  url.searchParams.set('restaurant_id', `eq.${restaurantId}`)
  url.searchParams.set('select', 'menu_items(id,available)')

  const res = await fetch(url.toString(), {
    headers: { apikey: apiKey, Authorization: `Bearer ${apiKey}` },
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Failed to fetch availability: ${res.status} — ${body}`)
  }

  const menus = (await res.json()) as AvailabilityMenuRow[]
  const map = new Map<string, boolean>()
  for (const menu of menus) {
    for (const item of menu.menu_items) {
      map.set(item.id, item.available ?? true)
    }
  }
  return map
}

/** Overlay fresh availability data onto cached categories. */
function applyAvailability(
  categories: MenuCategory[],
  availMap: Map<string, boolean>,
): MenuCategory[] {
  return categories.map((cat) => ({
    ...cat,
    items: cat.items.map((item: MenuItem) => ({
      ...item,
      available: availMap.has(item.id) ? (availMap.get(item.id) ?? true) : item.available,
    })),
  }))
}

// ---------------------------------------------------------------------------
// Restaurant-ID resolution
// ---------------------------------------------------------------------------

async function resolveRestaurantId(
  supabaseUrl: string,
  apiKey: string,
  orderId: string,
): Promise<string> {
  // Use session-level cache for order→restaurant mapping
  const cached = orderRestaurantMap.get(orderId)
  if (cached !== undefined) return cached

  const url = new URL(`${supabaseUrl}/rest/v1/orders`)
  url.searchParams.set('id', `eq.${orderId}`)
  url.searchParams.set('select', 'restaurant_id')

  const res = await fetch(url.toString(), {
    headers: { apikey: apiKey, Authorization: `Bearer ${apiKey}` },
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Failed to fetch order: ${res.status} ${res.statusText} — ${body}`)
  }

  const orders = (await res.json()) as Array<{ restaurant_id: string }>
  if (!Array.isArray(orders)) throw new Error('Unexpected response format from orders endpoint')
  if (orders.length === 0) throw new Error('Unable to load menu')

  const { restaurant_id } = orders[0]
  orderRestaurantMap.set(orderId, restaurant_id)
  return restaurant_id
}

// ---------------------------------------------------------------------------
// Full menu fetch (no cache)
// ---------------------------------------------------------------------------

interface MenuRow {
  id: string
  name: string
  menu_items: Array<{
    id: string
    name: string
    price_cents: number
    available: boolean
    allergens: string[]
    dietary_badges: string[]
    spicy_level: string
    modifiers: Array<{ id: string; name: string; price_delta_cents: number }>
  }>
}

async function fetchMenuFromNetwork(
  supabaseUrl: string,
  apiKey: string,
  restaurantId: string,
): Promise<MenuCategory[]> {
  const url = new URL(`${supabaseUrl}/rest/v1/menus`)
  url.searchParams.set('restaurant_id', `eq.${restaurantId}`)
  url.searchParams.set(
    'select',
    'id,name,menu_items(id,name,price_cents,available,allergens,dietary_badges,spicy_level,modifiers(id,name,price_delta_cents))',
  )

  const res = await fetch(url.toString(), {
    headers: { apikey: apiKey, Authorization: `Bearer ${apiKey}` },
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Failed to fetch menus: ${res.status} ${res.statusText} — ${body}`)
  }

  const menus = (await res.json()) as MenuRow[]
  if (!Array.isArray(menus)) throw new Error('Unexpected response format from menus endpoint')

  return menus.map((menu) => ({
    name: menu.name,
    items: menu.menu_items.map((item) => ({
      id: item.id,
      name: item.name,
      price_cents: item.price_cents,
      available: item.available ?? true,
      allergens: item.allergens ?? [],
      dietary_badges: item.dietary_badges ?? [],
      spicy_level: item.spicy_level ?? 'none',
      modifiers: item.modifiers.map((mod) => ({
        id: mod.id,
        name: mod.name,
        price_delta_cents: mod.price_delta_cents,
      })),
    })),
  }))
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch menu categories with caching.
 *
 * • On cache hit (within TTL): returns cached structure + overlays fresh
 *   availability data (two small fetches instead of the full menu fetch).
 * • On cache miss / TTL expiry: fetches full menu, persists to cache, then
 *   overlays fresh availability.
 *
 * @param supabaseUrl   NEXT_PUBLIC_SUPABASE_URL
 * @param apiKey        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
 * @param orderId       The active order UUID (used to resolve restaurant_id)
 */
export async function fetchMenuCategoriesCached(
  supabaseUrl: string,
  apiKey: string,
  orderId: string,
): Promise<MenuCategory[]> {
  const restaurantId = await resolveRestaurantId(supabaseUrl, apiKey, orderId)

  // Check in-memory cache first, then localStorage
  let entry = memCache.get(restaurantId) ?? null
  if (entry === null) {
    entry = readLS(restaurantId)
    if (entry !== null) memCache.set(restaurantId, entry) // warm in-memory cache
  }

  let categories: MenuCategory[]

  if (entry !== null && isFresh(entry)) {
    // Cache hit: use cached structure
    categories = entry.categories
  } else {
    // Cache miss or stale: fetch from network and cache
    categories = await fetchMenuFromNetwork(supabaseUrl, apiKey, restaurantId)
    const newEntry: CacheEntry = { categories, cachedAt: Date.now() }
    memCache.set(restaurantId, newEntry)
    writeLS(restaurantId, newEntry)
  }

  // Always overlay fresh availability — item availability (86'd status)
  // is NEVER served from cache
  const availMap = await fetchFreshAvailability(supabaseUrl, apiKey, restaurantId)
  return applyAvailability(categories, availMap)
}

/**
 * Invalidate the menu cache.
 *
 * Call this from admin UI after any menu mutation (create/update/delete
 * category or item) so the next POS load fetches fresh data.
 *
 * @param restaurantId  Optionally scope invalidation to one restaurant.
 *                      Omit to clear all cached menus (also resets the
 *                      order→restaurant mapping so the next fetch is fully
 *                      fresh).
 */
export function invalidateMenuCache(restaurantId?: string): void {
  if (restaurantId !== undefined) {
    memCache.delete(restaurantId)
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem(lsKey(restaurantId))
      } catch { /* ignore */ }
    }
  } else {
    // Full invalidation — also clear the order→restaurant session cache so
    // tests (and logout flows) get a clean slate
    memCache.clear()
    orderRestaurantMap.clear()
    if (typeof window !== 'undefined') {
      try {
        const toRemove: string[] = []
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i)
          if (k?.startsWith(LS_KEY_PREFIX)) toRemove.push(k)
        }
        toRemove.forEach((k) => localStorage.removeItem(k))
      } catch { /* ignore */ }
    }
  }
}
