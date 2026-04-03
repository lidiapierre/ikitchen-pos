// All methods that can exist in the DB (including legacy 'other')
export const ALL_PAYMENT_METHODS = ['cash', 'card', 'mobile', 'other'] as const
export type PaymentMethod = typeof ALL_PAYMENT_METHODS[number]

// Methods shown in the UI payment buttons
export const PAYMENT_METHODS = ['cash', 'card', 'mobile'] as const

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Cash',
  card: 'Card / POS',
  mobile: 'Mobile',
  other: 'Other',
}
