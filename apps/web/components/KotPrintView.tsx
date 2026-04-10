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
  courseFilter?: 'drinks' | 'starter' | 'main' | 'dessert'
  /** Order type — shows TAKEAWAY or DELIVERY banner at the top of the KOT. */
  orderType?: 'dine_in' | 'takeaway' | 'delivery'
  /** Customer name for delivery orders. */
  customerName?: string | null
  /** Customer mobile number for delivery orders (issue #358). */
  customerMobile?: string | null
  /** Delivery address / note for delivery orders. */
  deliveryNote?: string | null
  /** Sequential human-readable order number (issue #349). Displayed prominently as e.g. #001. */
  orderNumber?: number | null
  /** Scheduled pickup/delivery time for takeaway/delivery orders (issue #352). ISO string or null. */
  scheduledTime?: string | null
  /**
   * When true, shows a prominent "★ NEW ADDITION — Running Table ★" header on the KOT.
   * Set when items are being added to an order that already has sent items (issue #374).
   */
  isNewAddition?: boolean
}

/** Ordered course sequence for grouped KOT display (issue #373) */
const COURSE_ORDER: ReadonlyArray<string> = ['drinks', 'starter', 'main', 'dessert']

const COURSE_LABELS: Record<string, string> = {
  drinks: 'DRINKS',
  starter: 'STARTER',
  main: 'MAIN',
  dessert: 'DESSERT',
}

/** Format an ISO datetime string for KOT display (e.g. "06 Apr 17:30"). Exported for unit testing. */
export function formatKotTime(iso: string | null | undefined): string {
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
  customerMobile,
  deliveryNote,
  orderNumber,
  scheduledTime,
  isNewAddition = false,
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

      {/* NEW ADDITION banner — shown when items are added to an already-running table (issue #374) */}
      {isNewAddition && (
        <div className="border-2 border-black py-1 mb-2 text-center">
          <p className="text-sm font-bold tracking-widest">★ NEW ADDITION ★</p>
          <p className="text-xs font-bold">Running Table</p>
        </div>
      )}

      {/* TAKEAWAY / DELIVERY banner */}
      {(isTakeaway || isDelivery) && (
        <div className="border-2 border-black py-1 mb-2 text-center">
          <p className="text-lg font-bold tracking-widest">
            {isDelivery ? '★ DELIVERY ★' : '★ TAKEAWAY ★'}
          </p>
          {isDelivery && customerName && (
            <p className="text-sm font-bold">{customerName}</p>
          )}
          {isDelivery && customerMobile && (
            <p className="text-xs">{customerMobile}</p>
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

      {/* Table number — most prominent element on the KOT (issue #396) */}
      {!isTakeaway && !isDelivery && (
        <div className="text-center border-2 border-black py-1 mb-2">
          <p className="text-xs font-bold tracking-widest uppercase">Table</p>
          <p className="text-3xl font-bold tracking-widest">{tableLabel}</p>
        </div>
      )}

      {/* KOT / order number — secondary, below the table number (issue #396) */}
      {orderNumber != null && (
        <div className="text-center border border-black py-1 mb-2">
          <p className="text-xs">KOT #{String(orderNumber).padStart(3, '0')}</p>
        </div>
      )}

      <div className="border-t border-b border-black py-1 mb-2 text-sm">
        <p>Time: {timestamp}</p>
        {courseFilter !== undefined && (
          <p className="font-bold text-base mt-1">
            ── {COURSE_LABELS[courseFilter] ?? courseFilter.toUpperCase()} ──
          </p>
        )}
      </div>

      {/* Items — grouped by course when no courseFilter is set (issue #373) */}
      {courseFilter !== undefined ? (
        // Single-course view (fired course or course filter)
        <ul className="space-y-2">
          {renderItemList(displayItems)}
        </ul>
      ) : (
        // Grouped view: Drinks → Starter → Main → Dessert → Other
        renderGroupedItems(displayItems)
      )}

      <div className="border-t border-black mt-2 pt-1 text-center text-xs">
        {displayItems.length} item{displayItems.length !== 1 ? 's' : ''} to prepare
      </div>
    </div>
  )
}

/** Render a flat list of KOT items */
function renderItemList(items: OrderItem[]): JSX.Element[] {
  return items.map((item) => (
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
  ))
}

/**
 * Render items grouped by course in the canonical order:
 * Drinks → Starter → Main → Dessert → Other (unassigned/unrecognised course)
 * Only groups with items are rendered.
 */
function renderGroupedItems(items: OrderItem[]): JSX.Element {
  // Build a map from course → items
  const grouped = new Map<string, OrderItem[]>()
  for (const item of items) {
    const course: string = item.course ?? 'other'
    const bucket = grouped.get(course) ?? []
    bucket.push(item)
    grouped.set(course, bucket)
  }

  // Build section list: known courses in order, then 'other' for anything else
  const sections: Array<{ key: string; label: string; items: OrderItem[] }> = []

  for (const course of COURSE_ORDER) {
    const courseItems = grouped.get(course)
    if (courseItems && courseItems.length > 0) {
      sections.push({ key: course, label: COURSE_LABELS[course] ?? course.toUpperCase(), items: courseItems })
      grouped.delete(course)
    }
  }

  // Remaining unrecognised courses → "Other"
  const otherItems: OrderItem[] = []
  for (const remaining of grouped.values()) {
    otherItems.push(...remaining)
  }
  if (otherItems.length > 0) {
    sections.push({ key: 'other', label: 'OTHER', items: otherItems })
  }

  const multipleGroups = sections.length > 1

  return (
    <div className="space-y-3">
      {sections.map(({ key, label, items: sectionItems }) => (
        <div key={key}>
          {multipleGroups && (
            <p className="font-bold text-sm border-b border-black pb-0.5 mb-1">── {label} ──</p>
          )}
          <ul className="space-y-2">
            {renderItemList(sectionItems)}
          </ul>
        </div>
      ))}
    </div>
  )
}
