'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import Link from 'next/link'
import TableCard from './components/TableCard'
import { fetchTables } from './tablesData'
import type { TableRow } from './tablesData'
import { STATUS_CONFIG } from './tableStatus'
import type { TableStatus } from './tableStatus'

/** Auto-refresh interval in milliseconds (30 seconds) */
const REFRESH_INTERVAL_MS = 30_000

const STATUS_LEGEND: { status: TableStatus; label: string; dotClass: string }[] = [
  { status: 'available', label: 'Empty', dotClass: 'bg-zinc-500' },
  { status: 'seated', label: 'Seated', dotClass: 'bg-blue-500' },
  { status: 'ordered', label: 'Ordered', dotClass: 'bg-amber-500' },
  { status: 'overdue', label: 'Overdue (>2h)', dotClass: 'bg-red-500' },
]

export default function TablesPage(): JSX.Element {
  const [tables, setTables] = useState<TableRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadTables = useCallback((): void => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

    if (!supabaseUrl || !supabaseKey) {
      setError('Supabase is not configured')
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    fetchTables(supabaseUrl, supabaseKey)
      .then(setTables)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load tables')
      })
      .finally(() => { setLoading(false) })
  }, [])

  // Initial load
  useEffect(() => {
    loadTables()
  }, [loadTables])

  // Auto-refresh every 30s
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
      if (!supabaseUrl || !supabaseKey) return

      fetchTables(supabaseUrl, supabaseKey)
        .then(setTables)
        .catch(() => { /* silent background refresh failure */ })
    }, REFRESH_INTERVAL_MS)

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current)
      }
    }
  }, [])

  return (
    <main className="min-h-screen bg-zinc-900 p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-white">Tables</h1>
        <div className="flex items-center gap-3">
          <Link
            href="/shifts"
            className="text-zinc-400 hover:text-white text-base font-medium px-4 py-2 rounded-lg border border-zinc-700 hover:border-zinc-500 transition-colors min-h-[48px] flex items-center"
          >
            Shifts
          </Link>
          <button
            type="button"
            onClick={loadTables}
            className="text-zinc-400 hover:text-white text-base font-medium px-4 py-2 rounded-lg border border-zinc-700 hover:border-zinc-500 transition-colors min-h-[48px]"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Status legend */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mb-6">
        {STATUS_LEGEND.map(({ status, label, dotClass }) => (
          <span key={status} className="flex items-center gap-1.5 text-sm text-zinc-400">
            <span className={`inline-block w-3 h-3 rounded-full ${dotClass}`} />
            {label}
          </span>
        ))}
        <span className="text-xs text-zinc-600 ml-auto">Auto-refreshes every 30s</span>
      </div>

      {loading ? (
        <p className="text-zinc-400 text-lg">Loading tables…</p>
      ) : error !== null ? (
        <p className="text-red-400 text-lg">{error}</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {tables.length === 0 ? (
            <p className="text-zinc-400 text-lg col-span-full">No tables configured.</p>
          ) : tables.map((table) => (
            <TableCard key={table.id} table={table} />
          ))}
        </div>
      )}
    </main>
  )
}
