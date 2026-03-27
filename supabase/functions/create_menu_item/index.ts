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

interface ModifierInput {
  name: string
  price_delta_cents: number
}

function readEnv(): HandlerEnv | null {
  const g = globalThis as { Deno?: { env: { get: (key: string) => string | undefined } } }
  if (!g.Deno) return null
  const supabaseUrl = g.Deno.env.get('SUPABASE_URL') ?? ''
  const serviceKey = g.Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!supabaseUrl || !serviceKey) return null
  return { supabaseUrl, serviceKey }
}

function isModifierInputArray(value: unknown): value is ModifierInput[] {
  if (!Array.isArray(value)) return false
  return value.every(
    (m) =>
      typeof m === 'object' &&
      m !== null &&
      typeof (m as Record<string, unknown>)['name'] === 'string' &&
      typeof (m as Record<string, unknown>)['price_delta_cents'] === 'number',
  )
}

export async function handler(
  req: Request,
  fetchFn: FetchFn = fetch,
  env: HandlerEnv | null = readEnv(),
): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  if (!env) {
    return new Response(
      JSON.stringify({ success: false, error: 'Server configuration error' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }

  // Verify JWT and check minimum role (owner required for menu management)
  const caller = await verifyAndGetCaller(req, env.supabaseUrl, env.serviceKey, 'owner', fetchFn)
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
  if (typeof payload['menu_id'] !== 'string' || payload['menu_id'] === '') {
    return new Response(
      JSON.stringify({ success: false, error: 'menu_id is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }
  if (typeof payload['name'] !== 'string' || (payload['name'] as string).trim() === '') {
    return new Response(
      JSON.stringify({ success: false, error: 'name is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }
  if (typeof payload['price_cents'] !== 'number' || !Number.isInteger(payload['price_cents']) || (payload['price_cents'] as number) < 0) {
    return new Response(
      JSON.stringify({ success: false, error: 'price_cents must be a non-negative integer' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }
  if (payload['modifiers'] !== undefined && !isModifierInputArray(payload['modifiers'])) {
    return new Response(
      JSON.stringify({ success: false, error: 'modifiers must be an array of {name, price_delta_cents}' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }

  const menuId = payload['menu_id'] as string
  const name = (payload['name'] as string).trim()
  const priceCents = payload['price_cents'] as number
  const modifiers: ModifierInput[] = isModifierInputArray(payload['modifiers']) ? payload['modifiers'] : []
  const description = typeof payload['description'] === 'string' ? payload['description'].trim() : undefined
  const imageUrl = typeof payload['image_url'] === 'string' ? payload['image_url'].trim() : undefined
  const available = typeof payload['available'] === 'boolean' ? payload['available'] : true
  const allergens = Array.isArray(payload['allergens']) ? (payload['allergens'] as string[]).filter((a) => typeof a === 'string') : []
  const dietaryBadges = Array.isArray(payload['dietary_badges']) ? (payload['dietary_badges'] as string[]).filter((a) => typeof a === 'string') : []
  const spicyLevel = typeof payload['spicy_level'] === 'string' ? payload['spicy_level'] : 'none'

  const { supabaseUrl, serviceKey } = env
  const dbHeaders = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  }

  try {
    const menuRes = await fetchFn(
      `${supabaseUrl}/rest/v1/menus?select=id&id=eq.${menuId}`,
      { headers: dbHeaders },
    )
    if (!menuRes.ok) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch menu' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }
    const menus = (await menuRes.json()) as Array<{ id: string }>
    if (menus.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Menu not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }

    const itemInsertRes = await fetchFn(
      `${supabaseUrl}/rest/v1/menu_items`,
      {
        method: 'POST',
        headers: dbHeaders,
        body: JSON.stringify({
          menu_id: menuId,
          name,
          price_cents: priceCents,
          available,
          allergens,
          dietary_badges: dietaryBadges,
          spicy_level: spicyLevel,
          ...(description !== undefined ? { description } : {}),
          ...(imageUrl !== undefined ? { image_url: imageUrl } : {}),
        }),
      },
    )
    if (!itemInsertRes.ok) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to create menu item' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }
    const insertedItems = (await itemInsertRes.json()) as Array<{ id: string }>
    const menuItemId = insertedItems[0].id

    if (modifiers.length > 0) {
      const modifierRows = modifiers.map((m) => ({
        menu_item_id: menuItemId,
        name: m.name,
        price_delta_cents: m.price_delta_cents,
      }))
      const modInsertRes = await fetchFn(
        `${supabaseUrl}/rest/v1/modifiers`,
        {
          method: 'POST',
          headers: { ...dbHeaders, Prefer: 'return=minimal' },
          body: JSON.stringify(modifierRows),
        },
      )
      if (!modInsertRes.ok) {
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to create modifiers' }),
          { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
        )
      }
    }

    return new Response(
      JSON.stringify({ success: true, data: { menu_item_id: menuItemId } }),
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
