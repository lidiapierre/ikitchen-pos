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

const VALID_METHODS = ['cash', 'card', 'mobile', 'other']

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
      JSON.stringify({ ok: true, function: 'record_payment' }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }

  if (!env) {
    return new Response(
      JSON.stringify({ success: false, error: 'Server configuration error' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }

  // Verify JWT and check minimum role (manager required to record payments)
  const caller = await verifyAndGetCaller(req, env.supabaseUrl, env.serviceKey, 'manager', fetchFn)
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

  // ── Split-payment path ────────────────────────────────────────────────────
  // When `payments` array is provided, process all rows atomically.
  // Single-payment path (legacy) uses top-level `amount` + `method`.
  // ─────────────────────────────────────────────────────────────────────────

  interface PaymentRow { method: string; amount: number }
  let paymentsToRecord: PaymentRow[]
  let isSplitPath = false

  if (Array.isArray(payload['payments'])) {
    // Split-payment path
    isSplitPath = true
    const rawPayments = payload['payments'] as unknown[]
    if (rawPayments.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'payments array must not be empty' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }
    for (const p of rawPayments) {
      const row = p as Record<string, unknown>
      if (typeof row['method'] !== 'string' || !VALID_METHODS.includes(row['method'] as string)) {
        return new Response(
          JSON.stringify({ success: false, error: 'each payment must have a valid method' }),
          { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
        )
      }
      if (typeof row['amount'] !== 'number' || (row['amount'] as number) <= 0) {
        return new Response(
          JSON.stringify({ success: false, error: 'each payment amount must be a positive number' }),
          { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
        )
      }
    }
    paymentsToRecord = rawPayments.map((p) => {
      const row = p as Record<string, unknown>
      return { method: row['method'] as string, amount: row['amount'] as number }
    })
  } else {
    // Legacy single-payment path
    if (typeof payload['amount'] !== 'number') {
      return new Response(
        JSON.stringify({ success: false, error: 'amount is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }
    if ((payload['amount'] as number) <= 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'amount must be greater than 0' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }
    if (typeof payload['method'] !== 'string' || payload['method'] === '') {
      return new Response(
        JSON.stringify({ success: false, error: 'method is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }
    if (!VALID_METHODS.includes(payload['method'] as string)) {
      return new Response(
        JSON.stringify({ success: false, error: 'method must be one of: cash, card, mobile, other' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }
    paymentsToRecord = [{ method: payload['method'] as string, amount: payload['amount'] as number }]
  }

  const { supabaseUrl, serviceKey } = env
  const dbHeaders = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  }

  try {
    // 1. Fetch the order to verify it exists, is pending_payment, and get final_total_cents.
    //    Also fetch service_charge_cents, delivery_charge, order_type so we can compute the
    //    true bill total for change calculation (bug fix: service charge was missing — issue #424).
    //    Also fetch customer_id here to avoid a second roundtrip in the loyalty block (issue #356).
    const orderRes = await fetchFn(
      `${supabaseUrl}/rest/v1/orders?select=id,restaurant_id,status,final_total_cents,discount_amount_cents,order_comp,customer_id,service_charge_cents,delivery_charge,order_type&id=eq.${orderId}`,
      { headers: dbHeaders },
    )
    if (!orderRes.ok) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch order' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }
    const orders = (await orderRes.json()) as Array<{ id: string; restaurant_id: string; status: string; final_total_cents: number | null; discount_amount_cents: number | null; order_comp: boolean | null; customer_id: string | null; service_charge_cents: number | null; delivery_charge: number | null; order_type: string | null }>
    if (orders.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Order not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }
    if (orders[0].status !== 'pending_payment') {
      return new Response(
        JSON.stringify({ success: false, error: 'Order is not pending payment' }),
        { status: 409, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }
    const restaurantId = orders[0].restaurant_id

    // If order is fully comp'd, effective total is 0
    const isOrderComp = orders[0].order_comp === true
    const rawFinalTotalCents = orders[0].final_total_cents ?? 0
    const discountAmountCents = orders[0].discount_amount_cents ?? 0
    const serviceChargeCents = orders[0].service_charge_cents ?? 0
    const orderType = orders[0].order_type ?? 'dine_in'
    const deliveryChargeCents = orderType === 'delivery' ? (orders[0].delivery_charge ?? 0) : 0

    // Fetch VAT config to include VAT in the effective bill total.
    // This mirrors the frontend's billTotalCents calculation:
    //   Subtotal → Discount → Service Charge → VAT → + Delivery
    // Defaults to 0% / exclusive if config is unavailable (best-effort, non-fatal).
    let vatPercent = 0
    let taxInclusive = false
    let vatApplies = false // conservative default: do not apply VAT if config is unavailable
    try {
      const vatConfigRes = await fetchFn(
        `${supabaseUrl}/rest/v1/config?select=key,value&restaurant_id=eq.${restaurantId}&key=in.(tax_inclusive,vat_apply_dine_in,vat_apply_takeaway,vat_apply_delivery)`,
        { headers: dbHeaders },
      )
      if (vatConfigRes.ok) {
        const cfgRows = (await vatConfigRes.json()) as Array<{ key: string; value: string }>
        const cfgMap = new Map(cfgRows.map((r) => [r.key, r.value]))
        taxInclusive = cfgMap.get('tax_inclusive') === 'true'
        // Per-type defaults: dine_in=true, takeaway=true, delivery=false
        const applyDineIn = cfgMap.has('vat_apply_dine_in') ? cfgMap.get('vat_apply_dine_in') === 'true' : true
        const applyTakeaway = cfgMap.has('vat_apply_takeaway') ? cfgMap.get('vat_apply_takeaway') === 'true' : true
        const applyDelivery = cfgMap.has('vat_apply_delivery') ? cfgMap.get('vat_apply_delivery') === 'true' : false
        vatApplies = (orderType === 'dine_in' && applyDineIn)
          || (orderType === 'takeaway' && applyTakeaway)
          || (orderType === 'delivery' && applyDelivery)
      }
      // Fetch restaurant default VAT rate (menu_id IS NULL = restaurant-level default)
      const vatRateRes = await fetchFn(
        `${supabaseUrl}/rest/v1/vat_rates?select=percentage&restaurant_id=eq.${restaurantId}&menu_id=is.null&limit=1`,
        { headers: dbHeaders },
      )
      if (vatRateRes.ok) {
        const vatRateRows = (await vatRateRes.json()) as Array<{ percentage: number | string }>
        if (vatRateRows.length > 0) {
          vatPercent = Number(vatRateRows[0].percentage) || 0
        }
      }
    } catch {
      // Non-fatal: VAT config unavailable — defaults to 0%, change calc still corrected for SC
    }

    // Compute the true bill total that the customer owes, matching the frontend's billTotalCents:
    //   postDiscountBase = subtotal (per-item discounts applied) − order-level discount
    //   vatBase          = postDiscountBase + service charge
    //   vatCents         = vatBase × vatPercent / 100  (0 when tax-inclusive — VAT already in prices)
    //   billTotal        = vatBase + vatCents + delivery charge
    const postDiscountBase = Math.max(0, rawFinalTotalCents - discountAmountCents)
    const vatBase = postDiscountBase + serviceChargeCents
    const vatCents = (vatApplies && vatPercent > 0 && !taxInclusive)
      ? Math.round((vatBase * vatPercent) / 100)
      : 0
    const finalTotalCents = isOrderComp
      ? 0
      : vatBase + vatCents + deliveryChargeCents

    // For split-payment: validate total tendered covers the order total
    const totalTenderedCents = paymentsToRecord.reduce((s, p) => s + p.amount, 0)
    if (isSplitPath && totalTenderedCents < finalTotalCents) {
      return new Response(
        JSON.stringify({ success: false, error: 'Total tendered does not cover the order total' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }

    // Change / tip due: tendered minus bill total.
    // For cash entries this is physical change returned to the customer.
    // For card/mobile-only over-tender it is a tip — the cashier sees the amount and
    // no physical change is expected from the card terminal.
    const changeDue = Math.max(0, totalTenderedCents - finalTotalCents)

    // Primary payment (for audit + legacy response)
    const primaryPayment = paymentsToRecord[0]

    // 2. Mark the order as paid first (prevents duplicate payment processing)
    const closeRes = await fetchFn(
      `${supabaseUrl}/rest/v1/orders?id=eq.${orderId}`,
      {
        method: 'PATCH',
        headers: { ...dbHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({ status: 'paid' }),
      },
    )
    if (!closeRes.ok) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to update order status' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }

    // 3. Insert payment record(s)
    //    For split payments, insert all rows in a single batch POST.
    //
    //    amount_cents      = the bill portion attributed to this payment method.
    //    tendered_amount_cents = the physical amount handed over by the customer.
    //
    //    Payments are applied in order; each method covers as much of the remaining
    //    bill balance as possible (capped at that method's tendered amount).
    //    Any tendered amount above the bill balance (tip / change) is stored only in
    //    tendered_amount_cents and in the top-level change_due — it is NOT included in
    //    amount_cents, keeping revenue reports accurate.
    //
    //      • For card/mobile: typically tendered = bill portion (no change). If the
    //        customer over-tenders (tip on card), amount_cents = bill portion,
    //        tendered_amount_cents = full card charge.
    //      • For cash: tendered may exceed the bill portion; change is given back.
    let billRemaining = finalTotalCents
    const paymentRows = paymentsToRecord.map((p) => {
      const billAmountCents = Math.min(p.amount, billRemaining)
      billRemaining = Math.max(0, billRemaining - billAmountCents)
      return {
        order_id: orderId,
        method: p.method,
        amount_cents: billAmountCents,
        tendered_amount_cents: p.amount,
        discount_amount_cents: undefined as number | undefined,
      }
    })
    // Only spread discount on the first row (it belongs to the order, not per-method)
    // Reset discount on subsequent rows to avoid double-counting in reports
    if (discountAmountCents > 0) {
      paymentRows[0].discount_amount_cents = discountAmountCents
    }

    const paymentRes = await fetchFn(
      `${supabaseUrl}/rest/v1/payments`,
      {
        method: 'POST',
        headers: dbHeaders,
        body: JSON.stringify(paymentRows.length === 1 ? paymentRows[0] : paymentRows),
      },
    )
    if (!paymentRes.ok) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to record payment' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }
    const inserted = (await paymentRes.json()) as Array<{ id: string }>
    const paymentId = inserted[0].id

    // 4. Emit audit log entry — actor_id comes from verified JWT
    const auditRes = await fetchFn(
      `${supabaseUrl}/rest/v1/audit_log`,
      {
        method: 'POST',
        headers: { ...dbHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({
          restaurant_id: restaurantId,
          user_id: caller.actorId,
          action: 'record_payment',
          entity_type: 'payments',
          entity_id: paymentId,
          payload: {
            order_id: orderId,
            method: primaryPayment.method,
            amount_cents: primaryPayment.amount,
            ...(isSplitPath ? { split: true, payment_count: paymentsToRecord.length } : {}),
          },
        }),
      },
    )
    if (!auditRes.ok) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to write audit log' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }

    // 5. Award loyalty points to the linked customer (best-effort — never block payment)
    //    Points are awarded on payment (not on close) to avoid double-awarding on cancelled/voided orders.
    //    customer_id was already fetched in step 1 — no extra DB roundtrip needed.
    try {
      const customerId = orders[0].customer_id
      if (customerId && isValidUuid(customerId)) {
        // Fetch loyalty_points_per_order from config
        const configRes = await fetchFn(
          `${supabaseUrl}/rest/v1/config?select=value&restaurant_id=eq.${restaurantId}&key=eq.loyalty_points_per_order&limit=1`,
          { headers: dbHeaders },
        )
        let pointsToAward = 10 // default if not configured
        if (configRes.ok) {
          const configRows = (await configRes.json()) as Array<{ value: string }>
          if (configRows.length > 0) {
            const parsed = parseInt(configRows[0].value, 10)
            if (!isNaN(parsed) && parsed >= 0) {
              pointsToAward = parsed
            }
          }
        }
        if (pointsToAward > 0) {
          await fetchFn(
            `${supabaseUrl}/rest/v1/rpc/award_loyalty_points`,
            {
              method: 'POST',
              headers: { ...dbHeaders, Prefer: 'return=minimal' },
              body: JSON.stringify({ p_customer_id: customerId, p_points: pointsToAward }),
            },
          ).catch(() => { /* Non-fatal */ })
        }
      }
    } catch {
      // Best-effort: loyalty point awarding must never block payment recording
    }

    return new Response(
      JSON.stringify({ success: true, data: { payment_id: paymentId, change_due: changeDue } }),
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
