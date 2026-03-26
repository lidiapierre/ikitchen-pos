import React from 'react'
import type { JSX } from 'react'
import type { OrderItem } from '@/app/tables/[id]/order/[order_id]/orderData'

interface KotPrintViewProps {
  tableId: string
  orderId: string
  items: OrderItem[]
  timestamp: string
  /** When true, prints all items instead of only unsent items (used for reprint). */
  showAll?: boolean
}

export default function KotPrintView({ tableId, orderId, items, timestamp, showAll = false }: KotPrintViewProps): JSX.Element {
  const displayItems = showAll ? items : items.filter((item) => !item.sent_to_kitchen)

  return (
    <div aria-hidden="true" className="print-area hidden print:block font-mono text-black bg-white p-2 w-full max-w-xs">
      <div className="text-center mb-2">
        <p className="text-base font-bold">Lahore by iKitchen</p>
        <p className="text-sm">KITCHEN ORDER TICKET</p>
        {showAll && <p className="text-xs">(REPRINT)</p>}
      </div>
      <div className="border-t border-b border-black py-1 mb-2 text-sm">
        <p>Table: {tableId}</p>
        <p>Order: {orderId.slice(0, 8)}</p>
        <p>Time: {timestamp}</p>
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
          </li>
        ))}
      </ul>
      <div className="border-t border-black mt-2 pt-1 text-center text-xs">
        {displayItems.length} item{displayItems.length !== 1 ? 's' : ''} to prepare
      </div>
    </div>
  )
}
