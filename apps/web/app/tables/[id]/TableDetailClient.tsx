'use client'

import { useCallback, useEffect, useState } from 'react'
import type { JSX } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { fetchTableById } from './tableDetailData'
import { callCreateOrder } from '../components/createOrderApi'
import type { TableRow } from '../tablesData'

interface TableDetailClientProps {
  tableId: string
}

export default function TableDetailClient({ tableId }: TableDetailClientProps): JSX.Element {
  const router = useRouter()
  const [table, setTable] = useState<TableRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const loadTable = useCallback((): void => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

    if (!supabaseUrl || !supabaseKey) {
      setError('Supabase is not configured')
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    fetchTableById(supabaseUrl, supabaseKey, tableId)
      .then((data) => { setTable(data) })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load table')
      })
      .finally(() => { setLoading(false) })
  }, [tableId])

  useEffect(() => {
    loadTable()
  }, [loadTable])

  async function handleStartOrder(): Promise<void> {
    setActionError(null)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

    if (!supabaseUrl || !supabaseKey) {
      setActionError('API not configured')
      return
    }

    setActionLoading(true)
    try {
      const result = await callCreateOrder(supabaseUrl, supabaseKey, tableId)
      router.push(`/tables/${tableId}/order/${result.order_id}`)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to create order')
    } finally {
      setActionLoading(false)
    }
  }

  const isOccupied = table !== null && table.open_order_id !== null

  return (
    <main className="min-h-screen bg-zinc-900 p-6">
      <Link
        href="/tables"
        className="inline-flex items-center gap-2 text-zinc-400 hover:text-white text-base mb-8 min-h-[48px] min-w-[48px]"
      >
        ← Back to Tables
      </Link>

      {loading ? (
        <p className="text-zinc-400 text-lg">Loading…</p>
      ) : error !== null ? (
        <p className="text-red-400 text-lg">{error}</p>
      ) : table === null ? (
        <p className="text-zinc-400 text-lg">Table not found.</p>
      ) : (
        <div className="flex flex-col gap-8">
          <div className="flex items-center gap-4">
            <h1 className="text-3xl font-bold text-white">Table {table.label}</h1>
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
          </div>

          {isOccupied && table.open_order_id !== null ? (
            <Link
              href={`/tables/${tableId}/order/${table.open_order_id}`}
              className="inline-flex items-center justify-center text-xl font-semibold bg-amber-600 hover:bg-amber-500 text-white rounded-2xl px-8 min-h-[64px] min-w-[48px] transition-colors"
            >
              Go to Order
            </Link>
          ) : (
            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={() => { void handleStartOrder() }}
                disabled={actionLoading}
                className="inline-flex items-center justify-center text-xl font-semibold bg-emerald-700 hover:bg-emerald-600 text-white rounded-2xl px-8 min-h-[64px] min-w-[48px] transition-colors disabled:opacity-60 disabled:cursor-wait"
              >
                {actionLoading ? 'Creating…' : 'Start Order'}
              </button>
              {actionError !== null && (
                <p className="text-red-400 text-base">{actionError}</p>
              )}
            </div>
          )}
        </div>
      )}
    </main>
  )
}
