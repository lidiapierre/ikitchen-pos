export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export interface DbError {
  message: string
}

export interface DbClient {
  getUserId(): Promise<string | null>
  fetchOrder(id: string): Promise<{ data: { status: string; restaurant_id: string } | null; error: DbError | null }>
  fetchMenuItem(id: string): Promise<{ data: { price_cents: number } | null; error: DbError | null }>
  insertOrderItem(item: {
    order_id: string
    menu_item_id: string
    quantity: number
    unit_price_cents: number
  }): Promise<{ data: { id: string } | null; error: DbError | null }>
  computeOrderTotal(orderId: string): Promise<{ total: number; error: DbError | null }>
  insertAuditLog(entry: {
    restaurant_id: string
    user_id: string
    action: string
    entity_type: string
    entity_id: string
    payload: Record<string, unknown>
  }): Promise<{ error: DbError | null }>
}

type ClientFactory = (authHeader: string) => Promise<DbClient>

export async function handler(req: Request, clientFactory?: ClientFactory): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response(
      JSON.stringify({ success: false, error: 'Unauthorized' }),
      { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
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
  if (
    typeof payload['quantity'] !== 'number' ||
    !Number.isInteger(payload['quantity']) ||
    payload['quantity'] < 1
  ) {
    return new Response(
      JSON.stringify({ success: false, error: 'quantity is required and must be a positive integer' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }

  const orderId = payload['order_id'] as string
  const menuItemId = payload['menu_item_id'] as string
  const quantity = payload['quantity'] as number

  const factory = clientFactory ?? createProductionClient
  const db = await factory(authHeader)

  const userId = await db.getUserId()
  if (!userId) {
    return new Response(
      JSON.stringify({ success: false, error: 'Unauthorized' }),
      { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }

  const orderResult = await db.fetchOrder(orderId)
  if (orderResult.error || !orderResult.data) {
    return new Response(
      JSON.stringify({ success: false, error: 'Order not found' }),
      { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }
  if (orderResult.data.status !== 'open') {
    return new Response(
      JSON.stringify({ success: false, error: 'Order is not open' }),
      { status: 409, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }
  const restaurantId = orderResult.data.restaurant_id

  const menuItemResult = await db.fetchMenuItem(menuItemId)
  if (menuItemResult.error || !menuItemResult.data) {
    return new Response(
      JSON.stringify({ success: false, error: 'Menu item not found' }),
      { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }
  const unitPriceCents = menuItemResult.data.price_cents

  const itemResult = await db.insertOrderItem({
    order_id: orderId,
    menu_item_id: menuItemId,
    quantity,
    unit_price_cents: unitPriceCents,
  })
  if (itemResult.error || !itemResult.data) {
    return new Response(
      JSON.stringify({ success: false, error: 'Failed to add item to order' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }
  const orderItemId = itemResult.data.id

  const totalResult = await db.computeOrderTotal(orderId)
  if (totalResult.error) {
    return new Response(
      JSON.stringify({ success: false, error: 'Failed to compute order total' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }

  await db.insertAuditLog({
    restaurant_id: restaurantId,
    user_id: userId,
    action: 'add_item_to_order',
    entity_type: 'order_item',
    entity_id: orderItemId,
    payload: { order_id: orderId, menu_item_id: menuItemId, quantity, unit_price_cents: unitPriceCents },
  })

  return new Response(
    JSON.stringify({ success: true, data: { order_item_id: orderItemId, order_total: totalResult.total } }),
    { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
  )
}

async function createProductionClient(authHeader: string): Promise<DbClient> {
  // Dynamic import — only executes in the Deno runtime, never in tests
  // @ts-ignore
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2')
  // @ts-ignore
  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: authHeader } },
  })
  return {
    async getUserId() {
      const { data: { user } } = await supabase.auth.getUser()
      return (user as { id?: string } | null)?.id ?? null
    },
    async fetchOrder(id: string) {
      const { data, error } = await supabase.from('orders').select('status, restaurant_id').eq('id', id).single()
      return { data: data as { status: string; restaurant_id: string } | null, error }
    },
    async fetchMenuItem(id: string) {
      const { data, error } = await supabase.from('menu_items').select('price_cents').eq('id', id).single()
      return { data: data as { price_cents: number } | null, error }
    },
    async insertOrderItem(item) {
      const { data, error } = await supabase.from('order_items').insert(item).select('id').single()
      return { data: data as { id: string } | null, error }
    },
    async computeOrderTotal(orderId: string) {
      const { data, error } = await supabase
        .from('order_items')
        .select('quantity, unit_price_cents')
        .eq('order_id', orderId)
        .eq('voided', false)
      if (error || !data) return { total: 0, error: error as DbError | null }
      const total = (data as Array<{ quantity: number; unit_price_cents: number }>).reduce(
        (sum, row) => sum + row.quantity * row.unit_price_cents,
        0,
      )
      return { total, error: null }
    },
    async insertAuditLog(entry) {
      const { error } = await supabase.from('audit_log').insert(entry)
      return { error }
    },
  }
}

if (typeof (globalThis as { Deno?: unknown }).Deno !== 'undefined') {
  // @ts-ignore
  Deno.serve((req: Request) => handler(req))
}
