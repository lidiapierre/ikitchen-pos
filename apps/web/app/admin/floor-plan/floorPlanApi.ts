// ─── In-memory cache helpers ──────────────────────────────────────────────────
interface CacheEntry<T> {
  data: T
  expiresAt: number
}

const CACHE_TTL_MS = 60_000

// ─── Table positions cache ────────────────────────────────────────────────────
export interface TablePosition {
  id: string
  label: string
  seat_count: number
  grid_x: number | null
  grid_y: number | null
}

const tablePositionsCache = new Map<string, CacheEntry<TablePosition[]>>()

export async function fetchTablePositions(
  supabaseUrl: string,
  apiKey: string,
): Promise<TablePosition[]> {
  const cacheKey = `${supabaseUrl}:${apiKey}`
  const cached = tablePositionsCache.get(cacheKey)
  if (cached && Date.now() < cached.expiresAt) {
    return cached.data
  }

  const url = `${supabaseUrl}/rest/v1/tables?select=id,label,seat_count,grid_x,grid_y&order=label.asc`
  const res = await fetch(url, {
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`,
    },
  })
  if (!res.ok) {
    throw new Error(`Failed to fetch table positions: ${res.status}`)
  }
  const data = (await res.json()) as TablePosition[]
  tablePositionsCache.set(cacheKey, { data, expiresAt: Date.now() + CACHE_TTL_MS })
  return data
}

/** Invalidate the table positions cache (call after a successful save). */
export function invalidateTablePositionsCache(supabaseUrl: string, apiKey: string): void {
  tablePositionsCache.delete(`${supabaseUrl}:${apiKey}`)
}

export async function saveTablePosition(
  supabaseUrl: string,
  apiKey: string,
  accessToken: string,
  tableId: string,
  gridX: number | null,
  gridY: number | null,
): Promise<void> {
  const res = await fetch(`${supabaseUrl}/functions/v1/update_table_position`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ table_id: tableId, grid_x: gridX, grid_y: gridY }),
  })
  if (!res.ok) {
    const json = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(json.error ?? `Failed to save table position: ${res.status}`)
  }
  // Invalidate so the next load reflects the new position
  invalidateTablePositionsCache(supabaseUrl, apiKey)
}

/** Fetch the restaurant id (first restaurant visible to the current key). */
export async function fetchRestaurantId(
  supabaseUrl: string,
  apiKey: string,
): Promise<string> {
  const url = new URL(`${supabaseUrl}/rest/v1/restaurants`)
  url.searchParams.set('select', 'id')
  url.searchParams.set('limit', '1')
  const res = await fetch(url.toString(), {
    headers: { apikey: apiKey, Authorization: `Bearer ${apiKey}` },
  })
  if (!res.ok) throw new Error(`Failed to fetch restaurant: ${res.status}`)
  const rows = (await res.json()) as Array<{ id: string }>
  if (rows.length === 0) throw new Error('No restaurant found')
  return rows[0].id
}

// ─── Floor plan config (batched) ─────────────────────────────────────────────
export interface FloorPlanConfig {
  cols: number
  rows: number
}

const floorPlanConfigCache = new Map<string, CacheEntry<FloorPlanConfig>>()

export async function fetchFloorPlanConfig(
  supabaseUrl: string,
  apiKey: string,
  restaurantId: string,
  defaults: { cols: number; rows: number },
): Promise<FloorPlanConfig> {
  const cacheKey = `${supabaseUrl}:${restaurantId}`
  const cached = floorPlanConfigCache.get(cacheKey)
  if (cached && Date.now() < cached.expiresAt) {
    return cached.data
  }

  const url = new URL(`${supabaseUrl}/rest/v1/config`)
  url.searchParams.set('select', 'key,value')
  url.searchParams.set('restaurant_id', `eq.${restaurantId}`)
  url.searchParams.set('key', `in.(floor_plan_cols,floor_plan_rows)`)
  const res = await fetch(url.toString(), {
    headers: { apikey: apiKey, Authorization: `Bearer ${apiKey}` },
  })
  if (!res.ok) return defaults
  const rows = (await res.json()) as Array<{ key: string; value: string }>
  const map = Object.fromEntries(rows.map(r => [r.key, r.value]))
  const parsedCols = parseInt(map['floor_plan_cols'] ?? '', 10)
  const parsedRows = parseInt(map['floor_plan_rows'] ?? '', 10)
  const config: FloorPlanConfig = {
    cols: Number.isNaN(parsedCols) ? defaults.cols : parsedCols,
    rows: Number.isNaN(parsedRows) ? defaults.rows : parsedRows,
  }
  floorPlanConfigCache.set(cacheKey, { data: config, expiresAt: Date.now() + CACHE_TTL_MS })
  return config
}

/** Invalidate the floor plan config cache (call after saving grid size). */
export function invalidateFloorPlanConfigCache(supabaseUrl: string, restaurantId: string): void {
  floorPlanConfigCache.delete(`${supabaseUrl}:${restaurantId}`)
}
