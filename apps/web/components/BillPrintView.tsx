import React from 'react'
import type { JSX } from 'react'
import type { OrderItem } from '@/app/tables/[id]/order/[order_id]/orderData'
import { formatPrice, DEFAULT_CURRENCY_SYMBOL } from '@/lib/formatPrice'

export interface BillPrintViewProps {
  tableId: string
  orderId: string
  items: OrderItem[]
  subtotalCents: number
  vatPercent: number
  /** Whether prices already include VAT (affects label on receipt) */
  taxInclusive?: boolean
  totalCents: number
  paymentMethod: 'cash' | 'card'
  amountTenderedCents?: number
  changeDueCents?: number
  timestamp: string
}

export default function BillPrintView({
  tableId,
  orderId,
  items,
  subtotalCents,
  vatPercent,
  taxInclusive = false,
  totalCents,
  paymentMethod,
  amountTenderedCents,
  changeDueCents,
  timestamp,
}: BillPrintViewProps): JSX.Element {
  // vatCents is already pre-calculated by the caller (calcVat utility).
  // Derive it here for display only; totalCents is the authoritative value.
  const vatCents = totalCents - subtotalCents

  return (
    <div aria-hidden="true" className="hidden print:block font-mono text-black bg-white p-2 w-full max-w-xs">
      {/* Header */}
      <div className="text-center mb-2">
        <p className="text-base font-bold">Lahore by iKitchen</p>
        <p className="text-xs">Lahore by iKitchen, Dhaka</p>
        <p className="text-xs">{timestamp}</p>
      </div>

      {/* Order info */}
      <div className="border-t border-b border-black py-1 mb-2 text-sm">
        <p>Table: {tableId}</p>
        <p>Order: {orderId.slice(0, 8)}</p>
      </div>

      {/* Items */}
      <ul className="mb-2">
        {items.map((item) => {
          const lineCents = item.quantity * item.price_cents
          return (
            <li key={item.id} className="flex justify-between text-sm">
              <span>
                {item.quantity}× {item.name}
              </span>
              <span>{formatPrice(lineCents, DEFAULT_CURRENCY_SYMBOL)}</span>
            </li>
          )
        })}
      </ul>

      {/* Subtotal, VAT, Total */}
      <div className="border-t border-black pt-1 mb-2 text-sm space-y-0.5">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span>{formatPrice(subtotalCents, DEFAULT_CURRENCY_SYMBOL)}</span>
        </div>
        {vatPercent > 0 && (
          <div className="flex justify-between">
            <span>VAT {vatPercent}%{taxInclusive ? ' (incl.)' : ''}</span>
            <span>{formatPrice(vatCents, DEFAULT_CURRENCY_SYMBOL)}</span>
          </div>
        )}
        <div className="flex justify-between font-bold">
          <span>Total</span>
          <span>{formatPrice(totalCents, DEFAULT_CURRENCY_SYMBOL)}</span>
        </div>
      </div>

      {/* Payment info */}
      <div className="border-t border-black pt-1 mb-2 text-sm space-y-0.5">
        <div className="flex justify-between">
          <span>Payment</span>
          <span className="capitalize">{paymentMethod}</span>
        </div>
        {paymentMethod === 'cash' && amountTenderedCents !== undefined && (
          <div className="flex justify-between">
            <span>Tendered</span>
            <span>{formatPrice(amountTenderedCents, DEFAULT_CURRENCY_SYMBOL)}</span>
          </div>
        )}
        {paymentMethod === 'cash' && changeDueCents !== undefined && (
          <div className="flex justify-between">
            <span>Change due</span>
            <span>{formatPrice(changeDueCents, DEFAULT_CURRENCY_SYMBOL)}</span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-black mt-2 pt-1 text-center text-xs">
        Thank you for dining with us!
      </div>
    </div>
  )
}
