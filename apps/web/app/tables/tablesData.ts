export interface TableRow {
  id: string
  label: string
  open_order_id: string | null
}

interface TableApiRow {
  id: string
  label: string
}

interface OrderApiRow {
  id: string
  table_id: string | null
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
  ordersUrl.searchParams.set('select', 'id,table_id')
  ordersUrl.searchParams.set('status', 'eq.open')

  const ordersRes = await fetch(ordersUrl.toString(), { headers })

  if (!ordersRes.ok) {
    const body = await ordersRes.text()
    throw new Error(`Failed to fetch orders: ${ordersRes.status} ${ordersRes.statusText} — ${body}`)
  }

  const tables = (await tablesRes.json()) as TableApiRow[]
  const orders = (await ordersRes.json()) as OrderApiRow[]

  const openOrderByTable = new Map<string, string>()
  for (const order of orders) {
    if (order.table_id !== null) {
      openOrderByTable.set(order.table_id, order.id)
    }
  }

  return tables.map((table) => ({
    id: table.id,
    label: table.label,
    open_order_id: openOrderByTable.get(table.id) ?? null,
  }))
}
