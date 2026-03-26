export interface ExtractedMenuItemDraft {
  name: string
  description?: string
  price?: number
  category?: string
}

export async function callExtractMenuBulk(
  supabaseUrl: string,
  accessToken: string | null,
  files: Array<{ data: string; media_type: string }>,
): Promise<ExtractedMenuItemDraft[]> {
  const apiKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ''
  const url = `${supabaseUrl}/functions/v1/extract_menu_bulk`
  if (!accessToken) throw new Error('Not authenticated — please log in and try again.')

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      apikey: apiKey,
    },
    body: JSON.stringify({ files }),
  })

  if (!res.ok) {
    let msg = `HTTP ${res.status}`
    try {
      const errJson = (await res.json()) as { message?: string; error?: string }
      msg = errJson.message ?? errJson.error ?? msg
    } catch { /* ignore parse error */ }
    throw new Error(msg)
  }

  const json = (await res.json()) as { success: boolean; items?: ExtractedMenuItemDraft[]; error?: string }
  if (!json.success) {
    throw new Error(json.error ?? 'Bulk extraction failed')
  }
  return json.items ?? []
}
