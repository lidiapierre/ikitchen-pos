import React from 'react'
import type { JSX } from 'react'
import type { OrderItem } from '@/app/tables/[id]/order/[order_id]/orderData'
import { calcItemDiscountCents } from '@/app/tables/[id]/order/[order_id]/orderData'
import { formatPrice, DEFAULT_CURRENCY_SYMBOL } from '@/lib/formatPrice'
import { PAYMENT_METHOD_LABELS } from '@/lib/paymentMethods'
import type { PaymentMethod } from '@/lib/paymentMethods'

export interface SplitPaymentLine {
  method: PaymentMethod
  amountCents: number
}

export interface BillPrintViewProps {
  tableLabel: string
  orderId: string
  items: OrderItem[]
  subtotalCents: number
  vatPercent: number
  /** Whether prices already include VAT (affects label on receipt) */
  taxInclusive?: boolean
  totalCents: number
  paymentMethod: PaymentMethod
  amountTenderedCents?: number
  changeDueCents?: number
  /**
   * For split payments: one entry per method used.
   * When provided, overrides the single-method paymentMethod/amountTenderedCents display.
   * Format on receipt: `Cash ৳500 | Card ৳800`
   */
  splitPayments?: SplitPaymentLine[]
  timestamp: string
  /** Discount amount in cents to show as a line item */
  discountAmountCents?: number
  /** Human-readable discount label e.g. "10% discount" */
  discountLabel?: string
  /** Whether the entire order is complimentary */
  orderComp?: boolean
  /** Service charge rate in percent (e.g. 10 for 10%). 0 = hidden. */
  serviceChargePercent?: number
  /** Service charge amount in cents — pre-calculated by caller */
  serviceChargeCents?: number
  /** Explicit VAT amount in cents — pre-calculated by caller (overrides derived vatCents) */
  vatCents?: number
  /** Order type — shown on bill for non-dine-in orders. */
  orderType?: 'dine_in' | 'takeaway' | 'delivery'
  /** Customer name for delivery/takeaway orders. */
  customerName?: string | null
  /** Delivery note / address for delivery orders. */
  deliveryNote?: string | null
  /** Customer mobile number for delivery/takeaway orders. */
  customerMobile?: string | null

  // --- Enhanced bill header fields (issue #261) ---
  /** Restaurant name (overrides hard-coded default). */
  restaurantName?: string
  /** Restaurant address shown below name. */
  restaurantAddress?: string
  /** VAT / BIN registration number. */
  binNumber?: string
  /** Sequential bill reference e.g. RN0001234. */
  billNumber?: string
  /** Location / branch name. */
  locationName?: string
  /** Terminal / register name e.g. "Cashier 1". */
  registerName?: string
  /** Staff member (server) who handled the order. */
  staffUser?: string
  /**
   * Round-off adjustment in cents (signed).
   * Positive = upward rounding added; negative = rounding deducted.
   * Show line only when non-zero.
   */
  roundOffCents?: number
  /** Short sequential numeric order number, resets daily per restaurant (issue #349). */
  orderNumber?: number | null
  /** Delivery charge in cents — shown as line item on receipt (issue #353). */
  deliveryChargeCents?: number
  /** Delivery zone name for the receipt label (issue #353). */
  deliveryZoneName?: string
  /**
   * When true, all monetary display values are rounded to the nearest whole number (half-up).
   * Controlled by the `round_bill_totals` restaurant config setting (issue #371).
   * Internal cent values are unchanged — rounding is display-only.
   */
  roundBillTotals?: boolean
  /**
   * When true, renders a pre-payment "DUE BILL" instead of a paid receipt.
   * Shows a prominent "AMOUNT DUE — UNPAID" banner and hides the payment/tendered section.
   * Issue #370 — pre-payment bill copy for dine-in and takeaway orders.
   */
  isDue?: boolean
  /** Base font size in pt (8–16). Body = fontSizePt, header = +2, badge = +4, meta = −1. Default 12pt. */
  fontSizePt?: number
}

