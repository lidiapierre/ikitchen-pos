'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { JSX } from 'react'

export type TableStatus = 'empty' | 'occupied'

export interface Table {
  id: number
  number: number
  status: TableStatus
  seats: number
  open_order_id?: string
}

interface TableCardProps {
  table: Table
}

interface CreateOrderResponse {
  success: boolean
  data?: { order_id: string; status: string }
  error?: string
}

export default function TableCard({ table }: TableCardProps): JSX.Element {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isOccupied = table.status === 'occupied'

  async function handleTap(): Promise<void> {
    setError(null)

    if (isOccupied && table.open_order_id) {
      router.push(`/tables/${table.id}/order/${table.open_order_id}`)
      return
    }

    setLoading(true)
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
      if (!supabaseUrl || !supabasePublishableKey) {
        throw new Error('API not configured')
      }
      const res = await fetch(`${supabaseUrl}/functions/v1/create_order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabasePublishableKey,
        },
        body: JSON.stringify({ table_id: table.id, staff_id: 'placeholder-staff' }),
      })
      const json = (await res.json()) as CreateOrderResponse
      if (!json.success || !json.data) {
        throw new Error(json.error ?? 'Failed to create order')
      }
      router.push(`/tables/${table.id}/order/${json.data.order_id}`)
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
        {loading ? 'Creating…' : isOccupied ? 'Occupied' : 'Empty'}
      </span>
      <span className="text-sm text-zinc-400">{table.seats} seats</span>
      {error !== null && (
        <span className="text-xs text-red-400 text-center break-words max-w-full">{error}</span>
      )}
    </button>
  )
}
