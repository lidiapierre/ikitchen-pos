'use client'

import { useRouter } from 'next/navigation'
import type { JSX } from 'react'
import type { TableRow } from '../tablesData'
import { getTableStatus, STATUS_CONFIG } from '../tableStatus'

interface TableCardProps {
  table: TableRow
}

export default function TableCard({ table }: TableCardProps): JSX.Element {
  const router = useRouter()

  const status = getTableStatus(table)
  const { label: statusLabel, cardClass, badgeClass, labelClass } = STATUS_CONFIG[status]
  const isOccupied = table.open_order_id !== null

  function handleTap(): void {
    if (isOccupied && table.open_order_id) {
      router.push(`/tables/${table.id}/order/${table.open_order_id}`)
      return
    }

    // Optimistic navigation — order is created on the loading page (issue #298)
    router.push(`/tables/${table.id}/order/new`)
  }

  return (
    <button
      type="button"
      onClick={handleTap}
      className={[
        'flex flex-col items-center justify-center gap-3',
        'min-h-[160px] p-6 rounded-2xl border-2',
        'transition-colors select-none w-full',
        cardClass,
      ].join(' ')}
    >
      <span className={['text-3xl font-bold', labelClass].join(' ')}>
        {table.label}
      </span>
      <span
        className={[
          'text-base font-semibold px-3 py-1 rounded-full',
          badgeClass,
        ].join(' ')}
      >
        {statusLabel}
      </span>
    </button>
  )
}
