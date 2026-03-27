import React from 'react'
import type { JSX } from 'react'
import type { OrderItem } from '@/app/tables/[id]/order/[order_id]/orderData'
import { formatPrice, DEFAULT_CURRENCY_SYMBOL } from '@/lib/formatPrice'

export interface SplitBillPrintViewProps {
  tableLabel: string
  orderId: string
  items: OrderItem[]
  covers: number
  vatPercent: number
  taxInclusive?: boolean
  timestamp: string
  /** Whether this is an even split (true) or by-seat split (false) */
  evenSplit?: boolean
  /** Service charge rate in percent (e.g. 10 for 10%). 0 = hidden. */
  serviceChargePercent?: number

  // --- Enhanced bill header fields (issue #261) ---
  /** Restaurant name (overrides hard-coded default). */
  restaurantName?: string
  /** Restaurant address shown below name. */
  restaurantAddress?: string
  /** VAT / BIN registration number. */
  binNumber?: string
  /** Sequential bill reference e.g. RN0001234. */
  billNumber?: string
  /** Terminal / register name e.g. "Cashier 1". */
  registerName?: string
}

/**
 * Hidden on screen, visible only when printing (split bill).
 * Renders one section per seat (or per cover for even split).
 */
export default function SplitBillPrintView({
  tableLabel,
  orderId,
  items,
  covers,
  vatPercent,
  taxInclusive = false,
  timestamp,
  evenSplit = false,
  serviceChargePercent = 0,
  restaurantName = 'Lahore by iKitchen',
  restaurantAddress = 'Lahore by iKitchen, Dhaka',
  binNumber,
  billNumber,
  registerName,
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
        className="hidden print:block font-mono text-black bg-white w-full"
      >
        {sections.map((section, idx) => (
          <div
            key={section.label}
            className="p-2 w-full max-w-xs mx-auto"
            style={{ pageBreakAfter: idx < sections.length - 1 ? 'always' : 'auto' }}
          >
            {/* Header */}
            <div className="text-center mb-1">
              <p className="text-base font-bold">{restaurantName}</p>
              <p className="text-xs">{restaurantAddress}</p>
            </div>

            {/* BIN # */}
            {binNumber && (
              <div className="text-center mb-1">
                <p className="text-xs">BIN: {binNumber}</p>
              </div>
            )}

            {/* Order info */}
            <div className="border-t border-b border-black py-1 mb-2 text-xs space-y-0.5">
              {billNumber && (
                <div className="flex justify-between">
                  <span className="font-semibold">Bill No</span>
                  <span>{billNumber}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>Date</span>
                <span>{timestamp}</span>
              </div>
              {registerName && (
                <div className="flex justify-between">
                  <span>Register</span>
                  <span>{registerName}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>Table</span>
                <span>{tableLabel}</span>
              </div>
              <div className="flex justify-between">
                <span>Order#</span>
                <span>{orderId.slice(0, 8)}</span>
              </div>
              <div className="font-bold text-sm">{section.label}</div>
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
              {(vatPercent > 0 && !taxInclusive) || serviceChargePercent > 0 ? (
                (() => {
                  const scCents = serviceChargePercent > 0
                    ? Math.round(section.subtotalCents * serviceChargePercent / 100)
                    : 0
                  const vatBase = section.subtotalCents + scCents
                  const vatCents = vatPercent > 0 && !taxInclusive
                    ? Math.round(vatBase * vatPercent / 100)
                    : 0
                  const sectionTotal = vatBase + vatCents
                  return (
                    <>
                      <div className="flex justify-between">
                        <span>Subtotal</span>
                        <span>{formatPrice(section.subtotalCents, DEFAULT_CURRENCY_SYMBOL)}</span>
                      </div>
                      {serviceChargePercent > 0 && scCents > 0 && (
                        <div className="flex justify-between">
                          <span>Service Charge ({serviceChargePercent}%)</span>
                          <span>{formatPrice(scCents, DEFAULT_CURRENCY_SYMBOL)}</span>
                        </div>
                      )}
                      {vatPercent > 0 && !taxInclusive && (
                        <div className="flex justify-between">
                          <span>VAT {vatPercent}%</span>
                          <span>{formatPrice(vatCents, DEFAULT_CURRENCY_SYMBOL)}</span>
                        </div>
                      )}
                      <div className="flex justify-between font-bold">
                        <span>Total</span>
                        <span>{formatPrice(sectionTotal, DEFAULT_CURRENCY_SYMBOL)}</span>
                      </div>
                    </>
                  )
                })()
              ) : (
                <div className="flex justify-between font-bold">
                  <span>Total{taxInclusive && vatPercent > 0 ? ` (incl. VAT ${vatPercent}%)` : ''}</span>
                  <span>{formatPrice(section.subtotalCents, DEFAULT_CURRENCY_SYMBOL)}</span>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-black mt-2 pt-1 text-center text-xs">
              Thank You!!!
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
