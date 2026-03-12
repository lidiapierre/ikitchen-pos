import type { TableRow } from '../tablesData'

interface TableApiRow {
  id: string
  label: string
}

interface OrderApiRow {
  id: string
}

export async function fetchTableById(
  supabaseUrl: string,
  apiKey: string,
  tableId: string,
): Promise<TableRow> {
  const headers = {
    apikey: apiKey,
    Authorization: `Bearer ${apiKey}`,
  }

  const tableUrl = new URL(`${supabaseUrl}/rest/v1/tables`)
  tableUrl.searchParams.set('select', 'id,label')
  tableUrl.searchParams.set('id', `eq.${tableId}`)

  const tableRes = await fetch(tableUrl.toString(), { headers })

  if (!tableRes.ok) {
    const body = await tableRes.text()
    throw new Error(`Failed to fetch table: ${tableRes.status} ${tableRes.statusText} — ${body}`)
  }

  const tables = (await tableRes.json()) as TableApiRow[]
  const tableRow = tables[0]

  if (!tableRow) {
    throw new Error('Table not found')
  }

  const orderUrl = new URL(`${supabaseUrl}/rest/v1/orders`)
  orderUrl.searchParams.set('select', 'id')
  orderUrl.searchParams.set('table_id', `eq.${tableId}`)
  orderUrl.searchParams.set('status', 'eq.open')

  const orderRes = await fetch(orderUrl.toString(), { headers })

  if (!orderRes.ok) {
    const body = await orderRes.text()
    throw new Error(`Failed to fetch order: ${orderRes.status} ${orderRes.statusText} — ${body}`)
  }

  const orders = (await orderRes.json()) as OrderApiRow[]
  const openOrder = orders[0]

  return {
    id: tableRow.id,
    label: tableRow.label,
    open_order_id: openOrder ? openOrder.id : null,
  }
}