export default function BillPrintView({
  tableLabel,
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
  discountAmountCents = 0,
  discountLabel,
  orderComp = false,
  serviceChargePercent = 0,
  serviceChargeCents = 0,
  vatCents: vatCentsProp,
  orderType = 'dine_in',
  customerName,
  deliveryNote,
  customerMobile,
  restaurantName = '',
  restaurantAddress = '',
  binNumber,
  billNumber,
  locationName,
  registerName,
  staffUser,
  roundOffCents = 0,
  orderNumber,
  deliveryChargeCents = 0,
  deliveryZoneName,
  roundBillTotals = false,
  splitPayments,
  isDue = false,
  fontSizePt = 12,
}: BillPrintViewProps): JSX.Element {
  // CSS custom properties for font size tiers (pt maps 1:1 to thermal printer physical output).
  // Exposed on root div so Tailwind arbitrary values can reference them without inline styles per child.
  const fontVars = {
    '--bill-xs':   `${Math.max(6, fontSizePt - 1)}pt`,
    '--bill-sm':   `${fontSizePt}pt`,
    '--bill-base': `${fontSizePt + 2}pt`,
    '--bill-lg':   `${fontSizePt + 4}pt`,
  } as React.CSSProperties
  // Use caller-provided vatCents when available (preferred — supports new calculation order).
  // Fall back to derived value for backward compatibility.
  const vatCents = vatCentsProp !== undefined ? vatCentsProp : totalCents - subtotalCents

  const isTakeaway = orderType === 'takeaway'
  const isDelivery = orderType === 'delivery'
  const isNonDineIn = isTakeaway || isDelivery
  const orderTypeLabel = isDelivery ? 'Delivery' : isTakeaway ? 'Takeaway' : 'Dine In'

  // Payable amount after round-off
  const payableCents = totalCents + roundOffCents

  return (
    <div aria-hidden="true" className="hidden print:block font-mono text-black bg-white p-2 w-full" style={fontVars}>
      {/* 1. Restaurant name + address */}
      <div className="text-center mb-1">
        {restaurantName && <p className="font-bold text-[length:var(--bill-base)]">{restaurantName}</p>}
        <p className="text-[length:var(--bill-sm)]">{isDue ? 'DUE BILL' : 'BILL RECEIPT'}</p>
        <p className="text-[length:var(--bill-xs)]">{restaurantAddress}</p>
      </div>

      {/* 2. BIN # */}
      {binNumber && (
        <div className="text-center mb-1">
          <p className="text-[length:var(--bill-xs)]">BIN: {binNumber}</p>
        </div>
      )}

      {/* Order number badge — prominently displayed above meta */}
      {orderNumber != null && (
        <div className="text-center border border-black py-1 mb-2">
          <p className="font-bold tracking-widest text-[length:var(--bill-lg)]">#{String(orderNumber).padStart(3, '0')}</p>
        </div>
      )}

      {/* 3. Bill meta */}
      <div className="border-t border-b border-black py-1 mb-2 space-y-0.5 text-[length:var(--bill-xs)]">
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
        {locationName && (
          <div className="flex justify-between">
            <span>Location</span>
            <span>{locationName}</span>
          </div>
        )}
        {registerName && (
          <div className="flex justify-between">
            <span>Register</span>
            <span>{registerName}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span>Order Type</span>
          <span>{orderTypeLabel}</span>
        </div>
        {!isNonDineIn && (
          <div className="flex justify-between">
            <span>Table</span>
            <span>{tableLabel}</span>
          </div>
        )}
        {staffUser && (
          <div className="flex justify-between">
            <span>Staff</span>
            <span>{staffUser}</span>
          </div>
        )}
      </div>

      {/* COMPLIMENTARY banner for whole-order comp */}
      {orderComp && (
        <div className="text-center border border-black py-1 mb-2 font-bold tracking-widest text-[length:var(--bill-sm)]">
          ★ COMPLIMENTARY ★
        </div>
      )}

      {/* DUE / UNPAID banner — pre-payment bill copy (issue #370) */}
      {isDue && (
        <div className="text-center border-2 border-black py-1 mb-2 font-bold tracking-widest text-[length:var(--bill-sm)]">
          *** AMOUNT DUE — UNPAID ***
        </div>
      )}

      {/* 4. Line items: S.No | Item name | Qty | Amount */}
      <div className="mb-2">
        {/* Header row */}
        <div className="flex font-semibold border-b border-black pb-0.5 mb-0.5 text-[length:var(--bill-xs)]">
          <span className="w-6 shrink-0">#</span>
          <span className="flex-1">Item</span>
          <span className="w-8 text-right shrink-0">Qty</span>
          <span className="w-16 text-right shrink-0">Amt</span>
        </div>
        {items.map((item, idx) => {
          const grossCents = item.quantity * item.price_cents
          const isComp = item.comp || orderComp
          const itemDiscountCents = isComp ? 0 : calcItemDiscountCents(item)
          const lineCents = grossCents - itemDiscountCents
          const hasItemDiscount = !isComp && itemDiscountCents > 0
          return (
            <div key={item.id} className="mb-0.5">
              <div className="flex text-[length:var(--bill-xs)]">
                <span className="w-6 shrink-0 text-zinc-600">{idx + 1}</span>
                <span className="flex-1 truncate">
                  {item.name}
                  {isComp && <span className="ml-1">[COMP]</span>}
                </span>
                <span className="w-8 text-right shrink-0">{item.quantity}</span>
                <span className="w-16 text-right shrink-0">
                  {isComp ? 'Free' : formatPrice(lineCents, DEFAULT_CURRENCY_SYMBOL, roundBillTotals)}
                </span>
              </div>
              {hasItemDiscount && (
                <div className="pl-6 text-zinc-500 text-[length:var(--bill-xs)]">
                  {item.item_discount_type === 'percent' && item.item_discount_value != null
                    ? `Discount: -${item.item_discount_value / 100}%`
                    : `Discount: -${formatPrice(itemDiscountCents, DEFAULT_CURRENCY_SYMBOL, roundBillTotals)}`}
                </div>
              )}
              {item.modifier_names.length > 0 && (
                <ul className="pl-6">
                  {item.modifier_names.map((mod) => (
                    <li key={mod} className="text-zinc-600 text-[length:var(--bill-xs)]">+ {mod}</li>
                  ))}
                </ul>
              )}
              {item.notes && (
                <p className="pl-6 text-zinc-500 italic text-[length:var(--bill-xs)]">↳ {item.notes}</p>
              )}
            </div>
          )
        })}
      </div>

      {/* 5. Sub total → Discount → Service Charge → VAT → Round off → Pay */}
      <div className="border-t border-black pt-1 mb-2 space-y-0.5 text-[length:var(--bill-sm)]">
        {!orderComp && (
          <>
            <div className="flex justify-between">
              <span>Sub Total</span>
              <span>{formatPrice(subtotalCents, DEFAULT_CURRENCY_SYMBOL, roundBillTotals)}</span>
            </div>
            {discountAmountCents > 0 && (
              <div className="flex justify-between">
                <span>{discountLabel ? `Discount (${discountLabel})` : 'Discount'}</span>
                <span>-{formatPrice(discountAmountCents, DEFAULT_CURRENCY_SYMBOL, roundBillTotals)}</span>
              </div>
            )}
            {serviceChargeCents > 0 && (
              <div className="flex justify-between">
                <span>Service Charge{serviceChargePercent > 0 ? ` (${serviceChargePercent}%)` : ''}</span>
                <span>{formatPrice(serviceChargeCents, DEFAULT_CURRENCY_SYMBOL, roundBillTotals)}</span>
              </div>
            )}
            {vatCents > 0 && (
              <div className="flex justify-between">
                <span>VAT{vatPercent > 0 ? ` ${vatPercent}%` : ''}{taxInclusive ? ' (incl.)' : ''}</span>
                <span>{formatPrice(vatCents, DEFAULT_CURRENCY_SYMBOL, roundBillTotals)}</span>
              </div>
            )}
            {deliveryChargeCents > 0 && (
              <div className="flex justify-between">
                <span>{deliveryZoneName ? `Delivery (${deliveryZoneName})` : 'Delivery Charge'}</span>
                <span>{formatPrice(deliveryChargeCents, DEFAULT_CURRENCY_SYMBOL, roundBillTotals)}</span>
              </div>
            )}
            {roundOffCents !== 0 && (
              <div className="flex justify-between">
                <span>Round Off</span>
                <span>{roundOffCents > 0 ? '+' : ''}{formatPrice(Math.abs(roundOffCents), DEFAULT_CURRENCY_SYMBOL, roundBillTotals)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold border-t border-black pt-0.5 mt-0.5">
              <span>{isDue ? 'Amount Due' : 'Pay'}</span>
              <span>{formatPrice(payableCents, DEFAULT_CURRENCY_SYMBOL, roundBillTotals)}</span>
            </div>
          </>
        )}
        {orderComp && (
          <div className="flex justify-between font-bold">
            <span>Total</span>
            <span>COMPLIMENTARY</span>
          </div>
        )}
      </div>

      {/* 6. Payment breakdown — hidden on pre-payment due bills (issue #391) */}
      {!orderComp && !isDue && (
        <div className="border-t border-black pt-1 mb-2 space-y-0.5 text-[length:var(--bill-sm)]">
          {splitPayments && splitPayments.length > 0 ? (
            // One line per payment method (single or split) — always shows amount (issue #391)
            <>
              {splitPayments.map((sp, idx) => (
                <div key={idx} className="flex justify-between">
                  <span>{PAYMENT_METHOD_LABELS[sp.method] ?? sp.method}</span>
                  <span>{formatPrice(sp.amountCents, DEFAULT_CURRENCY_SYMBOL, roundBillTotals)}</span>
                </div>
              ))}
              {/* Total Paid line — only shown for split (multi-method) payments */}
              {splitPayments.length > 1 && (
                <div className="flex justify-between font-semibold border-t border-dashed border-black pt-0.5">
                  <span>Total Paid</span>
                  <span>{formatPrice(splitPayments.reduce((s, sp) => s + sp.amountCents, 0), DEFAULT_CURRENCY_SYMBOL, roundBillTotals)}</span>
                </div>
              )}
              {/* Cash tendered — show when a single cash payment has overpayment info */}
              {splitPayments.length === 1 && splitPayments[0].method === 'cash' && amountTenderedCents !== undefined && amountTenderedCents !== splitPayments[0].amountCents && (
                <div className="flex justify-between">
                  <span>Cash Tendered</span>
                  <span>{formatPrice(amountTenderedCents, DEFAULT_CURRENCY_SYMBOL, roundBillTotals)}</span>
                </div>
              )}
              {/* Change due whenever cash is in the mix and change > 0 */}
              {splitPayments.some((sp) => sp.method === 'cash') && changeDueCents !== undefined && changeDueCents > 0 && (
                <div className="flex justify-between font-semibold">
                  <span>Change Due</span>
                  <span>{formatPrice(changeDueCents, DEFAULT_CURRENCY_SYMBOL, roundBillTotals)}</span>
                </div>
              )}
            </>
          ) : (
            // Legacy / fallback path (splitPayments prop not provided)
            <>
              <div className="flex justify-between">
                <span>Tendered by</span>
                <span>{PAYMENT_METHOD_LABELS[paymentMethod] ?? paymentMethod}</span>
              </div>
              {paymentMethod === 'cash' && amountTenderedCents !== undefined && (
                <div className="flex justify-between">
                  <span>Cash Tendered</span>
                  <span>{formatPrice(amountTenderedCents, DEFAULT_CURRENCY_SYMBOL, roundBillTotals)}</span>
                </div>
              )}
              {paymentMethod === 'cash' && changeDueCents !== undefined && changeDueCents > 0 && (
                <div className="flex justify-between">
                  <span>Change Due</span>
                  <span>{formatPrice(changeDueCents, DEFAULT_CURRENCY_SYMBOL, roundBillTotals)}</span>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* 7. Customer details (delivery/takeaway) */}
      {isNonDineIn && (customerName || customerMobile || deliveryNote) && (
        <div className="border-t border-black pt-1 mb-2 space-y-0.5 text-[length:var(--bill-xs)]">
          <p className="font-semibold text-[length:var(--bill-sm)]">{isDelivery ? 'Delivery' : 'Takeaway'} Details</p>
          {customerName && (
            <div className="flex justify-between">
              <span>Name</span>
              <span>{customerName}</span>
            </div>
          )}
          {customerMobile && (
            <div className="flex justify-between">
              <span>Mobile</span>
              <span>{customerMobile}</span>
            </div>
          )}
          {isDelivery && deliveryNote && (
            <div className="flex justify-between">
              <span>Address</span>
              <span className="text-right max-w-[150px] leading-tight">{deliveryNote}</span>
            </div>
          )}
        </div>
      )}

      {/* 8. Footer */}
      <div className="border-t border-black mt-2 pt-1 text-center text-[length:var(--bill-xs)]">
        Thank You!!!
      </div>
    </div>
  )
}
