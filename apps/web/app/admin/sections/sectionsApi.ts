interface ActionResponse {
  success: boolean
  data?: Record<string, unknown>
  error?: string
}

function buildHeaders(accessToken: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  }
}

async function callFunction(
  supabaseUrl: string,
  accessToken: string,
  functionName: string,
  method: string,
  body: unknown,
): Promise<ActionResponse> {
  const res = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
    method,
    headers: buildHeaders(accessToken),
    body: JSON.stringify(body),
  })
  const json = (await res.json().catch(() => ({ success: false, error: 'Request failed' }))) as ActionResponse
  if (!res.ok) {
    throw new Error(json.error ?? `${functionName} failed`)
  }
  return json
}

export async function callCreateSection(
  supabaseUrl: string,
  accessToken: string,
  restaurantId: string,
  name: string,
): Promise<Record<string, unknown>> {
  const result = await callFunction(supabaseUrl, accessToken, 'manage_sections', 'POST', {
    restaurant_id: restaurantId,
    name,
  })
  return result.data ?? {}
}

export async function callUpdateSection(
  supabaseUrl: string,
  accessToken: string,
  sectionId: string,
  updates: { name?: string; assigned_server_id?: string | null; sort_order?: number; grid_cols?: number; grid_rows?: number },
): Promise<void> {
  await callFunction(supabaseUrl, accessToken, 'manage_sections', 'PATCH', {
    section_id: sectionId,
    ...updates,
  })
}

export async function callDeleteSection(
  supabaseUrl: string,
  accessToken: string,
  sectionId: string,
): Promise<void> {
  await callFunction(supabaseUrl, accessToken, 'manage_sections', 'DELETE', {
    section_id: sectionId,
  })
}

export async function callAssignTableSection(
  supabaseUrl: string,
  accessToken: string,
  tableId: string,
  sectionId: string | null,
): Promise<void> {
  await callFunction(supabaseUrl, accessToken, 'assign_table_section', 'POST', {
    table_id: tableId,
    section_id: sectionId,
  })
}
