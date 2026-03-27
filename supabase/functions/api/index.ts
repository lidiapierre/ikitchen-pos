/**
 * iKitchen POS — Public REST API v1
 * Issue #224 — External system integrations
 *
 * Routes (all under /functions/v1/api/):
 *   GET /orders              — list orders with filters
 *   GET /orders/:id          — single order with items + payment
 *   GET /menu                — full menu (categories + items)
 *   GET /reports/revenue     — revenue summary
 *
 * Authentication: Bearer <api-key> or X-API-Key header
 * API key is SHA-256 hashed and looked up in the api_keys table.
 * All data is scoped to the restaurant the key belongs to.
 */

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-api-key',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}

type FetchFn = (input: string, init?: RequestInit) => Promise<Response>

interface Env {
  supabaseUrl: string
  serviceKey: string
}

function readEnv(): Env | null {
  const g = globalThis as { Deno?: { env: { get: (k: string) => string | undefined } } }
  if (!g.Deno) return null
  const supabaseUrl = g.Deno.env.get('SUPABASE_URL') ?? ''
  const serviceKey = g.Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!supabaseUrl || !serviceKey) return null
  return { supabaseUrl, serviceKey }
}

// ── Crypto helpers ────────────────────────────────────────────────────────────

async function sha256Hex(text: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(text)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

// ── JSON response helpers ─────────────────────────────────────────────────────

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
}

function errorResponse(message: string, status: number): Response {
  return json({ error: message }, status)
}

function envelope(
  data: unknown,
  meta: { page: number; per_page: number; total: number },
): unknown {
  return { data, meta }
}

// ── API key auth ──────────────────────────────────────────────────────────────

interface ApiKeyRow {
  id: string
  restaurant_id: string
  permissions: string
  revoked_at: string | null
}

async function authenticateRequest(
  req: Request,
  env: Env,
  fetchFn: FetchFn,
): Promise<{ restaurantId: string; permissions: string; keyId: string } | Response> {
  // Accept Authorization: Bearer <key> or X-API-Key: <key>
  let rawKey: string | null = null
  const authHeader = req.headers.get('Authorization')
  if (authHeader && authHeader.startsWith('Bearer ')) {
    rawKey = authHeader.slice(7).trim()
  }
  if (!rawKey) {
    rawKey = req.headers.get('X-API-Key')
  }
  if (!rawKey) {
    return errorResponse('Unauthorized: missing API key', 401)
  }

  const keyHash = await sha256Hex(rawKey)

  // Look up key in api_keys table using service role
  const dbHeaders = {
    apikey: env.serviceKey,
    Authorization: `Bearer ${env.serviceKey}`,
    'Content-Type': 'application/json',
  }

  const res = await fetchFn(
    `${env.supabaseUrl}/rest/v1/api_keys?key_hash=eq.${encodeURIComponent(keyHash)}&select=id,restaurant_id,permissions,revoked_at&limit=1`,
    { headers: dbHeaders },
  )

  if (!res.ok) {
    return errorResponse('Unauthorized', 401)
  }

  const rows = (await res.json()) as ApiKeyRow[]
  if (!rows || rows.length === 0) {
    return errorResponse('Unauthorized: invalid API key', 401)
  }

  const keyRow = rows[0]
  if (keyRow.revoked_at !== null) {
    return errorResponse('Unauthorized: API key has been revoked', 401)
  }

  // Update last_used_at asynchronously (fire-and-forget)
  fetchFn(
    `${env.supabaseUrl}/rest/v1/api_keys?id=eq.${encodeURIComponent(keyRow.id)}`,
    {
      method: 'PATCH',
      headers: { ...dbHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify({ last_used_at: new Date().toISOString() }),
    },
  ).catch(() => { /* best-effort */ })

  return {
    restaurantId: keyRow.restaurant_id,
    permissions: keyRow.permissions,
    keyId: keyRow.id,
  }
}

// ── Pagination helpers ────────────────────────────────────────────────────────

function parsePagination(url: URL): { page: number; perPage: number; offset: number } {
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1)
  const perPage = Math.min(
    200,
    Math.max(1, parseInt(url.searchParams.get('per_page') ?? '50', 10) || 50),
  )
  return { page, perPage, offset: (page - 1) * perPage }
}

// ── Route handlers ────────────────────────────────────────────────────────────

