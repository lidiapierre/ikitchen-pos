/**
 * Tables cache module — stale-while-revalidate (SWR) pattern.
 *
 * The table layout (id, label) is session-stable and rarely changes, so it is
 * safe to show cached data immediately and refresh in the background.
 *
 * Order / availability data changes frequently; it is refreshed on every call
 * (background or foreground) — only the *table list* itself is cached.
 *
 * Usage in a React component:
 *
 *   const cached = getTablesCache()
 *   if (cached) {
 *     setTables(cached.tables)   // show immediately
 *     setQueue(cached.queue)
 *     setLoading(false)
 *   }
 *   // Always fetch fresh in background
 *   fetchTables(...)
 *     .then(([t, q]) => { setTablesCache(t, q); setTables(t); setQueue(q) })
 */

import type { TableRow, TakeawayDeliveryOrder } from '@/app/tables/tablesData'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TablesCacheEntry {
  tables: TableRow[]
  queue: TakeawayDeliveryOrder[]
  cachedAt: number
}

// ---------------------------------------------------------------------------
// In-memory cache (process lifetime — intentionally no TTL for tables)
// ---------------------------------------------------------------------------

let memCache: TablesCacheEntry | null = null

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Return the cached tables data if it exists, otherwise null.
 *
 * No TTL check: tables are always refreshed in background regardless of age.
 * The cache is purely a "show something immediately" optimisation.
 */
export function getTablesCache(): { tables: TableRow[]; queue: TakeawayDeliveryOrder[] } | null {
  if (memCache === null) return null
  return { tables: memCache.tables, queue: memCache.queue }
}

/**
 * Store freshly fetched tables data into the cache.
 * Call this after every successful network fetch.
 */
export function setTablesCache(tables: TableRow[], queue: TakeawayDeliveryOrder[]): void {
  memCache = { tables, queue, cachedAt: Date.now() }
}

/**
 * Clear the tables cache.
 * Call this when the user logs out or switches branches/restaurants.
 */
export function invalidateTablesCache(): void {
  memCache = null
}
