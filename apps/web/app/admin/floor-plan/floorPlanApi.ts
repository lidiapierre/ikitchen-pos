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
  section_id: string | null
}

export interface FloorPlanSection {
  id: string
  name: string
  grid_cols: number
  grid_rows: number
  sort_order: number
  assigned_server_id: string | null
  table_count: number
}

const tablePositionsCache = new Map<string, CacheEntry<TablePosition[]>>()

export async function fetchTablePositions(
  supabaseUrl: string,
  accessToken: string,
): Promise<TablePosition[]> {
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ''
  const cacheKey = `${supabaseUrl}:positions`
  const cached = tablePositionsCache.get(cacheKey)
  if (cached && Date.now() < cached.expiresAt) {
    return cached.data
  }

  const url = `${supabaseUrl}/rest/v1/tables?select=id,label,seat_count,grid_x,grid_y,section_id&order=label.asc`
  const res = await fetch(url, {
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${accessToken}`,
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
export function invalidateTablePositionsCache(supabaseUrl: string): void {
  tablePositionsCache.delete(`${supabaseUrl}:positions`)
}

export async function saveTablePosition(
  supabaseUrl: string,
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
  invalidateTablePositionsCache(supabaseUrl)
}

/** Fetch the restaurant id (first restaurant visible to the current key). */
export async function fetchRestaurantId(
  supabaseUrl: string,
  accessToken: string,
): Promise<string> {
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ''
  const url = new URL(`${supabaseUrl}/rest/v1/restaurants`)
  url.searchParams.set('select', 'id')
  url.searchParams.set('limit', '1')
  const res = await fetch(url.toString(), {
    headers: { apikey: publishableKey, Authorization: `Bearer ${accessToken}` },
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
  accessToken: string,
  restaurantId: string,
  defaults: { cols: number; rows: number },
): Promise<FloorPlanConfig> {
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ''
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
    headers: { apikey: publishableKey, Authorization: `Bearer ${accessToken}` },
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

// ─── Sections for floor plan ──────────────────────────────────────────────────
export async function fetchFloorPlanSections(
  supabaseUrl: string,
  accessToken: string,
): Promise<FloorPlanSection[]> {
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ''
  const url = new URL(`${supabaseUrl}/rest/v1/sections`)
  url.searchParams.set('select', 'id,name,grid_cols,grid_rows,sort_order,assigned_server_id')
  url.searchParams.set('order', 'sort_order.asc,name.asc')
  const res = await fetch(url.toString(), {
    headers: { apikey: publishableKey, Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) return []
  const rows = (await res.json()) as FloorPlanSection[]
  return rows.map(r => ({ ...r, table_count: 0 }))
}
