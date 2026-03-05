import { createClient } from '@supabase/supabase-js'

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
  const client = createClient(supabaseUrl, apiKey)

  const { data, error } = await client
    .from('tables')
    .select('id,label,orders!left(id)')
    .eq('orders.status', 'open')

  if (error) {
    throw new Error(`Failed to fetch tables: ${error.message}`)
  }

  const rows = (data ?? []) as TableApiRow[]
  return rows.map((row) => ({
    id: row.id,
    label: row.label,
    open_order_id: row.orders.length > 0 ? row.orders[0].id : null,
  }))
}
