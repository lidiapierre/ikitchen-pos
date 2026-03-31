export interface TablePosition {
  id: string
  label: string
  seat_count: number
  grid_x: number | null
  grid_y: number | null
}

export async function fetchTablePositions(
  supabaseUrl: string,
  apiKey: string,
): Promise<TablePosition[]> {
  const url = `${supabaseUrl}/rest/v1/tables?select=id,label,seat_count,grid_x,grid_y&order=label.asc`
  const res = await fetch(url, {
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`,
    },
  })
  if (!res.ok) {
    throw new Error(`Failed to fetch table positions: ${res.status}`)
  }
  return res.json() as Promise<TablePosition[]>
}

export async function saveTablePosition(
  supabaseUrl: string,
  accessToken: string,
  tableId: string,
  gridX: number | null,
  gridY: number | null,
): Promise<void> {
  const res = await fetch(`${supabaseUrl}/functions/v1/update_table_position`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ table_id: tableId, grid_x: gridX, grid_y: gridY }),
  })
  if (!res.ok) {
    const json = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(json.error ?? `Failed to save table position: ${res.status}`)
  }
}
