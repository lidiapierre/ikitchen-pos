'use client'

import { useCallback, useEffect, useState } from 'react'
import type { JSX } from 'react'
import Link from 'next/link'
import TableCard from './components/TableCard'
import { fetchTables } from './tablesData'
import type { TableRow } from './tablesData'

export default function TablesPage(): JSX.Element {
  const [tables, setTables] = useState<TableRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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

  useEffect(() => {
    loadTables()
  }, [loadTables])

  return (
    <main className="min-h-screen bg-zinc-900 p-6">
      <div className="flex items-center justify-between mb-8">
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
