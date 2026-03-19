export interface ExtractedMenuItem {
  name?: string
  description?: string
  price?: number
  category?: string
}

export async function callExtractMenuItem(
  supabaseUrl: string,
  apiKey: string,
  fileData: string,
  mediaType: string,
): Promise<ExtractedMenuItem> {
  const url = `${supabaseUrl}/functions/v1/extract_menu_item`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ file_data: fileData, media_type: mediaType }),
  })

  const json = (await res.json()) as { success: boolean; data?: ExtractedMenuItem; error?: string }
  if (!json.success) {
    throw new Error(json.error ?? 'Extraction failed')
  }
  return json.data ?? {}
}

export async function uploadMenuFile(
  supabaseUrl: string,
  apiKey: string,
  file: File,
): Promise<string> {
  const ext = file.name.split('.').pop() ?? 'bin'
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${ext}`
  const uploadUrl = `${supabaseUrl}/storage/v1/object/menu-uploads/${fileName}`

  const res = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      apikey: apiKey,
      'Content-Type': file.type,
    },
    body: file,
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Upload failed: ${res.status} — ${text}`)
  }

  return `${supabaseUrl}/storage/v1/object/public/menu-uploads/${fileName}`
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // Strip the data URL prefix to get raw base64
      const base64 = result.split(',')[1]
      if (!base64) {
        reject(new Error('Failed to read file as base64'))
        return
      }
      resolve(base64)
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}
