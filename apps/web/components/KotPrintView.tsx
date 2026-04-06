import React from 'react'
import type { JSX } from 'react'
import type { OrderItem } from '@/app/tables/[id]/order/[order_id]/orderData'

interface KotPrintViewProps {
  tableLabel: string
  orderId: string
  items: OrderItem[]
  timestamp: string
  /** When true, prints all items instead of only unsent items (used for reprint). */
  showAll?: boolean
  /**
   * When set, only items matching this course are printed and a course header is shown.
   * Used when firing a specific course (e.g. "STARTER").
   */
  courseFilter?: 'starter' | 'main' | 'dessert'
  /** Order type — shows TAKEAWAY or DELIVERY banner at the top of the KOT. */
  orderType?: 'dine_in' | 'takeaway' | 'delivery'
  /** Customer name for delivery orders. */
  customerName?: string | null
  /** Delivery note for delivery orders. */
  deliveryNote?: string | null
  /** Sequential human-readable order number (issue #349). Displayed prominently as e.g. #001. */
  orderNumber?: number | null
  /** Scheduled pickup/delivery time for takeaway/delivery orders (issue #352). ISO string or null. */
  scheduledTime?: string | null
}

const COURSE_LABELS: Record<string, string> = {
  starter: 'STARTER',
  main: 'MAIN',
  dessert: 'DESSERT',
}

/** Format an ISO datetime string for KOT display (e.g. "06 Apr 17:30"). */
function formatKotTime(iso: string | null | undefined): string {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return iso
    const dd = String(d.getDate()).padStart(2, '0')
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const mon = months[d.getMonth()]
    const hh = String(d.getHours()).padStart(2, '0')
    const min = String(d.getMinutes()).padStart(2, '0')
    return `${dd} ${mon} ${hh}:${min}`
  } catch {
    return iso
  }
}

export default function KotPrintView({
  tableLabel,
  orderId,
  items,
  timestamp,
  showAll = false,
  courseFilter,
  orderType = 'dine_in',
  customerName,
  deliveryNote,
  orderNumber,
  scheduledTime,
}: KotPrintViewProps): JSX.Element {
  // Base filter: unsent items (or all for reprint)
  let displayItems = showAll ? items : items.filter((item) => !item.sent_to_kitchen)

  // Apply course filter when firing a specific course
  if (courseFilter !== undefined) {
    displayItems = displayItems.filter((item) => item.course === courseFilter)
  }

  const isTakeaway = orderType === 'takeaway'
  const isDelivery = orderType === 'delivery'

  return (
    <div aria-hidden="true" className="hidden print:block font-mono text-black bg-white p-2 w-full max-w-xs">
      <div className="text-center mb-2">
        <p className="text-base font-bold">Lahore by iKitchen</p>
        <p className="text-sm">KITCHEN ORDER TICKET</p>
        {showAll && !courseFilter && <p className="text-xs">(REPRINT)</p>}
      </div>

      {/* TAKEAWAY / DELIVERY banner */}
      {(isTakeaway || isDelivery) && (
        <div className="border-2 border-black py-1 mb-2 text-center">
          <p className="text-lg font-bold tracking-widest">
            {isDelivery ? '★ DELIVERY ★' : '★ TAKEAWAY ★'}
          </p>
          {isDelivery && customerName && (
            <p className="text-sm font-bold">{customerName}</p>
          )}
          {isDelivery && deliveryNote && (
            <p className="text-xs">{deliveryNote}</p>
          )}
          {scheduledTime && (
            <p className="text-sm font-bold mt-1">
              {isDelivery ? 'DELIVER BY' : 'PICKUP AT'}: {formatKotTime(scheduledTime)}
            </p>
          )}
        </div>
      )}

      {orderNumber != null && (
        <div className="text-center border border-black py-1 mb-2">
          <p className="text-2xl font-bold tracking-widest">#{String(orderNumber).padStart(3, '0')}</p>
        </div>
      )}

      <div className="border-t border-b border-black py-1 mb-2 text-sm">
        {!isTakeaway && !isDelivery && <p>Table: {tableLabel}</p>}
        <p>Time: {timestamp}</p>
        {courseFilter !== undefined && (
          <p className="font-bold text-base mt-1">
            ── {COURSE_LABELS[courseFilter] ?? courseFilter.toUpperCase()} ──
          </p>
        )}
      </div>
      <ul className="space-y-2">
        {displayItems.map((item) => (
          <li key={item.id}>
            <p className="font-bold text-base">
              {item.quantity}x {item.name}
            </p>
            {item.modifier_names.length > 0 && (
              <ul className="pl-3">
                {item.modifier_names.map((mod) => (
                  <li key={mod} className="text-sm">
                    + {mod}
                  </li>
                ))}
              </ul>
            )}
            {item.item_discount_type != null && (
              <p className="pl-3 text-xs">
                {item.item_discount_type === 'percent' && item.item_discount_value != null
                  ? `[disc: -${item.item_discount_value / 100}%]`
                  : '[disc: flat]'}
              </p>
            )}
            {item.notes && (
              <p className="pl-3 text-sm italic">↳ {item.notes}</p>
            )}
          </li>
        ))}
      </ul>
      <div className="border-t border-black mt-2 pt-1 text-center text-xs">
        {displayItems.length} item{displayItems.length !== 1 ? 's' : ''} to prepare
      </div>
    </div>
  )
}