async function handleListOrders(
  url: URL,
  restaurantId: string,
  env: Env,
  fetchFn: FetchFn,
): Promise<Response> {
  const { page, perPage, offset } = parsePagination(url)
  const status = url.searchParams.get('status')
  const from = url.searchParams.get('from')
  const to = url.searchParams.get('to')
  const tableId = url.searchParams.get('table')

  const dbHeaders = {
    apikey: env.serviceKey,
    Authorization: `Bearer ${env.serviceKey}`,
    'Content-Type': 'application/json',
    Prefer: 'count=exact',
  }

  let query = `${env.supabaseUrl}/rest/v1/orders?restaurant_id=eq.${encodeURIComponent(restaurantId)}&select=id,table_id,status,covers,final_total_cents,discount_amount_cents,service_charge_cents,order_comp,created_at,updated_at`

  if (status) query += `&status=eq.${encodeURIComponent(status)}`
  if (from) query += `&created_at=gte.${encodeURIComponent(from + 'T00:00:00.000Z')}`
  if (to) query += `&created_at=lte.${encodeURIComponent(to + 'T23:59:59.999Z')}`
  if (tableId) query += `&table_id=eq.${encodeURIComponent(tableId)}`
  query += `&order=created_at.desc&limit=${perPage}&offset=${offset}`

  const res = await fetchFn(query, { headers: dbHeaders })
  if (!res.ok) {
    return errorResponse('Failed to fetch orders', 500)
  }

  const orders = await res.json()
  const contentRange = res.headers.get('Content-Range') ?? ''
  const total = parseInt(contentRange.split('/')[1] ?? '0', 10) || 0

  return json(envelope(orders, { page, per_page: perPage, total }))
}

async function handleGetOrder(
  orderId: string,
  restaurantId: string,
  env: Env,
  fetchFn: FetchFn,
): Promise<Response> {
  const dbHeaders = {
    apikey: env.serviceKey,
    Authorization: `Bearer ${env.serviceKey}`,
    'Content-Type': 'application/json',
  }

  // Fetch order (verify it belongs to restaurant)
  const orderRes = await fetchFn(
    `${env.supabaseUrl}/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}&restaurant_id=eq.${encodeURIComponent(restaurantId)}&select=id,table_id,status,covers,final_total_cents,discount_amount_cents,service_charge_cents,order_comp,order_comp_reason,created_at,updated_at&limit=1`,
    { headers: dbHeaders },
  )
  if (!orderRes.ok) return errorResponse('Failed to fetch order', 500)

  const orders = (await orderRes.json()) as unknown[]
  if (!orders || orders.length === 0) {
    return errorResponse('Order not found', 404)
  }
  const order = orders[0] as Record<string, unknown>

  // Fetch items
  const itemsRes = await fetchFn(
    `${env.supabaseUrl}/rest/v1/order_items?order_id=eq.${encodeURIComponent(orderId)}&select=id,menu_item_id,quantity,unit_price_cents,voided,comp,comp_reason,seat,created_at,menu_items(id,name,price_cents)&limit=500`,
    { headers: dbHeaders },
  )
  const items = itemsRes.ok ? ((await itemsRes.json()) as unknown[]) : []

  // Fetch payments
  const paymentsRes = await fetchFn(
    `${env.supabaseUrl}/rest/v1/payments?order_id=eq.${encodeURIComponent(orderId)}&select=id,method,amount_cents,created_at&limit=100`,
    { headers: dbHeaders },
  )
  const payments = paymentsRes.ok ? ((await paymentsRes.json()) as unknown[]) : []

  return json(
    envelope(
      { ...order, items, payments },
      { page: 1, per_page: 1, total: 1 },
    ),
  )
}

async function handleGetMenu(
  restaurantId: string,
  env: Env,
  fetchFn: FetchFn,
): Promise<Response> {
  const dbHeaders = {
    apikey: env.serviceKey,
    Authorization: `Bearer ${env.serviceKey}`,
    'Content-Type': 'application/json',
  }

  // Fetch menus (categories) with their items
  const menuRes = await fetchFn(
    `${env.supabaseUrl}/rest/v1/menus?restaurant_id=eq.${encodeURIComponent(restaurantId)}&select=id,name,created_at,menu_items(id,name,price_cents,available,description,created_at)&order=name.asc&limit=200`,
    { headers: dbHeaders },
  )
  if (!menuRes.ok) return errorResponse('Failed to fetch menu', 500)

  const menus = (await menuRes.json()) as unknown[]
  const total = menus.length

  return json(envelope(menus, { page: 1, per_page: total, total }))
}

