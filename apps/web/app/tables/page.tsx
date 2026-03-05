'use client'

import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import TableCard from './components/TableCard'
import { fetchTables } from './tablesData'
import type { TableRow } from './tablesData'

export default function TablesPage(): JSX.Element {
  const [tables, setTables] = useState<TableRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

    if (!supabaseUrl || !supabaseKey) {
      setError('Supabase is not configured')
      setLoading(false)
      return
    }

    fetchTables(supabaseUrl, supabaseKey)
      .then(setTables)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load tables')
      })
      .finally(() => { setLoading(false) })
  }, [])

  if (loading) {
    return (
      <main className="min-h-screen bg-zinc-900 p-6 flex items-center justify-center">
        <p className="text-zinc-400 text-lg">Loading tables…</p>
      </main>
    )
  }

  if (error !== null) {
    return (
      <main className="min-h-screen bg-zinc-900 p-6 flex items-center justify-center">
        <p className="text-red-400 text-lg">{error}</p>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-zinc-900 p-6">
      <h1 className="text-2xl font-bold text-white mb-8">Tables</h1>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {tables.length === 0 ? (
          <p className="text-zinc-400 text-lg col-span-full">No tables configured.</p>
        ) : tables.map((table) => (
          <TableCard key={table.id} table={table} />
        ))}
      </div>
    </main>
  )
}
