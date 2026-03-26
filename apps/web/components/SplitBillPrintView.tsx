import React from 'react'
import type { JSX } from 'react'
import type { OrderItem } from '@/app/tables/[id]/order/[order_id]/orderData'
import { formatPrice, DEFAULT_CURRENCY_SYMBOL } from '@/lib/formatPrice'

export interface SplitBillPrintViewProps {
  tableId: string
  orderId: string
  items: OrderItem[]
  covers: number
  totalCents: number
  mode: 'even' | 'seat'
  timestamp: string
  currencySymbol?: string
}

/**
 * Print-only component for split bill.
 * Hidden on screen; visible only when the browser print dialog is open.
 */
export default function SplitBillPrintView({
  tableId,
  items,
  covers,
  totalCents,
  mode,
  timestamp,
  currencySymbol = DEFAULT_CURRENCY_SYMBOL,
}: SplitBillPrintViewProps): JSX.Element {
  if (mode === 'even') {
    const perPersonCents = covers > 0 ? Math.ceil(totalCents / covers) : totalCents
    return (
      <div className="print-only hidden print:block font-mono text-sm p-4">
        <h2 className="text-center font-bold text-base mb-2">SPLIT BILL — EVEN</h2>
        <p className="text-center mb-1">Table: {tableId}</p>
        <p className="text-center mb-4 text-xs text-gray-500">{timestamp}</p>
        <hr className="mb-3" />
        <div className="mb-3">
          {Array.from({ length: covers }, (_, i) => (
            <div key={i} className="flex justify-between mb-1">
              <span>Cover {i + 1}</span>
              <span>{formatPrice(perPersonCents, currencySymbol)}</span>
            </div>
          ))}
        </div>
        <hr className="mb-2" />
        <div className="flex justify-between font-bold">
          <span>Total ({covers} covers)</span>
          <span>{formatPrice(totalCents, currencySymbol)}</span>
        </div>
      </div>
    )
  }

  // By seat — group items by seat
  const seatMap = new Map<number | null, OrderItem[]>()
  for (const item of items) {
    const seat = (item as OrderItem & { seat?: number | null }).seat ?? null
    const existing = seatMap.get(seat) ?? []
    existing.push(item)
    seatMap.set(seat, existing)
  }

  const seats = Array.from(seatMap.entries()).sort(([a], [b]) => {
    if (a === null) return 1
    if (b === null) return -1
    return a - b
  })

  return (
    <div className="print-only hidden print:block font-mono text-sm p-4">
      <h2 className="text-center font-bold text-base mb-2">SPLIT BILL — BY SEAT</h2>
      <p className="text-center mb-1">Table: {tableId}</p>
      <p className="text-center mb-4 text-xs text-gray-500">{timestamp}</p>
      {seats.map(([seat, seatItems]) => {
        const seatTotal = seatItems.reduce((s, i) => s + i.quantity * i.price_cents, 0)
        return (
          <div key={seat ?? 'unassigned'} className="mb-4">
            <hr className="mb-2" />
            <p className="font-bold mb-1">{seat !== null ? `Seat ${seat}` : 'Unassigned'}</p>
            {seatItems.map((item) => (
              <div key={item.id} className="flex justify-between">
                <span>{item.name} ×{item.quantity}</span>
                <span>{formatPrice(item.quantity * item.price_cents, currencySymbol)}</span>
              </div>
            ))}
            <div className="flex justify-between font-semibold mt-1">
              <span>Subtotal</span>
              <span>{formatPrice(seatTotal, currencySymbol)}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
