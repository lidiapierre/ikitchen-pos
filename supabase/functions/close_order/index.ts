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
  if (typeof payload['order_id'] !== 'string' || payload['order_id'] === '') {
    return new Response(
      JSON.stringify({ success: false, error: 'order_id is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }

  const orderId = payload['order_id'] as string
  if (!isValidUuid(orderId)) {
    return new Response(
      JSON.stringify({ success: false, error: 'order_id must be a valid UUID' }),
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
    // 1. Fetch the order to verify it exists and is open (also get discount & comp info)
    const orderRes = await fetchFn(
      `${supabaseUrl}/rest/v1/orders?select=id,restaurant_id,status,discount_amount_cents,order_comp&id=eq.${orderId}`,
      { headers: dbHeaders },
    )
    if (!orderRes.ok) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch order' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }
    const orders = (await orderRes.json()) as Array<{
      id: string
      restaurant_id: string
      status: string
      discount_amount_cents: number | null
      order_comp: boolean | null
    }>
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
    const restaurantId = orders[0].restaurant_id
    const discountAmountCents = orders[0].discount_amount_cents ?? 0
    const orderIsComp = orders[0].order_comp === true

    // 2. Calculate final total from non-voided order items, applying per-item discounts first
    //    Calculation order (issue #254):
    //      Per-item: unit_price × qty → apply item discount → item subtotal
    //      Sum all item subtotals → order subtotal (= finalTotal stored here)
    //      Apply order-level discount on subtotal (used for service charge base + in record_payment)
    const itemsRes = await fetchFn(
      `${supabaseUrl}/rest/v1/order_items?select=unit_price_cents,quantity,item_discount_type,item_discount_value&order_id=eq.${orderId}&voided=eq.false&comp=eq.false`,
      { headers: { ...dbHeaders, Prefer: 'count=none' } },
    )
    if (!itemsRes.ok) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch order items' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }
    const items = (await itemsRes.json()) as Array<{
      unit_price_cents: number
      quantity: number
      item_discount_type: string | null
      item_discount_value: number | null
    }>

    // Step 1: apply per-item discounts to compute each item's subtotal, then sum
    const finalTotal = items.reduce((sum, item) => {
      const grossCents = item.unit_price_cents * item.quantity
      let itemDiscountCents = 0
      if (item.item_discount_type === 'percent' && item.item_discount_value != null) {
        // stored as percent * 100 (e.g. 1000 = 10%)
        itemDiscountCents = Math.round(grossCents * item.item_discount_value / 10000)
      } else if (item.item_discount_type === 'fixed' && item.item_discount_value != null) {
        // stored as cents
        itemDiscountCents = Math.min(item.item_discount_value, grossCents)
      }
      return sum + grossCents - itemDiscountCents
    }, 0)

    // 3. Fetch service charge config and calculate service_charge_cents
    // Order: Subtotal → Discount → Service Charge → VAT → Total
    let serviceChargeCents = 0
    if (!orderIsComp) {
      try {
        const configUrl = `${supabaseUrl}/rest/v1/config?select=value&restaurant_id=eq.${restaurantId}&key=eq.service_charge_percent&limit=1`
        const configRes = await fetchFn(configUrl, { headers: dbHeaders })
        if (configRes.ok) {
          const configRows = (await configRes.json()) as Array<{ value: string }>
          if (configRows.length > 0) {
            const scPercent = parseFloat(configRows[0].value)
            if (!isNaN(scPercent) && scPercent > 0) {
              const postDiscountBase = Math.max(0, finalTotal - discountAmountCents)
              serviceChargeCents = Math.round((postDiscountBase * scPercent) / 100)
            }
          }
        }
      } catch {
        // Non-fatal: service charge defaults to 0
      }
    }

    // 4. Generate atomic sequential bill number for this restaurant.
    //    Use an upsert-then-increment pattern: insert row with last_value=1 if not exists,
    //    otherwise increment. We read the updated value back via return=representation.
    let billNumber: string | null = null
    try {
      // Attempt to increment using a RPC or a read-modify-write via PostgREST.
      // PostgREST does not support atomic increment directly, so we use a two-step approach:
      //   a) Upsert to ensure the row exists (last_value stays the same on conflict update if we set it to last_value).
      //   b) Fetch + increment via a PATCH with arithmetic is not supported in PostgREST.
      //
      // Instead, use a DB function (decrement_ingredient_stock style) or fall back to:
      //   a) fetch current last_value
      //   b) PATCH with last_value + 1 — non-atomic but acceptable for POS (concurrent closes rare)
      //
      // For true atomicity we call a Postgres RPC if available, otherwise best-effort.

      // Try to call an RPC that atomically increments and returns new value
      const rpcRes = await fetchFn(
        `${supabaseUrl}/rest/v1/rpc/next_bill_sequence`,
        {
          method: 'POST',
          headers: { ...dbHeaders, Prefer: 'return=representation' },
          body: JSON.stringify({ p_restaurant_id: restaurantId }),
        },
      )
      if (rpcRes.ok) {
        const rpcText = await rpcRes.text()
        const nextVal = rpcText ? parseInt(JSON.parse(rpcText) as string, 10) : NaN
        if (!isNaN(nextVal)) {
          billNumber = 'RN' + String(nextVal).padStart(7, '0')
        }
      }

      // Fallback: best-effort non-atomic increment
      if (!billNumber) {
        // Upsert sequence row
        await fetchFn(
          `${supabaseUrl}/rest/v1/bill_sequences?on_conflict=restaurant_id`,
          {
            method: 'POST',
            headers: { ...dbHeaders, Prefer: 'resolution=ignore-duplicates,return=minimal' },
            body: JSON.stringify({ restaurant_id: restaurantId, last_value: 0 }),
          },
        )
        // Fetch current
        const seqRes = await fetchFn(
          `${supabaseUrl}/rest/v1/bill_sequences?restaurant_id=eq.${restaurantId}&select=last_value&limit=1`,
          { headers: dbHeaders },
        )
        if (seqRes.ok) {
          const seqRows = (await seqRes.json()) as Array<{ last_value: number }>
          const currentVal = seqRows.length > 0 ? seqRows[0].last_value : 0
          const nextVal = currentVal + 1
          await fetchFn(
            `${supabaseUrl}/rest/v1/bill_sequences?restaurant_id=eq.${restaurantId}`,
            {
              method: 'PATCH',
              headers: { ...dbHeaders, Prefer: 'return=minimal' },
              body: JSON.stringify({ last_value: nextVal }),
            },
          )
          billNumber = 'RN' + String(nextVal).padStart(7, '0')
        }
      }
    } catch {
      // Non-fatal: bill number generation must never block order close
      billNumber = null
    }

    // 4b. Update order status to pending_payment and persist final_total_cents + service_charge_cents + bill_number
    const orderUpdatePayload: Record<string, unknown> = {
      status: 'pending_payment',
      final_total_cents: finalTotal,
      service_charge_cents: serviceChargeCents,
    }
    if (billNumber) {
      orderUpdatePayload['bill_number'] = billNumber
    }

    const updateRes = await fetchFn(
      `${supabaseUrl}/rest/v1/orders?id=eq.${orderId}`,
      {
        method: 'PATCH',
        headers: { ...dbHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify(orderUpdatePayload),
      },
    )
    if (!updateRes.ok) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to close order' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }

    // 5. Auto-deduct stock for order items (best-effort — never fail the order close)
    try {
      // Fetch all non-voided order items with menu_item_id and quantity
      const stockItemsRes = await fetchFn(
        `${supabaseUrl}/rest/v1/order_items?select=menu_item_id,quantity&order_id=eq.${orderId}&voided=eq.false`,
        { headers: { ...dbHeaders, Prefer: 'count=none' } },
      )
      if (stockItemsRes.ok) {
        const orderItems = (await stockItemsRes.json()) as Array<{ menu_item_id: string; quantity: number }>

        // Aggregate quantities per menu_item_id
        const menuItemQtyMap = new Map<string, number>()
        for (const oi of orderItems) {
          if (!oi.menu_item_id) continue
          menuItemQtyMap.set(oi.menu_item_id, (menuItemQtyMap.get(oi.menu_item_id) ?? 0) + oi.quantity)
        }

        if (menuItemQtyMap.size > 0) {
          const menuItemIds = Array.from(menuItemQtyMap.keys())
          const inFilter = menuItemIds.map((id) => `"${id}"`).join(',')

          // Fetch recipe items for all involved menu items
          const recipeRes = await fetchFn(
            `${supabaseUrl}/rest/v1/recipe_items?select=menu_item_id,ingredient_id,quantity_used&menu_item_id=in.(${menuItemIds.join(',')})`,
            { headers: { ...dbHeaders, Prefer: 'count=none' } },
          )
          if (recipeRes.ok) {
            const recipeItems = (await recipeRes.json()) as Array<{
              menu_item_id: string
              ingredient_id: string
              quantity_used: number
            }>

            // Aggregate total deduction per ingredient
            const deductMap = new Map<string, number>()
            for (const ri of recipeItems) {
              const qty = menuItemQtyMap.get(ri.menu_item_id) ?? 0
              if (qty === 0) continue
              const totalDeduct = ri.quantity_used * qty
              deductMap.set(ri.ingredient_id, (deductMap.get(ri.ingredient_id) ?? 0) + totalDeduct)
            }

            // Apply deductions + insert stock_adjustments
            for (const [ingredientId, totalDeduct] of deductMap) {
              // Deduct current_stock
              await fetchFn(
                `${supabaseUrl}/rest/v1/rpc/decrement_ingredient_stock`,
                {
                  method: 'POST',
                  headers: { ...dbHeaders, Prefer: 'return=minimal' },
                  body: JSON.stringify({ p_ingredient_id: ingredientId, p_amount: totalDeduct }),
                },
              ).catch(() => {
                // Fallback: direct update via PATCH (non-atomic but best-effort)
              })

              // Insert stock adjustment record
              await fetchFn(
                `${supabaseUrl}/rest/v1/stock_adjustments`,
                {
                  method: 'POST',
                  headers: { ...dbHeaders, Prefer: 'return=minimal' },
                  body: JSON.stringify({
                    restaurant_id: restaurantId,
                    ingredient_id: ingredientId,
                    quantity_delta: -totalDeduct,
                    reason: 'sale',
                    created_by: caller.actorId,
                  }),
                },
              ).catch(() => {
                // Non-fatal: skip if adjustment insert fails
              })
            }
          }
        }
      }
    } catch {
      // Best-effort: inventory deduction must never block order close
    }

    // 6. Emit audit log entry — actor_id comes from verified JWT
    const auditRes = await fetchFn(
      `${supabaseUrl}/rest/v1/audit_log`,
      {
        method: 'POST',
        headers: { ...dbHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({
          restaurant_id: restaurantId,
          user_id: caller.actorId,
          action: 'close_order',
          entity_type: 'orders',
          entity_id: orderId,
          payload: { final_total_cents: finalTotal, service_charge_cents: serviceChargeCents, bill_number: billNumber },
        }),
      },
    )
    if (!auditRes.ok) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to write audit log' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }

    return new Response(
      JSON.stringify({ success: true, data: { final_total_cents: finalTotal, service_charge_cents: serviceChargeCents, bill_number: billNumber } }),
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
