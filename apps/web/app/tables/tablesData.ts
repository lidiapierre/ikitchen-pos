export interface TableRow {
  id: string
  label: string
  open_order_id: string | null
  order_status: string | null
  order_created_at: string | null
}

interface TableApiRow {
  id: string
  label: string
}

interface OrderApiRow {
  id: string
  table_id: string | null
  status: string
  created_at: string
}

export async function fetchTables(
  supabaseUrl: string,
  apiKey: string,
): Promise<TableRow[]> {
  const headers = {
    apikey: apiKey,
    Authorization: `Bearer ${apiKey}`,
  }

  const tablesUrl = new URL(`${supabaseUrl}/rest/v1/tables`)
  tablesUrl.searchParams.set('select', 'id,label')

  const tablesRes = await fetch(tablesUrl.toString(), { headers })

  if (!tablesRes.ok) {
    const body = await tablesRes.text()
    throw new Error(`Failed to fetch tables: ${tablesRes.status} ${tablesRes.statusText} — ${body}`)
  }

  const ordersUrl = new URL(`${supabaseUrl}/rest/v1/orders`)
  ordersUrl.searchParams.set('select', 'id,table_id,status,created_at')
  ordersUrl.searchParams.set('status', 'in.(open,pending_payment)')

  const ordersRes = await fetch(ordersUrl.toString(), { headers })

  if (!ordersRes.ok) {
    const body = await ordersRes.text()
    throw new Error(`Failed to fetch orders: ${ordersRes.status} ${ordersRes.statusText} — ${body}`)
  }

  const tables = (await tablesRes.json()) as TableApiRow[]
  const orders = (await ordersRes.json()) as OrderApiRow[]

  const openOrderByTable = new Map<string, OrderApiRow>()
  for (const order of orders) {
    if (order.table_id !== null) {
      openOrderByTable.set(order.table_id, order)
    }
  }

  return tables.map((table) => {
    const order = openOrderByTable.get(table.id)
    return {
      id: table.id,
      label: table.label,
      open_order_id: order?.id ?? null,
      order_status: order?.status ?? null,
      order_created_at: order?.created_at ?? null,
    }
  })
}
