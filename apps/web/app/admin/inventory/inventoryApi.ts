// Inventory API — direct PostgREST calls (no new edge functions needed)

export interface Ingredient {
  id: string
  restaurant_id: string
  name: string
  unit: 'g' | 'kg' | 'L' | 'ml' | 'pcs'
  current_stock: number
  low_stock_threshold: number
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
}

export interface StockAdjustment {
  id: string
  restaurant_id: string
  ingredient_id: string
  quantity_delta: number
  reason: 'sale' | 'delivery' | 'wastage' | 'manual'
  created_by: string | null
  created_at: string
  // joined
  ingredient_name?: string
}

export interface MenuItem {
  id: string
  name: string
}

function buildHeaders(apiKey: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    apikey: apiKey,
    Authorization: `Bearer ${apiKey}`,
  }
}

async function req<T>(
  url: string,
  method: string,
  apiKey: string,
  body?: unknown,
  prefer?: string,
): Promise<T> {
  const headers: Record<string, string> = buildHeaders(apiKey)
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
  apiKey: string,
  restaurantId: string,
): Promise<Ingredient[]> {
  const url = `${supabaseUrl}/rest/v1/ingredients?restaurant_id=eq.${restaurantId}&order=name.asc`
  return req<Ingredient[]>(url, 'GET', apiKey)
}

export async function createIngredient(
  supabaseUrl: string,
  apiKey: string,
  data: {
    restaurant_id: string
    name: string
    unit: string
    current_stock: number
    low_stock_threshold: number
  },
): Promise<Ingredient> {
  const url = `${supabaseUrl}/rest/v1/ingredients`
  const rows = await req<Ingredient[]>(url, 'POST', apiKey, data, 'return=representation')
  if (!rows || rows.length === 0) throw new Error('No data returned from ingredient creation')
  return rows[0]
}

export async function updateIngredient(
  supabaseUrl: string,
  apiKey: string,
  id: string,
  data: Partial<Omit<Ingredient, 'id' | 'restaurant_id' | 'created_at'>>,
): Promise<void> {
  const url = `${supabaseUrl}/rest/v1/ingredients?id=eq.${id}`
  await req<void>(url, 'PATCH', apiKey, data)
}

export async function deleteIngredient(
  supabaseUrl: string,
  apiKey: string,
  id: string,
): Promise<void> {
  const url = `${supabaseUrl}/rest/v1/ingredients?id=eq.${id}`
  await req<void>(url, 'DELETE', apiKey)
}

// ── Recipe Items ───────────────────────────────────────────────────────────────

export async function fetchRecipeItemsForMenuItem(
  supabaseUrl: string,
  apiKey: string,
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
  >(url, 'GET', apiKey)
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
  apiKey: string,
): Promise<RecipeItem[]> {
  const url = `${supabaseUrl}/rest/v1/recipe_items?select=id,menu_item_id,ingredient_id,quantity_used,ingredients(name,unit)`
  const raw = await req<
    Array<{
      id: string
      menu_item_id: string
      ingredient_id: string
      quantity_used: number
      ingredients: { name: string; unit: string } | null
    }>
  >(url, 'GET', apiKey)
  return raw.map((r) => ({
    id: r.id,
    menu_item_id: r.menu_item_id,
    ingredient_id: r.ingredient_id,
    quantity_used: r.quantity_used,
    ingredient_name: r.ingredients?.name,
    ingredient_unit: r.ingredients?.unit,
  }))
}

export async function upsertRecipeItem(
  supabaseUrl: string,
  apiKey: string,
  data: {
    menu_item_id: string
    ingredient_id: string
    quantity_used: number
  },
): Promise<void> {
  const url = `${supabaseUrl}/rest/v1/recipe_items`
  await req<void>(url, 'POST', apiKey, data, 'resolution=merge-duplicates,return=minimal')
}

export async function deleteRecipeItem(
  supabaseUrl: string,
  apiKey: string,
  id: string,
): Promise<void> {
  const url = `${supabaseUrl}/rest/v1/recipe_items?id=eq.${id}`
  await req<void>(url, 'DELETE', apiKey)
}

// ── Stock Adjustments ──────────────────────────────────────────────────────────

export async function fetchStockAdjustments(
  supabaseUrl: string,
  apiKey: string,
  restaurantId: string,
): Promise<StockAdjustment[]> {
  const url = `${supabaseUrl}/rest/v1/stock_adjustments?restaurant_id=eq.${restaurantId}&select=id,restaurant_id,ingredient_id,quantity_delta,reason,created_by,created_at,ingredients(name)&order=created_at.desc&limit=200`
  const raw = await req<
    Array<{
      id: string
      restaurant_id: string
      ingredient_id: string
      quantity_delta: number
      reason: string
      created_by: string | null
      created_at: string
      ingredients: { name: string } | null
    }>
  >(url, 'GET', apiKey)
  return raw.map((r) => ({
    ...r,
    reason: r.reason as StockAdjustment['reason'],
    ingredient_name: r.ingredients?.name,
  }))
}

export async function createStockAdjustment(
  supabaseUrl: string,
  apiKey: string,
  data: {
    restaurant_id: string
    ingredient_id: string
    quantity_delta: number
    reason: 'delivery' | 'wastage' | 'manual'
    created_by: string | null
  },
): Promise<void> {
  // Insert adjustment record
  await req<void>(`${supabaseUrl}/rest/v1/stock_adjustments`, 'POST', apiKey, data, 'return=minimal')
  // Atomically apply delta to current_stock via RPC.
  // decrement_ingredient_stock does: current_stock = current_stock - p_amount
  // So to apply quantity_delta (positive=add, negative=deduct) we pass p_amount = -quantity_delta
  await req<void>(
    `${supabaseUrl}/rest/v1/rpc/decrement_ingredient_stock`,
    'POST',
    apiKey,
    { p_ingredient_id: data.ingredient_id, p_amount: -data.quantity_delta },
  )
}

// ── Menu Items (for recipe editor) ────────────────────────────────────────────

export async function fetchMenuItems(
  supabaseUrl: string,
  apiKey: string,
  restaurantId: string,
): Promise<MenuItem[]> {
  // menu_items are linked via menus → restaurant_id; use embedded filter syntax
  const url = `${supabaseUrl}/rest/v1/menu_items?select=id,name,menus!inner(restaurant_id)&menus.restaurant_id=eq.${restaurantId}&order=name.asc`
  const raw = await req<Array<{ id: string; name: string; menus?: unknown }>>(url, 'GET', apiKey)
  return raw.map((r) => ({ id: r.id, name: r.name }))
}
