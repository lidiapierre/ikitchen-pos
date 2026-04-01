// Inventory API — direct PostgREST calls (no new edge functions needed)

const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ''

export interface Ingredient {
  id: string
  restaurant_id: string
  name: string
  unit: 'g' | 'kg' | 'L' | 'ml' | 'pcs'
  current_stock: number
  low_stock_threshold: number
  cost_per_unit: number | null
  created_at: string
}

export interface RecipeItem {
  id: string
  menu_item_id: string
  ingredient_id: string
  quantity_used: number
  // joined
  ingredient_name?: string
  ingredient_unit?: string
  ingredient_cost_per_unit?: number | null
}

export type WastageReason = 'spoiled' | 'over-prepared' | 'dropped' | 'expired'

export interface StockAdjustment {
  id: string
  restaurant_id: string
  ingredient_id: string
  quantity_delta: number
  reason: 'sale' | 'delivery' | 'wastage' | 'manual'
  wastage_reason: WastageReason | null
  created_by: string | null
  created_at: string
  // joined
  ingredient_name?: string
  ingredient_unit?: string
  ingredient_cost_per_unit?: number | null
}

export interface MenuItem {
  id: string
  name: string
  price_cents: number
}

function buildHeaders(accessToken: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    apikey: publishableKey,
    Authorization: `Bearer ${accessToken}`,
  }
}

async function req<T>(
  url: string,
  method: string,
  accessToken: string,
  body?: unknown,
  prefer?: string,
): Promise<T> {
  const headers: Record<string, string> = buildHeaders(accessToken)
  if (prefer) headers['Prefer'] = prefer
  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`${method} ${url} failed: ${res.status} — ${text}`)
  }
  const text = await res.text()
  return text ? (JSON.parse(text) as T) : (undefined as T)
}

// ── Ingredients ────────────────────────────────────────────────────────────────

export async function fetchIngredients(
  supabaseUrl: string,
  accessToken: string,
  restaurantId: string,
): Promise<Ingredient[]> {
  const url = `${supabaseUrl}/rest/v1/ingredients?restaurant_id=eq.${restaurantId}&order=name.asc`
  return req<Ingredient[]>(url, 'GET', accessToken)
}

export async function createIngredient(
  supabaseUrl: string,
  accessToken: string,
  data: {
    restaurant_id: string
    name: string
    unit: string
    current_stock: number
    low_stock_threshold: number
    cost_per_unit?: number | null
  },
): Promise<Ingredient> {
  const url = `${supabaseUrl}/rest/v1/ingredients`
  const rows = await req<Ingredient[]>(url, 'POST', accessToken, data, 'return=representation')
  if (!rows || rows.length === 0) throw new Error('No data returned from ingredient creation')
  return rows[0]
}

export async function updateIngredient(
  supabaseUrl: string,
  accessToken: string,
  id: string,
  data: Partial<Omit<Ingredient, 'id' | 'restaurant_id' | 'created_at'>>,
): Promise<void> {
  const url = `${supabaseUrl}/rest/v1/ingredients?id=eq.${id}`
  await req<void>(url, 'PATCH', accessToken, data)
}

export async function deleteIngredient(
  supabaseUrl: string,
  accessToken: string,
  id: string,
): Promise<void> {
  const url = `${supabaseUrl}/rest/v1/ingredients?id=eq.${id}`
  await req<void>(url, 'DELETE', accessToken)
}

// ── Recipe Items ───────────────────────────────────────────────────────────────

export async function fetchRecipeItemsForMenuItem(
  supabaseUrl: string,
  accessToken: string,
  menuItemId: string,
): Promise<RecipeItem[]> {
  const url = `${supabaseUrl}/rest/v1/recipe_items?menu_item_id=eq.${menuItemId}&select=id,menu_item_id,ingredient_id,quantity_used,ingredients(name,unit)`
  const raw = await req<
    Array<{
      id: string
      menu_item_id: string
      ingredient_id: string
      quantity_used: number
      ingredients: { name: string; unit: string } | null
    }>
  >(url, 'GET', accessToken)
  return raw.map((r) => ({
    id: r.id,
    menu_item_id: r.menu_item_id,
    ingredient_id: r.ingredient_id,
    quantity_used: r.quantity_used,
    ingredient_name: r.ingredients?.name,
    ingredient_unit: r.ingredients?.unit,
  }))
}

export async function fetchAllRecipeItems(
  supabaseUrl: string,
  accessToken: string,
): Promise<RecipeItem[]> {
  const url = `${supabaseUrl}/rest/v1/recipe_items?select=id,menu_item_id,ingredient_id,quantity_used,ingredients(name,unit,cost_per_unit)`
  const raw = await req<
    Array<{
      id: string
      menu_item_id: string
      ingredient_id: string
      quantity_used: number
      ingredients: { name: string; unit: string; cost_per_unit: number | null } | null
    }>
  >(url, 'GET', accessToken)
  return raw.map((r) => ({
    id: r.id,
    menu_item_id: r.menu_item_id,
    ingredient_id: r.ingredient_id,
    quantity_used: r.quantity_used,
    ingredient_name: r.ingredients?.name,
    ingredient_unit: r.ingredients?.unit,
    ingredient_cost_per_unit: r.ingredients?.cost_per_unit ?? null,
  }))
}

