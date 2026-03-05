import React from 'react'

export type BadgeStatus = 'empty' | 'occupied' | 'pending_payment'

interface StatusBadgeProps {
  status: BadgeStatus
}

const statusConfig: Record<BadgeStatus, { label: string; className: string }> = {
  empty: {
    label: 'Empty',
    className: 'bg-gray-100 text-gray-600',
  },
  occupied: {
    label: 'Occupied',
    className: 'bg-green-100 text-green-700',
  },
  pending_payment: {
    label: 'Pending Payment',
    className: 'bg-amber-100 text-amber-700',
  },
}

export default function StatusBadge({ status }: StatusBadgeProps): React.JSX.Element {
  const { label, className } = statusConfig[status]
  return (
    <span
      className={[
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-sm font-medium',
        className,
      ].join(' ')}
    >
      {label}
    </span>
  )
}
