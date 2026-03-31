import { verifyAndGetCaller } from '../_shared/auth.ts'

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>

export interface HandlerEnv {
  supabaseUrl: string
  serviceKey: string
}

function readEnv(): HandlerEnv | null {
  const g = globalThis as { Deno?: { env: { get: (key: string) => string | undefined } } }
  if (!g.Deno) return null
  const supabaseUrl = g.Deno.env.get('SUPABASE_URL') ?? ''
  const serviceKey = g.Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!supabaseUrl || !serviceKey) return null
  return { supabaseUrl, serviceKey }
}

export async function handler(
  req: Request,
  fetchFn: FetchFn = fetch,
  env: HandlerEnv | null = readEnv(),
): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders })
  }

  // Health check – keeps the function warm (issue #283)
  if (req.method === 'GET' && new URL(req.url).pathname.endsWith('/health')) {
    return new Response(
      JSON.stringify({ ok: true, function: 'add_item_to_order' }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }

  if (!env) {
    return new Response(
      JSON.stringify({ success: false, error: 'Server configuration error' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }

  // Verify JWT and check minimum role
  const caller = await verifyAndGetCaller(req, env.supabaseUrl, env.serviceKey, 'server', fetchFn)
  if ('error' in caller) {
    return new Response(
      JSON.stringify({ success: false, error: caller.error }),
      { status: caller.status, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return new Response(
      JSON.stringify({ success: false, error: 'Invalid or missing request body' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }

  if (!body) {
    return new Response(
      JSON.stringify({ success: false, error: 'Missing request body' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }

  const payload = body as Record<string, unknown>
  if (typeof payload['order_id'] !== 'string' || payload['order_id'] === '') {
    return new Response(
      JSON.stringify({ success: false, error: 'order_id is required and must be a non-empty string' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }
  if (typeof payload['menu_item_id'] !== 'string' || payload['menu_item_id'] === '') {
    return new Response(
      JSON.stringify({ success: false, error: 'menu_item_id is required and must be a non-empty string' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }

  // Validate optional modifier_ids: if present must be an array of strings
  const rawModifierIds = payload['modifier_ids']
  if (rawModifierIds !== undefined) {
    if (!Array.isArray(rawModifierIds) || rawModifierIds.some((id) => typeof id !== 'string')) {
      return new Response(
        JSON.stringify({ success: false, error: 'modifier_ids must be an array of strings' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }
  }

  const orderId = payload['order_id'] as string
  const menuItemId = payload['menu_item_id'] as string
  const modifierIds: string[] = Array.isArray(rawModifierIds) ? (rawModifierIds as string[]) : []

  // Validate optional course field (defaults to 'main' if not provided)
  const rawCourse = payload['course']
  if (rawCourse !== undefined && !['starter', 'main', 'dessert'].includes(rawCourse as string)) {
    return new Response(
      JSON.stringify({ success: false, error: 'course must be one of: starter, main, dessert' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }
  const course = typeof rawCourse === 'string' ? rawCourse : 'main'

  const { supabaseUrl, serviceKey } = env
  const dbHeaders = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  }

  try {
    // 1. Fetch menu item to get price
    const menuItemRes = await fetchFn(
      `${supabaseUrl}/rest/v1/menu_items?select=price_cents&id=eq.${menuItemId}`,
      { headers: dbHeaders },
    )
    if (!menuItemRes.ok) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch menu item' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }
    const menuItems = (await menuItemRes.json()) as Array<{ price_cents: number }>
    if (menuItems.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Menu item not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }
    const priceCents = menuItems[0].price_cents

    // 2. Verify order exists and is open
    const orderRes = await fetchFn(
      `${supabaseUrl}/rest/v1/orders?select=status&id=eq.${orderId}`,
      { headers: dbHeaders },
    )
    if (!orderRes.ok) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch order' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }
    const orders = (await orderRes.json()) as Array<{ status: string }>
    if (orders.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Order not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }
    if (orders[0].status !== 'open') {
      return new Response(
        JSON.stringify({ success: false, error: 'Order is not open' }),
        { status: 409, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }

    let orderItemId: string

    // 3. When modifiers are selected, always insert a new order item so each
    //    modifier combination appears as its own line. When no modifiers are
    //    specified, use the existing increment-quantity behaviour.
    if (modifierIds.length > 0) {
      // Fetch modifier price deltas and add them to the base price
      const modifierRes = await fetchFn(
        `${supabaseUrl}/rest/v1/modifiers?select=id,price_delta_cents&id=in.(${modifierIds.join(',')})`,
        { headers: dbHeaders },
      )
      if (!modifierRes.ok) {
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to fetch modifiers' }),
          { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
        )
      }
      const modifiers = (await modifierRes.json()) as Array<{ id: string; price_delta_cents: number }>
      const modifierDeltaCents = modifiers.reduce((sum, mod) => sum + mod.price_delta_cents, 0)
      const unitPriceCents = priceCents + modifierDeltaCents

      const insertRes = await fetchFn(
        `${supabaseUrl}/rest/v1/order_items`,
        {
          method: 'POST',
          headers: dbHeaders,
          body: JSON.stringify({
            order_id: orderId,
            menu_item_id: menuItemId,
            unit_price_cents: unitPriceCents,
            quantity: 1,
            modifier_ids: modifierIds,
            course,
          }),
        },
      )
      if (!insertRes.ok) {
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to insert order item' }),
          { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
        )
      }
      const inserted = (await insertRes.json()) as Array<{ id: string }>
      orderItemId = inserted[0].id
    } else {
      // Check for an existing non-voided order item for this menu item (no modifiers)
      const existingRes = await fetchFn(
        `${supabaseUrl}/rest/v1/order_items?select=id,quantity&order_id=eq.${orderId}&menu_item_id=eq.${menuItemId}&voided=eq.false`,
        { headers: dbHeaders },
      )
      if (!existingRes.ok) {
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to fetch order items' }),
          { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
        )
      }
      const existingItems = (await existingRes.json()) as Array<{ id: string; quantity: number }>

      if (existingItems.length > 0) {
        // Increment quantity on the existing item
        const existing = existingItems[0]
        const patchRes = await fetchFn(
          `${supabaseUrl}/rest/v1/order_items?id=eq.${existing.id}`,
          {
            method: 'PATCH',
            headers: { ...dbHeaders, Prefer: 'return=minimal' },
            body: JSON.stringify({ quantity: existing.quantity + 1 }),
          },
        )
        if (!patchRes.ok) {
          return new Response(
            JSON.stringify({ success: false, error: 'Failed to update order item' }),
            { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
          )
        }
        orderItemId = existing.id
      } else {
        // Insert a new order item
        const insertRes = await fetchFn(
          `${supabaseUrl}/rest/v1/order_items`,
          {
            method: 'POST',
            headers: dbHeaders,
            body: JSON.stringify({
              order_id: orderId,
              menu_item_id: menuItemId,
              unit_price_cents: priceCents,
              quantity: 1,
              course,
            }),
          },
        )
        if (!insertRes.ok) {
          return new Response(
            JSON.stringify({ success: false, error: 'Failed to insert order item' }),
            { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
          )
        }
        const inserted = (await insertRes.json()) as Array<{ id: string }>
        orderItemId = inserted[0].id
      }
    }

    // 4. Calculate the updated order total
    const totalRes = await fetchFn(
      `${supabaseUrl}/rest/v1/order_items?select=unit_price_cents,quantity&order_id=eq.${orderId}&voided=eq.false`,
      { headers: { ...dbHeaders, Prefer: 'count=none' } },
    )
    if (!totalRes.ok) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to calculate order total' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }
    const allItems = (await totalRes.json()) as Array<{ unit_price_cents: number; quantity: number }>
    const orderTotal = allItems.reduce((sum, item) => sum + item.unit_price_cents * item.quantity, 0)

    return new Response(
      JSON.stringify({ success: true, data: { order_item_id: orderItemId, order_total: orderTotal } }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  } catch {
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }
}

if (typeof (globalThis as { Deno?: unknown }).Deno !== 'undefined') {
  const g = globalThis as { Deno: { serve: (h: (req: Request) => Promise<Response>) => void } }
  g.Deno.serve((req: Request) => handler(req))
}