async function handleGetRevenue(
  url: URL,
  restaurantId: string,
  env: Env,
  fetchFn: FetchFn,
): Promise<Response> {
  const period = url.searchParams.get('period') ?? 'day'
  const fromParam = url.searchParams.get('from')
  const toParam = url.searchParams.get('to')

  // Calculate date range
  const now = new Date()
  let start: string
  let end: string

  if (fromParam && toParam) {
    start = `${fromParam}T00:00:00.000Z`
    end = `${toParam}T23:59:59.999Z`
  } else if (period === 'week') {
    const day = now.getUTCDay()
    const diff = now.getUTCDate() - day + (day === 0 ? -6 : 1)
    const monday = new Date(now)
    monday.setUTCDate(diff)
    start = `${monday.toISOString().slice(0, 10)}T00:00:00.000Z`
    end = `${now.toISOString().slice(0, 10)}T23:59:59.999Z`
  } else if (period === 'month') {
    const yr = now.getUTCFullYear()
    const mo = String(now.getUTCMonth() + 1).padStart(2, '0')
    start = `${yr}-${mo}-01T00:00:00.000Z`
    end = `${now.toISOString().slice(0, 10)}T23:59:59.999Z`
  } else {
    // day
    const dateStr = now.toISOString().slice(0, 10)
    start = `${dateStr}T00:00:00.000Z`
    end = `${dateStr}T23:59:59.999Z`
  }

  const dbHeaders = {
    apikey: env.serviceKey,
    Authorization: `Bearer ${env.serviceKey}`,
    'Content-Type': 'application/json',
  }

  const ordersRes = await fetchFn(
    `${env.supabaseUrl}/rest/v1/orders?restaurant_id=eq.${encodeURIComponent(restaurantId)}&status=eq.paid&created_at=gte.${encodeURIComponent(start)}&created_at=lte.${encodeURIComponent(end)}&select=id,final_total_cents,covers,discount_amount_cents,service_charge_cents,order_comp,created_at&limit=10000`,
    { headers: dbHeaders },
  )
  if (!ordersRes.ok) return errorResponse('Failed to fetch revenue data', 500)

  const orders = (await ordersRes.json()) as Array<{
    id: string
    final_total_cents: number | null
    covers: number | null
    discount_amount_cents: number | null
    service_charge_cents: number | null
    order_comp: boolean | null
    created_at: string
  }>

  let totalRevenueCents = 0
  let totalCovers = 0
  let totalServiceChargeCents = 0
  let totalDiscountCents = 0
  let compOrderCount = 0
  const byDay: Record<string, { revenue_cents: number; order_count: number }> = {}

  for (const o of orders) {
    totalRevenueCents += o.final_total_cents ?? 0
    totalCovers += o.covers ?? 0
    totalServiceChargeCents += o.service_charge_cents ?? 0
    totalDiscountCents += o.discount_amount_cents ?? 0
    if (o.order_comp) compOrderCount++

    const date = o.created_at.slice(0, 10)
    if (!byDay[date]) byDay[date] = { revenue_cents: 0, order_count: 0 }
    byDay[date].revenue_cents += o.final_total_cents ?? 0
    byDay[date].order_count++
  }

  const orderCount = orders.length
  const revenueByDay = Object.entries(byDay)
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => a.date.localeCompare(b.date))

  // Payment breakdown
  let paymentBreakdown: Array<{ method: string; count: number; amount_cents: number }> = []
  if (orders.length > 0) {
    const orderIds = orders.map((o) => o.id).join(',')
    const paymentsRes = await fetchFn(
      `${env.supabaseUrl}/rest/v1/payments?order_id=in.(${orderIds})&select=method,amount_cents&limit=50000`,
      { headers: dbHeaders },
    )
    if (paymentsRes.ok) {
      const payments = (await paymentsRes.json()) as Array<{ method: string; amount_cents: number }>
      const map: Record<string, { count: number; amount_cents: number }> = {}
      for (const p of payments) {
        const m = p.method ?? 'unknown'
        if (!map[m]) map[m] = { count: 0, amount_cents: 0 }
        map[m].count++
        map[m].amount_cents += p.amount_cents ?? 0
      }
      paymentBreakdown = Object.entries(map).map(([method, v]) => ({ method, ...v }))
    }
  }

  const summary = {
    period,
    from: start,
    to: end,
    order_count: orderCount,
    total_revenue_cents: totalRevenueCents,
    avg_order_cents: orderCount > 0 ? Math.round(totalRevenueCents / orderCount) : 0,
    total_covers: totalCovers,
    total_service_charge_cents: totalServiceChargeCents,
    total_discount_cents: totalDiscountCents,
    comp_order_count: compOrderCount,
    revenue_by_day: revenueByDay,
    payment_breakdown: paymentBreakdown,
  }

  return json(envelope(summary, { page: 1, per_page: 1, total: 1 }))
}

