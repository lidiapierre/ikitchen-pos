'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { JSX } from 'react'
import { callCreateOrder } from './createOrderApi'
import { useUser } from '@/lib/user-context'
import type { TableRow } from '../tablesData'
import { getTableStatus, STATUS_CONFIG } from '../tableStatus'

interface TableCardProps {
  table: TableRow
}

export default function TableCard({ table }: TableCardProps): JSX.Element {
  const router = useRouter()
  const { accessToken } = useUser()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const status = getTableStatus(table)
  const { label: statusLabel, cardClass, badgeClass } = STATUS_CONFIG[status]
  const isOccupied = table.open_order_id !== null

  async function handleTap(): Promise<void> {
    setError(null)

    if (isOccupied && table.open_order_id) {
      router.push(`/tables/${table.id}/order/${table.open_order_id}`)
      return
    }

    setLoading(true)
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      if (!supabaseUrl || !accessToken) {
        throw new Error('Not authenticated')
      }
      const result = await callCreateOrder(supabaseUrl, accessToken, table.id)
      router.push(`/tables/${table.id}/order/${result.order_id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create order')
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={() => { void handleTap() }}
      disabled={loading}
      className={[
        'flex flex-col items-center justify-center gap-3',
        'min-h-[160px] p-6 rounded-2xl border-2',
        'transition-colors select-none w-full',
        loading ? 'opacity-60 cursor-wait' : '',
        cardClass,
      ].join(' ')}
    >
      <span className="text-3xl font-bold text-white">
        {table.label}
      </span>
      <span
        className={[
          'text-base font-semibold px-3 py-1 rounded-full',
          badgeClass,
        ].join(' ')}
      >
        {loading ? 'Creating…' : statusLabel}
      </span>
      {error !== null && (
        <span className="text-xs text-red-400 text-center break-words max-w-full">{error}</span>
      )}
    </button>
  )
}
