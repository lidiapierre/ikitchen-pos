import React from 'react'
import type { JSX } from 'react'
import type { OrderItem } from '@/app/tables/[id]/order/[order_id]/orderData'
import { formatPrice, DEFAULT_CURRENCY_SYMBOL } from '@/lib/formatPrice'

export interface SplitBillPrintViewProps {
  tableId: string
  orderId: string
  items: OrderItem[]
  covers: number
  vatPercent: number
  taxInclusive?: boolean
  timestamp: string
  /** Whether this is an even split (true) or by-seat split (false) */
  evenSplit?: boolean
}

/**
 * Hidden on screen, visible only when printing (split bill).
 * Renders one section per seat (or per cover for even split).
 */
export default function SplitBillPrintView({
  tableId,
  orderId,
  items,
  covers,
  vatPercent,
  taxInclusive = false,
  timestamp,
  evenSplit = false,
}: SplitBillPrintViewProps): JSX.Element {
  // For even split: calculate total then divide
  const totalRawCents = items
    .filter((item) => !item.comp)
    .reduce((sum, item) => sum + item.quantity * item.price_cents, 0)

  // Build sections
  const sections: Array<{ label: string; items: OrderItem[]; subtotalCents: number }> = []

  if (evenSplit) {
    // Each cover gets an equal share
    const perCoverCents = Math.ceil(totalRawCents / Math.max(1, covers))
    for (let i = 1; i <= covers; i++) {
      sections.push({
        label: `Cover ${i} of ${covers}`,
        items: [], // no per-item breakdown for even split
        subtotalCents: perCoverCents,
      })
    }
  } else {
    // Group by seat
    const seatMap = new Map<number | null, OrderItem[]>()
    for (const item of items) {
      const key = item.seat
      const group = seatMap.get(key) ?? []
      group.push(item)
      seatMap.set(key, group)
    }

    // Assigned seats first, sorted
    const assignedSeats = [...seatMap.keys()]
      .filter((k): k is number => k !== null)
      .sort((a, b) => a - b)

    for (const seat of assignedSeats) {
      const seatItems = seatMap.get(seat) ?? []
      const subtotal = seatItems
        .filter((i) => !i.comp)
        .reduce((sum, i) => sum + i.quantity * i.price_cents, 0)
      sections.push({ label: `Seat ${seat}`, items: seatItems, subtotalCents: subtotal })
    }

    // Unassigned items
    const unassigned = seatMap.get(null) ?? []
    if (unassigned.length > 0) {
      const subtotal = unassigned
        .filter((i) => !i.comp)
        .reduce((sum, i) => sum + i.quantity * i.price_cents, 0)
      sections.push({ label: 'Unassigned', items: unassigned, subtotalCents: subtotal })
    }
  }

  return (
    <>
      {/*
       * Global print styles injected as a style tag.
       * When split bill is active, hide the main page and show only this component.
       */}
      <style>{`
        @media print {
          body > * { display: none !important; }
          #split-bill-print-root { display: block !important; }
        }
      `}</style>

      <div
        id="split-bill-print-root"
        aria-hidden="true"
        className="print-area hidden print:block font-mono text-black bg-white w-full"
      >
        {sections.map((section, idx) => (
          <div
            key={section.label}
            className="p-2 w-full max-w-xs mx-auto"
            style={{ pageBreakAfter: idx < sections.length - 1 ? 'always' : 'auto' }}
          >
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
              <p className="font-bold">{section.label}</p>
            </div>

            {/* Items (only for by-seat split) */}
            {!evenSplit && section.items.length > 0 && (
              <ul className="mb-2">
                {section.items.map((item) => {
                  const lineCents = item.quantity * item.price_cents
                  const isComp = item.comp
                  return (
                    <li key={item.id} className="flex justify-between text-sm">
                      <span>
                        {item.quantity}× {item.name}
                        {isComp && <span className="ml-1 text-xs">[COMP]</span>}
                      </span>
                      {isComp ? (
                        <span className="italic text-xs">Complimentary</span>
                      ) : (
                        <span>{formatPrice(lineCents, DEFAULT_CURRENCY_SYMBOL)}</span>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}

            {/* Totals */}
            <div className="border-t border-black pt-1 mb-2 text-sm space-y-0.5">
              {vatPercent > 0 && !taxInclusive && (
                <>
                  <div className="flex justify-between">
                    <span>Subtotal</span>
                    <span>{formatPrice(section.subtotalCents, DEFAULT_CURRENCY_SYMBOL)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>VAT {vatPercent}%</span>
                    <span>
                      {formatPrice(
                        Math.round(section.subtotalCents * vatPercent / 100),
                        DEFAULT_CURRENCY_SYMBOL,
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between font-bold">
                    <span>Total</span>
                    <span>
                      {formatPrice(
                        Math.round(section.subtotalCents * (1 + vatPercent / 100)),
                        DEFAULT_CURRENCY_SYMBOL,
                      )}
                    </span>
                  </div>
                </>
              )}
              {(vatPercent === 0 || taxInclusive) && (
                <div className="flex justify-between font-bold">
                  <span>Total{taxInclusive && vatPercent > 0 ? ` (incl. VAT ${vatPercent}%)` : ''}</span>
                  <span>{formatPrice(section.subtotalCents, DEFAULT_CURRENCY_SYMBOL)}</span>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-black mt-2 pt-1 text-center text-xs">
              Thank you for dining with us!
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