// ── API key management routes (owner-JWT protected, not API-key protected) ────

async function handleCreateApiKey(
  req: Request,
  restaurantId: string,
  env: Env,
  fetchFn: FetchFn,
): Promise<Response> {
  let body: { label?: string; permissions?: string }
  try {
    body = await req.json()
  } catch {
    return errorResponse('Invalid JSON body', 400)
  }

  const label = (body.label ?? '').trim()
  if (!label) return errorResponse('label is required', 400)

  const permissions = body.permissions === 'write' ? 'write' : 'read'

  // Generate a secure random key: "ik_" prefix + 40 random hex chars
  const rawBytes = new Uint8Array(20)
  crypto.getRandomValues(rawBytes)
  const rawKey =
    'ik_' + Array.from(rawBytes).map((b) => b.toString(16).padStart(2, '0')).join('')

  const keyHash = await sha256Hex(rawKey)
  const keyPrefix = rawKey.slice(0, 8)

  const dbHeaders = {
    apikey: env.serviceKey,
    Authorization: `Bearer ${env.serviceKey}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  }

  const insertRes = await fetchFn(`${env.supabaseUrl}/rest/v1/api_keys`, {
    method: 'POST',
    headers: dbHeaders,
    body: JSON.stringify({
      restaurant_id: restaurantId,
      label,
      key_hash: keyHash,
      key_prefix: keyPrefix,
      permissions,
    }),
  })

  if (!insertRes.ok) {
    const err = await insertRes.text()
    return errorResponse(`Failed to create API key: ${err}`, 500)
  }

  const rows = (await insertRes.json()) as Array<Record<string, unknown>>
  const created = rows[0]

  // Return the plaintext key ONCE — never again
  return json(
    {
      data: {
        id: created['id'],
        label: created['label'],
        permissions: created['permissions'],
        key_prefix: created['key_prefix'],
        created_at: created['created_at'],
        // ⚠️ This is the ONLY time the key is shown
        key: rawKey,
      },
      meta: { note: 'Save this key — it will not be shown again.' },
    },
    201,
  )
}

async function handleListApiKeys(
  restaurantId: string,
  env: Env,
  fetchFn: FetchFn,
): Promise<Response> {
  const dbHeaders = {
    apikey: env.serviceKey,
    Authorization: `Bearer ${env.serviceKey}`,
    'Content-Type': 'application/json',
  }

  const res = await fetchFn(
    `${env.supabaseUrl}/rest/v1/api_keys?restaurant_id=eq.${encodeURIComponent(restaurantId)}&revoked_at=is.null&select=id,label,permissions,key_prefix,created_at,last_used_at&order=created_at.desc&limit=200`,
    { headers: dbHeaders },
  )
  if (!res.ok) return errorResponse('Failed to fetch API keys', 500)

  const keys = (await res.json()) as unknown[]
  return json(envelope(keys, { page: 1, per_page: keys.length, total: keys.length }))
}

async function handleRevokeApiKey(
  keyId: string,
  restaurantId: string,
  env: Env,
  fetchFn: FetchFn,
): Promise<Response> {
  const dbHeaders = {
    apikey: env.serviceKey,
    Authorization: `Bearer ${env.serviceKey}`,
    'Content-Type': 'application/json',
    Prefer: 'return=minimal',
  }

  const res = await fetchFn(
    `${env.supabaseUrl}/rest/v1/api_keys?id=eq.${encodeURIComponent(keyId)}&restaurant_id=eq.${encodeURIComponent(restaurantId)}&revoked_at=is.null`,
    {
      method: 'PATCH',
      headers: dbHeaders,
      body: JSON.stringify({ revoked_at: new Date().toISOString() }),
    },
  )

  if (!res.ok) return errorResponse('Failed to revoke API key', 500)

  return json({ data: { revoked: true }, meta: { page: 1, per_page: 1, total: 1 } })
}

// ── Internal key management auth (uses JWT like other admin functions) ─────────

async function verifyOwnerJwt(
  req: Request,
  env: Env,
  fetchFn: FetchFn,
): Promise<{ restaurantId: string } | Response> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return errorResponse('Unauthorized', 401)
  }
  const token = authHeader.slice(7).trim()

  // Verify JWT via Supabase auth
  const userRes = await fetchFn(`${env.supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: env.serviceKey,
      Authorization: `Bearer ${token}`,
    },
  })
  if (!userRes.ok) return errorResponse('Unauthorized', 401)

  const user = (await userRes.json()) as { id?: string }
  if (!user.id) return errorResponse('Unauthorized', 401)

  // Check role = owner
  const roleRes = await fetchFn(
    `${env.supabaseUrl}/rest/v1/users?id=eq.${encodeURIComponent(user.id)}&select=role,restaurant_id&limit=1`,
    {
      headers: {
        apikey: env.serviceKey,
        Authorization: `Bearer ${env.serviceKey}`,
      },
    },
  )
  if (!roleRes.ok) return errorResponse('Unauthorized', 401)

  const rows = (await roleRes.json()) as Array<{ role: string; restaurant_id: string }>
  if (!rows || rows.length === 0) return errorResponse('Unauthorized', 401)

  const { role, restaurant_id } = rows[0]
  if (role !== 'owner' && role !== 'admin') {
    return errorResponse('Forbidden: owner role required', 403)
  }

  return { restaurantId: restaurant_id }
}

