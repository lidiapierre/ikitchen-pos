import { verifyAndGetCaller } from '../_shared/auth.ts'

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
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

function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

export async function handler(
  req: Request,
  fetchFn: FetchFn = fetch,
  env: HandlerEnv | null = readEnv(),
): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  // Health check – keeps the function warm (issue #283)
  if (req.method === 'GET' && new URL(req.url).pathname.endsWith('/health')) {
    return new Response(
      JSON.stringify({ ok: true, function: 'apply_item_discount' }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }

  if (!env) {
    return new Response(
      JSON.stringify({ success: false, error: 'Server configuration error' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }

  // Only owners can apply item discounts
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
      JSON.stringify({ success: false, error: 'Invalid request body' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }

  if (!body) {
    return new Response(
      JSON.stringify({ success: false, error: 'Invalid request body' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }

  const payload = body as Record<string, unknown>

  if (typeof payload['order_item_id'] !== 'string' || payload['order_item_id'] === '') {
    return new Response(
      JSON.stringify({ success: false, error: 'order_item_id is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }
  if (payload['discount_type'] !== 'percent' && payload['discount_type'] !== 'fixed') {
    return new Response(
      JSON.stringify({ success: false, error: 'discount_type must be percent or fixed' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }
  if (typeof payload['discount_value'] !== 'number' || payload['discount_value'] < 0) {
    return new Response(
      JSON.stringify({ success: false, error: 'discount_value must be a non-negative number' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }

  const orderItemId = payload['order_item_id'] as string
  if (!isValidUuid(orderItemId)) {
    return new Response(
      JSON.stringify({ success: false, error: 'order_item_id must be a valid UUID' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }

  const discountType = payload['discount_type'] as 'percent' | 'fixed'
  const discountValue = payload['discount_value'] as number

  if (discountType === 'percent' && discountValue > 100) {
    return new Response(
      JSON.stringify({ success: false, error: 'percent discount_value must be between 0 and 100' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }

  const { supabaseUrl, serviceKey } = env
  const dbHeaders = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  }

  try {
    // 1. Fetch the order item to verify it exists, is not voided/comp'd, and get price/qty
    const itemRes = await fetchFn(
      `${supabaseUrl}/rest/v1/order_items?select=id,unit_price_cents,quantity,voided,comp&id=eq.${orderItemId}`,
      { headers: dbHeaders },
    )
    if (!itemRes.ok) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch order item' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }
    const items = (await itemRes.json()) as Array<{
      id: string
      unit_price_cents: number
      quantity: number
      voided: boolean
      comp: boolean
    }>
    if (items.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Order item not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }

    const item = items[0]
    if (item.voided || item.comp) {
      return new Response(
        JSON.stringify({ success: false, error: 'Cannot discount a voided or comped item' }),
        { status: 409, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }

    // 2. Compute stored value — both types use value * 100 for storage
    //    percent: 10% → 1000 (percent * 100)
    //    fixed:   ৳50 → 5000 (BDT * 100 = cents)
    const itemDiscountValueStored = Math.round(discountValue * 100)

    // 3. Compute discount amount in cents for the response
    const grossCents = item.unit_price_cents * item.quantity
    let discountAmountCents: number
    if (discountType === 'percent') {
      discountAmountCents = Math.round(grossCents * discountValue / 100)
    } else {
      discountAmountCents = Math.min(itemDiscountValueStored, grossCents)
    }

    // 4. Update the order item with discount fields
    const updateRes = await fetchFn(
      `${supabaseUrl}/rest/v1/order_items?id=eq.${orderItemId}`,
      {
        method: 'PATCH',
        headers: { ...dbHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({
          item_discount_type: discountType,
          item_discount_value: itemDiscountValueStored,
        }),
      },
    )
    if (!updateRes.ok) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to apply item discount' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          item_discount_type: discountType,
          item_discount_value: itemDiscountValueStored,
          discount_amount_cents: discountAmountCents,
        },
      }),
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
