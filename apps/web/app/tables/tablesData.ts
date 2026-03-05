export interface TableRow {
  id: string
  label: string
  open_order_id: string | null
}

interface OrderRow {
  id: string
}

interface TableApiRow {
  id: string
  label: string
  orders: OrderRow[]
}

export async function fetchTables(
  supabaseUrl: string,
  apiKey: string,
): Promise<TableRow[]> {
  const url = new URL(`${supabaseUrl}/rest/v1/tables`)
  url.searchParams.set('select', 'id,label,orders!left(id)')
  url.searchParams.set('orders.status', 'eq.open')

  const res = await fetch(url.toString(), {
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`,
    },
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Failed to fetch tables: ${res.status} ${res.statusText} — ${body}`)
  }

  const rows = (await res.json()) as TableApiRow[]
  return rows.map((row) => ({
    id: row.id,
    label: row.label,
    open_order_id: row.orders.length > 0 ? row.orders[0].id : null,
  }))
}