export async function upsertRecipeItem(
  supabaseUrl: string,
  accessToken: string,
  data: {
    menu_item_id: string
    ingredient_id: string
    quantity_used: number
  },
): Promise<void> {
  const url = `${supabaseUrl}/rest/v1/recipe_items`
  await req<void>(url, 'POST', accessToken, data, 'resolution=merge-duplicates,return=minimal')
}

export async function deleteRecipeItem(
  supabaseUrl: string,
  accessToken: string,
  id: string,
): Promise<void> {
  const url = `${supabaseUrl}/rest/v1/recipe_items?id=eq.${id}`
  await req<void>(url, 'DELETE', accessToken)
}

// ── Stock Adjustments ──────────────────────────────────────────────────────────

export async function fetchStockAdjustments(
  supabaseUrl: string,
  accessToken: string,
  restaurantId: string,
): Promise<StockAdjustment[]> {
  const url = `${supabaseUrl}/rest/v1/stock_adjustments?restaurant_id=eq.${restaurantId}&select=id,restaurant_id,ingredient_id,quantity_delta,reason,wastage_reason,created_by,created_at,ingredients(name,unit,cost_per_unit)&order=created_at.desc&limit=200`
  const raw = await req<
    Array<{
      id: string
      restaurant_id: string
      ingredient_id: string
      quantity_delta: number
      reason: string
      wastage_reason: string | null
      created_by: string | null
      created_at: string
      ingredients: { name: string; unit: string; cost_per_unit: number | null } | null
    }>
  >(url, 'GET', accessToken)
  return raw.map((r) => ({
    ...r,
    reason: r.reason as StockAdjustment['reason'],
    wastage_reason: (r.wastage_reason as StockAdjustment['wastage_reason']) ?? null,
    ingredient_name: r.ingredients?.name,
    ingredient_unit: r.ingredients?.unit,
    ingredient_cost_per_unit: r.ingredients?.cost_per_unit ?? null,
  }))
}

export async function fetchWastageAdjustments(
  supabaseUrl: string,
  accessToken: string,
  restaurantId: string,
  fromDate?: string,
  toDate?: string,
): Promise<StockAdjustment[]> {
  let url = `${supabaseUrl}/rest/v1/stock_adjustments?restaurant_id=eq.${restaurantId}&reason=eq.wastage&select=id,restaurant_id,ingredient_id,quantity_delta,reason,wastage_reason,created_by,created_at,ingredients(name,unit,cost_per_unit)&order=created_at.desc`
  if (fromDate) url += `&created_at=gte.${fromDate}`
  if (toDate) url += `&created_at=lte.${toDate}`
  const raw = await req<
    Array<{
      id: string
      restaurant_id: string
      ingredient_id: string
      quantity_delta: number
      reason: string
      wastage_reason: string | null
      created_by: string | null
      created_at: string
      ingredients: { name: string; unit: string; cost_per_unit: number | null } | null
    }>
  >(url, 'GET', accessToken)
  return raw.map((r) => ({
    ...r,
    reason: r.reason as StockAdjustment['reason'],
    wastage_reason: (r.wastage_reason as StockAdjustment['wastage_reason']) ?? null,
    ingredient_name: r.ingredients?.name,
    ingredient_unit: r.ingredients?.unit,
    ingredient_cost_per_unit: r.ingredients?.cost_per_unit ?? null,
  }))
}

export async function createStockAdjustment(
  supabaseUrl: string,
  accessToken: string,
  data: {
    restaurant_id: string
    ingredient_id: string
    quantity_delta: number
    reason: 'delivery' | 'wastage' | 'manual'
    wastage_reason?: WastageReason | null
    created_by: string | null
  },
): Promise<void> {
  // Insert adjustment record
  const { wastage_reason, ...rest } = data
  const payload: Record<string, unknown> = { ...rest }
  if (wastage_reason) payload.wastage_reason = wastage_reason
  await req<void>(`${supabaseUrl}/rest/v1/stock_adjustments`, 'POST', accessToken, payload, 'return=minimal')
  // Atomically apply delta to current_stock via RPC.
  // decrement_ingredient_stock does: current_stock = current_stock - p_amount
  // So to apply quantity_delta (positive=add, negative=deduct) we pass p_amount = -quantity_delta
  await req<void>(
    `${supabaseUrl}/rest/v1/rpc/decrement_ingredient_stock`,
    'POST',
    accessToken,
    { p_ingredient_id: data.ingredient_id, p_amount: -data.quantity_delta },
  )
}

// ── Menu Items (for recipe editor) ────────────────────────────────────────────

export async function fetchMenuItems(
  supabaseUrl: string,
  accessToken: string,
  restaurantId: string,
): Promise<MenuItem[]> {
  // menu_items are linked via menus → restaurant_id; use embedded filter syntax
  const url = `${supabaseUrl}/rest/v1/menu_items?select=id,name,price_cents,menus!inner(restaurant_id)&menus.restaurant_id=eq.${restaurantId}&order=name.asc`
  const raw = await req<Array<{ id: string; name: string; price_cents: number; menus?: unknown }>>(url, 'GET', accessToken)
  return raw.map((r) => ({ id: r.id, name: r.name, price_cents: r.price_cents }))
}