// ── Main router ───────────────────────────────────────────────────────────────

export async function handler(
  req: Request,
  fetchFn: FetchFn = fetch,
  env: Env | null = readEnv(),
): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  if (!env) {
    return errorResponse('Server configuration error', 500)
  }

  const url = new URL(req.url)
  // Normalize path: strip /functions/v1/api prefix
  // In Supabase edge functions the path starts at the function name
  // e.g. /functions/v1/api/orders  →  pathname = /orders
  // But when invoked via Supabase the URL will be e.g. https://<ref>.supabase.co/functions/v1/api
  // and the path inside the function is the part after /api
  let path = url.pathname
  // Strip leading /functions/v1/api if present (for direct testing)
  path = path.replace(/^\/functions\/v1\/api/, '')
  // Also strip just /api if that prefix remains
  path = path.replace(/^\/api/, '')
  // Normalize to start with /
  if (!path.startsWith('/')) path = '/' + path

  // ── Internal key management routes (JWT-authenticated, owner only) ──────────
  if (path === '/keys' || path === '/keys/') {
    if (req.method === 'GET') {
      const auth = await verifyOwnerJwt(req, env, fetchFn)
      if (auth instanceof Response) return auth
      return handleListApiKeys(auth.restaurantId, env, fetchFn)
    }
    if (req.method === 'POST') {
      const auth = await verifyOwnerJwt(req, env, fetchFn)
      if (auth instanceof Response) return auth
      return handleCreateApiKey(req, auth.restaurantId, env, fetchFn)
    }
    return errorResponse('Method not allowed', 405)
  }

  // DELETE /keys/:id
  const keyRevokeMatch = path.match(/^\/keys\/([^/]+)$/)
  if (keyRevokeMatch) {
    if (req.method === 'DELETE') {
      const auth = await verifyOwnerJwt(req, env, fetchFn)
      if (auth instanceof Response) return auth
      return handleRevokeApiKey(keyRevokeMatch[1], auth.restaurantId, env, fetchFn)
    }
    return errorResponse('Method not allowed', 405)
  }

  // ── Public API routes (API key authenticated) ───────────────────────────────
  if (req.method !== 'GET') {
    return errorResponse('Method not allowed', 405)
  }

  const auth = await authenticateRequest(req, env, fetchFn)
  if (auth instanceof Response) return auth
  const { restaurantId } = auth

  // GET /orders
  if (path === '/orders' || path === '/orders/') {
    return handleListOrders(url, restaurantId, env, fetchFn)
  }

  // GET /orders/:id
  const orderMatch = path.match(/^\/orders\/([^/]+)$/)
  if (orderMatch) {
    return handleGetOrder(orderMatch[1], restaurantId, env, fetchFn)
  }

  // GET /menu
  if (path === '/menu' || path === '/menu/') {
    return handleGetMenu(restaurantId, env, fetchFn)
  }

  // GET /reports/revenue
  if (path === '/reports/revenue') {
    return handleGetRevenue(url, restaurantId, env, fetchFn)
  }

  return errorResponse('Not found', 404)
}

// Deno entrypoint
if (typeof (globalThis as { Deno?: unknown }).Deno !== 'undefined') {
  const g = globalThis as { Deno: { serve: (h: (req: Request) => Promise<Response>) => void } }
  g.Deno.serve((req: Request) => handler(req))
}
