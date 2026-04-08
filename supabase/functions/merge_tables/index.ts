import { verifyAndGetCaller } from '../_shared/auth.ts'

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-demo-staff-id',
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

export async function handler(
  req: Request,
  fetchFn: FetchFn = fetch,
  env: HandlerEnv | null = readEnv(),
): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  if (req.method === 'GET' && new URL(req.url).pathname.endsWith('/health')) {
    return new Response(
      JSON.stringify({ ok: true, function: 'merge_tables' }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }

  if (!env) {
    return new Response(
      JSON.stringify({ success: false, error: 'Server configuration error' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }

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

  const payload = body as Record<string, unknown>
  if (typeof payload['primary_order_id'] !== 'string' || payload['primary_order_id'] === '') {
    return new Response(
      JSON.stringify({ success: false, error: 'primary_order_id is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }
  if (typeof payload['secondary_table_id'] !== 'string' || payload['secondary_table_id'] === '') {
    return new Response(
      JSON.stringify({ success: false, error: 'secondary_table_id is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }

  const primaryOrderId = payload['primary_order_id'] as string
  const secondaryTableId = payload['secondary_table_id'] as string

  const { supabaseUrl, serviceKey } = env
  const dbHeaders = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  }

  try {
    // 1. Fetch the primary order — must be open or pending_payment and dine_in
    const primaryOrderRes = await fetchFn(
      `${supabaseUrl}/rest/v1/orders?select=id,status,table_id,order_type&id=eq.${primaryOrderId}`,
      { headers: dbHeaders },
    )
    if (!primaryOrderRes.ok) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch primary order' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }
    const primaryOrders = (await primaryOrderRes.json()) as Array<{
      id: string
      status: string
      table_id: string | null
      order_type: string
    }>
    if (primaryOrders.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Primary order not found' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }
    const primaryOrder = primaryOrders[0]
    if (!['open', 'pending_payment'].includes(primaryOrder.status)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Primary order is not open' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }
    if (primaryOrder.order_type !== 'dine_in') {
      return new Response(
        JSON.stringify({ success: false, error: 'Only dine-in orders can be merged' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }
    if (primaryOrder.table_id === secondaryTableId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Cannot merge a table with itself' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }

    // 2. Fetch the primary table label
    const primaryTableRes = await fetchFn(
      `${supabaseUrl}/rest/v1/tables?select=id,label&id=eq.${primaryOrder.table_id}`,
      { headers: dbHeaders },
    )
    if (!primaryTableRes.ok) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch primary table' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }
    const primaryTables = (await primaryTableRes.json()) as Array<{ id: string; label: string }>
    if (primaryTables.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Primary table not found' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }
    const primaryTableLabel = primaryTables[0].label

    // 3. Fetch the secondary table — must exist and not already be locked
    const secondaryTableRes = await fetchFn(
      `${supabaseUrl}/rest/v1/tables?select=id,label,locked_by_order_id&id=eq.${secondaryTableId}`,
      { headers: dbHeaders },
    )
    if (!secondaryTableRes.ok) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch secondary table' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }
    const secondaryTables = (await secondaryTableRes.json()) as Array<{
      id: string
      label: string
      locked_by_order_id: string | null
    }>
    if (secondaryTables.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Secondary table not found' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }
    const secondaryTable = secondaryTables[0]
    if (secondaryTable.locked_by_order_id !== null) {
      return new Response(
        JSON.stringify({ success: false, error: 'Secondary table is already part of a merge' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }

    // 4. Find the secondary table's open order
    const secondaryOrderRes = await fetchFn(
      `${supabaseUrl}/rest/v1/orders?select=id,status&table_id=eq.${secondaryTableId}&status=in.(open,pending_payment)&order_type=eq.dine_in`,
      { headers: dbHeaders },
    )
    if (!secondaryOrderRes.ok) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch secondary order' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }
    const secondaryOrders = (await secondaryOrderRes.json()) as Array<{ id: string; status: string }>
    if (secondaryOrders.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Secondary table has no open order to merge' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }
    const secondaryOrderId = secondaryOrders[0].id

    // 5. Move all order_items from secondary order to primary order
    const moveItemsRes = await fetchFn(
      `${supabaseUrl}/rest/v1/order_items?order_id=eq.${secondaryOrderId}`,
      {
        method: 'PATCH',
        headers: { ...dbHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({ order_id: primaryOrderId }),
      },
    )
    if (!moveItemsRes.ok) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to move order items' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }

    // 6. Cancel the secondary order
    const cancelSecondaryRes = await fetchFn(
      `${supabaseUrl}/rest/v1/orders?id=eq.${secondaryOrderId}`,
      {
        method: 'PATCH',
        headers: { ...dbHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({ status: 'cancelled' }),
      },
    )
    if (!cancelSecondaryRes.ok) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to cancel secondary order' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }

    // 7. Lock the secondary table: set locked_by_order_id → primary order
    const lockTableRes = await fetchFn(
      `${supabaseUrl}/rest/v1/tables?id=eq.${secondaryTableId}`,
      {
        method: 'PATCH',
        headers: { ...dbHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({ locked_by_order_id: primaryOrderId }),
      },
    )
    if (!lockTableRes.ok) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to lock secondary table' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }

    // 8. Compute the new merge_label.
    // If primary order already has a merge_label, append to it.
    // Otherwise build from scratch: "PrimaryLabel + SecondaryLabel"
    const existingMergeLabelRes = await fetchFn(
      `${supabaseUrl}/rest/v1/orders?select=merge_label&id=eq.${primaryOrderId}`,
      { headers: dbHeaders },
    )
    let baseLabel = primaryTableLabel
    if (existingMergeLabelRes.ok) {
      const rows = (await existingMergeLabelRes.json()) as Array<{ merge_label: string | null }>
      if (rows.length > 0 && rows[0].merge_label) {
        baseLabel = rows[0].merge_label
      }
    }
    const newMergeLabel = `${baseLabel} + ${secondaryTable.label}`

    // 9. Update primary order with the new merge_label
    const labelUpdateRes = await fetchFn(
      `${supabaseUrl}/rest/v1/orders?id=eq.${primaryOrderId}`,
      {
        method: 'PATCH',
        headers: { ...dbHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({ merge_label: newMergeLabel }),
      },
    )
    if (!labelUpdateRes.ok) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to update merge label' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }

    // 10. Audit log
    await fetchFn(`${supabaseUrl}/rest/v1/audit_log`, {
      method: 'POST',
      headers: { ...dbHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify({
        actor_id: caller.actorId,
        action: 'merge_tables',
        target_type: 'order',
        target_id: primaryOrderId,
        meta: {
          secondary_table_id: secondaryTableId,
          secondary_order_id: secondaryOrderId,
          merge_label: newMergeLabel,
        },
      }),
    }).catch(() => { /* non-fatal */ })

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          primary_order_id: primaryOrderId,
          secondary_table_id: secondaryTableId,
          merge_label: newMergeLabel,
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
