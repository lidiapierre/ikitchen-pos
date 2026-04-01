export interface VoiceOrderResult {
  transcript: string
  items: Array<{ menu_item_id: string; name: string; quantity: number }>
}

interface VoiceOrderResponse {
  success: boolean
  data?: VoiceOrderResult
  error?: string
}

export async function callVoiceOrder(
  supabaseUrl: string,
  accessToken: string,
  orderId: string,
  audioBlob: Blob,
): Promise<VoiceOrderResult> {
  const formData = new FormData()
  formData.append('audio', audioBlob, 'audio.webm')
  formData.append('order_id', orderId)

  const res = await fetch(`${supabaseUrl}/functions/v1/voice_order`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: formData,
  })

  if (!res.ok) {
    let errorMsg = `Voice order failed: ${res.status}`
    try {
      const errJson = await res.json() as { error?: string }
      if (errJson.error) errorMsg = errJson.error
    } catch { /* ignore */ }
    throw new Error(errorMsg)
  }

  const json = (await res.json()) as VoiceOrderResponse

  if (!json.success || !json.data) {
    throw new Error(json.error ?? 'Voice order failed')
  }

  return json.data
}
