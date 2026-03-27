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
  /** Customer name for delivery orders. */
  customerName?: string | null
  /** Delivery note for delivery orders. */
  deliveryNote?: string | null
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
}: BillPrintViewProps): JSX.Element {
  // Use caller-provided vatCents when available (preferred — supports new calculation order).
  // Fall back to derived value for backward compatibility.
  const vatCents = vatCentsProp !== undefined ? vatCentsProp : totalCents - subtotalCents

  const isTakeaway = orderType === 'takeaway'
  const isDelivery = orderType === 'delivery'

  return (
    <div aria-hidden="true" className="hidden print:block font-mono text-black bg-white p-2 w-full max-w-xs">
      {/* Header */}
      <div className="text-center mb-2">
        <p className="text-base font-bold">Lahore by iKitchen</p>
        <p className="text-xs">Lahore by iKitchen, Dhaka</p>
        <p className="text-xs">{timestamp}</p>
      </div>

      {/* TAKEAWAY / DELIVERY banner on bill */}
      {(isTakeaway || isDelivery) && (
        <div className="border border-black py-1 mb-2 text-center">
          <p className="text-sm font-bold tracking-widest">
            {isDelivery ? 'DELIVERY' : 'TAKEAWAY'}
          </p>
          {isDelivery && customerName && (
            <p className="text-xs font-bold">{customerName}</p>
          )}
          {isDelivery && deliveryNote && (
            <p className="text-xs">{deliveryNote}</p>
          )}
        </div>
      )}

      {/* Order info */}
      <div className="border-t border-b border-black py-1 mb-2 text-sm">
        {!isTakeaway && !isDelivery && <p>Table: {tableLabel}</p>}
        <p>Order: {orderId.slice(0, 8)}</p>
      </div>

      {/* COMPLIMENTARY banner for whole-order comp */}
      {orderComp && (
        <div className="text-center border border-black py-1 mb-2 text-sm font-bold tracking-widest">
          ★ COMPLIMENTARY ★
        </div>
      )}

      {/* Items */}
      <ul className="mb-2">
        {items.map((item) => {
          const grossCents = item.quantity * item.price_cents
          const isComp = item.comp || orderComp
          const itemDiscountCents = isComp ? 0 : calcItemDiscountCents(item)
          const lineCents = grossCents - itemDiscountCents
          const hasItemDiscount = !isComp && itemDiscountCents > 0
          return (
            <li key={item.id} className="text-sm mb-0.5">
              <div className="flex justify-between">
                <span>
                  {item.quantity}× {item.name}
                  {isComp && <span className="ml-1 text-xs">[COMP]</span>}
                </span>
                {isComp ? (
                  <span className="italic text-xs">Complimentary</span>
                ) : hasItemDiscount ? (
                  <span>
                    <span className="line-through text-xs mr-1">{formatPrice(grossCents, DEFAULT_CURRENCY_SYMBOL)}</span>
                    {formatPrice(lineCents, DEFAULT_CURRENCY_SYMBOL)}
                  </span>
                ) : (
                  <span>{formatPrice(lineCents, DEFAULT_CURRENCY_SYMBOL)}</span>
                )}
              </div>
              {hasItemDiscount && (
                <div className="pl-4 text-xs">
                  {item.item_discount_type === 'percent' && item.item_discount_value != null
                    ? `Item discount: -${item.item_discount_value / 100}%`
                    : `Item discount: -${formatPrice(itemDiscountCents, DEFAULT_CURRENCY_SYMBOL)}`}
                </div>
              )}
            </li>
          )
        })}
      </ul>

      {/* Subtotal, Discount, VAT, Total */}
      <div className="border-t border-black pt-1 mb-2 text-sm space-y-0.5">
        {!orderComp && (
          <>
            <div className="flex justify-between">
              <span>Subtotal</span>
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
            <div className="flex justify-between font-bold">
              <span>Total</span>
              <span>{formatPrice(totalCents, DEFAULT_CURRENCY_SYMBOL)}</span>
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

      {/* Payment info */}
      {!orderComp && (
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
      )}

      {/* Footer */}
      <div className="border-t border-black mt-2 pt-1 text-center text-xs">
        {isDelivery ? 'Thank you for your order!' : 'Thank you for dining with us!'}
      </div>
    </div>
  )
}
