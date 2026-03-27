import React from 'react'
import type { JSX } from 'react'
import type { OrderItem } from '@/app/tables/[id]/order/[order_id]/orderData'
import { calcItemDiscountCents } from '@/app/tables/[id]/order/[order_id]/orderData'
import { formatPrice, DEFAULT_CURRENCY_SYMBOL } from '@/lib/formatPrice'

export interface BillPrintViewProps {
  tableLabel: string
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
  restaurantName = 'Lahore by iKitchen',
  restaurantAddress = 'Lahore by iKitchen, Dhaka',
  binNumber,
  billNumber,
  locationName,
  registerName,
  staffUser,
  roundOffCents = 0,
}: BillPrintViewProps): JSX.Element {
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
    <div aria-hidden="true" className="hidden print:block font-mono text-black bg-white p-2 w-full max-w-xs">
      {/* 1. Restaurant name + address */}
      <div className="text-center mb-1">
        <p className="text-base font-bold">{restaurantName}</p>
        <p className="text-xs">{restaurantAddress}</p>
      </div>

      {/* 2. BIN # */}
      {binNumber && (
        <div className="text-center mb-1">
          <p className="text-xs">BIN: {binNumber}</p>
        </div>
      )}

      {/* 3. Bill meta */}
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
        <div className="flex justify-between">
          <span>Order#</span>
          <span>{orderId.slice(0, 8)}</span>
        </div>
      </div>

      {/* COMPLIMENTARY banner for whole-order comp */}
      {orderComp && (
        <div className="text-center border border-black py-1 mb-2 text-sm font-bold tracking-widest">
          ★ COMPLIMENTARY ★
        </div>
      )}

      {/* 4. Line items: S.No | Item name | Qty | Amount */}
      <div className="mb-2">
        {/* Header row */}
        <div className="flex text-xs font-semibold border-b border-black pb-0.5 mb-0.5">
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
              <div className="flex text-xs">
                <span className="w-6 shrink-0 text-zinc-600">{idx + 1}</span>
                <span className="flex-1 truncate">
                  {item.name}
                  {isComp && <span className="ml-1">[COMP]</span>}
                </span>
                <span className="w-8 text-right shrink-0">{item.quantity}</span>
                <span className="w-16 text-right shrink-0">
                  {isComp ? 'Free' : formatPrice(lineCents, DEFAULT_CURRENCY_SYMBOL)}
                </span>
              </div>
              {hasItemDiscount && (
                <div className="pl-6 text-xs text-zinc-500">
                  {item.item_discount_type === 'percent' && item.item_discount_value != null
                    ? `Discount: -${item.item_discount_value / 100}%`
                    : `Discount: -${formatPrice(itemDiscountCents, DEFAULT_CURRENCY_SYMBOL)}`}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* 5. Sub total → Discount → Service Charge → VAT → Round off → Pay */}
      <div className="border-t border-black pt-1 mb-2 text-sm space-y-0.5">
        {!orderComp && (
          <>
            <div className="flex justify-between">
              <span>Sub Total</span>
              <span>{formatPrice(subtotalCents, DEFAULT_CURRENCY_SYMBOL)}</span>
            </div>
            {discountAmountCents > 0 && (
              <div className="flex justify-between">
                <span>{discountLabel ? `Discount (${discountLabel})` : 'Discount'}</span>
                <span>-{formatPrice(discountAmountCents, DEFAULT_CURRENCY_SYMBOL)}</span>
              </div>
            )}
            {serviceChargePercent > 0 && serviceChargeCents > 0 && (
              <div className="flex justify-between">
                <span>Service Charge ({serviceChargePercent}%)</span>
                <span>{formatPrice(serviceChargeCents, DEFAULT_CURRENCY_SYMBOL)}</span>
              </div>
            )}
            {vatPercent > 0 && (
              <div className="flex justify-between">
                <span>VAT {vatPercent}%{taxInclusive ? ' (incl.)' : ''}</span>
                <span>{formatPrice(vatCents, DEFAULT_CURRENCY_SYMBOL)}</span>
              </div>
            )}
            {roundOffCents !== 0 && (
              <div className="flex justify-between">
                <span>Round Off</span>
                <span>{roundOffCents > 0 ? '+' : ''}{formatPrice(Math.abs(roundOffCents), DEFAULT_CURRENCY_SYMBOL)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold border-t border-black pt-0.5 mt-0.5">
              <span>Pay</span>
              <span>{formatPrice(payableCents, DEFAULT_CURRENCY_SYMBOL)}</span>
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

      {/* 6. Tendered by */}
      {!orderComp && (
        <div className="border-t border-black pt-1 mb-2 text-sm space-y-0.5">
          <div className="flex justify-between">
            <span>Tendered by</span>
            <span className="capitalize">{paymentMethod}</span>
          </div>
          {paymentMethod === 'cash' && amountTenderedCents !== undefined && (
            <div className="flex justify-between">
              <span>Cash Tendered</span>
              <span>{formatPrice(amountTenderedCents, DEFAULT_CURRENCY_SYMBOL)}</span>
            </div>
          )}
          {paymentMethod === 'cash' && changeDueCents !== undefined && (
            <div className="flex justify-between">
              <span>Change Due</span>
              <span>{formatPrice(changeDueCents, DEFAULT_CURRENCY_SYMBOL)}</span>
            </div>
          )}
        </div>
      )}

      {/* 7. Customer details (delivery/takeaway) */}
      {isNonDineIn && (customerName || customerMobile || deliveryNote) && (
        <div className="border-t border-black pt-1 mb-2 text-xs space-y-0.5">
          <p className="font-semibold text-sm">{isDelivery ? 'Delivery' : 'Takeaway'} Details</p>
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
      <div className="border-t border-black mt-2 pt-1 text-center text-xs">
        Thank You!!!
      </div>
    </div>
  )
}
