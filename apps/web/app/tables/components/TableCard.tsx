import type { JSX } from 'react'
import Link from 'next/link'

export type TableStatus = 'empty' | 'occupied'

export interface Table {
  id: number
  number: number
  status: TableStatus
  seats: number
}

interface TableCardProps {
  table: Table
}

export default function TableCard({ table }: TableCardProps): JSX.Element {
  const isOccupied = table.status === 'occupied'

  return (
    <Link
      href={`/tables/${table.id}`}
      className={[
        'flex flex-col items-center justify-center gap-3',
        'min-h-[160px] p-6 rounded-2xl border-2',
        'transition-colors select-none',
        isOccupied
          ? 'bg-amber-700 border-amber-500 hover:bg-amber-600'
          : 'bg-zinc-800 border-zinc-600 hover:border-zinc-400',
      ].join(' ')}
    >
      <span className="text-3xl font-bold text-white">
        {table.number}
      </span>
      <span
        className={[
          'text-base font-semibold px-3 py-1 rounded-full',
          isOccupied
            ? 'bg-amber-500 text-white'
            : 'bg-zinc-700 text-zinc-300',
        ].join(' ')}
      >
        {isOccupied ? 'Occupied' : 'Empty'}
      </span>
      <span className="text-sm text-zinc-400">{table.seats} seats</span>
    </Link>
  )
}
