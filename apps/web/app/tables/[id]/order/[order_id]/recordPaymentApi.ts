export interface RecordPaymentResponse {
  success: boolean
  data?: { payment_id: string; change_due: number }
  error?: string
}

import type { PaymentMethod } from '@/lib/paymentMethods'

export interface SplitPaymentEntry {
  method: PaymentMethod
  amountCents: number
}

export async function callRecordPayment(
  supabaseUrl: string,
  accessToken: string,
  orderId: string,
  amountCents: number,
  method: PaymentMethod,
  orderTotalCents: number,
): Promise<{ change_due: number }> {
  if (!accessToken) throw new Error('Not authenticated — please log in and try again.')
  const res = await fetch(`${supabaseUrl}/functions/v1/record_payment`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ order_id: orderId, amount: amountCents, method, order_total_cents: orderTotalCents }),
  })
  if (!res.ok) {
    let errMsg = `HTTP ${res.status}`
    try {
      const body = (await res.json()) as { error?: string; message?: string }
      errMsg = body.error ?? body.message ?? errMsg
    } catch {
      // ignore parse error
    }
    throw new Error(errMsg)
  }
  const json = (await res.json()) as RecordPaymentResponse
  if (!json.success) {
    throw new Error(json.error ?? 'Failed to record payment')
  }
  return { change_due: json.data?.change_due ?? 0 }
}

/**
 * Submit multiple payment rows for a single order (split payment).
 * The backend validates that total tendered >= order total.
 */
export async function callRecordSplitPayment(
  supabaseUrl: string,
  accessToken: string,
  orderId: string,
  payments: SplitPaymentEntry[],
): Promise<{ change_due: number }> {
  if (!accessToken) throw new Error('Not authenticated — please log in and try again.')
  const res = await fetch(`${supabaseUrl}/functions/v1/record_payment`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      order_id: orderId,
      payments: payments.map((p) => ({ method: p.method, amount: p.amountCents })),
    }),
  })
  if (!res.ok) {
    let errMsg = `HTTP ${res.status}`
    try {
      const body = (await res.json()) as { error?: string; message?: string }
      errMsg = body.error ?? body.message ?? errMsg
    } catch {
      // ignore parse error
    }
    throw new Error(errMsg)
  }
  const json = (await res.json()) as RecordPaymentResponse
  if (!json.success) {
    throw new Error(json.error ?? 'Failed to record payment')
  }
  return { change_due: json.data?.change_due ?? 0 }
}
