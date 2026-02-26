import type { JSX } from 'react'
import TableCard, { type Table } from './components/TableCard'

const TABLES: Table[] = [
  { id: 1, number: 1, status: 'occupied', seats: 4, open_order_id: '00000000-0000-0000-0000-000000000001' },
  { id: 2, number: 2, status: 'empty', seats: 2 },
  { id: 3, number: 3, status: 'occupied', seats: 6, open_order_id: '00000000-0000-0000-0000-000000000003' },
  { id: 4, number: 4, status: 'empty', seats: 4 },
  { id: 5, number: 5, status: 'empty', seats: 2 },
  { id: 6, number: 6, status: 'occupied', seats: 8, open_order_id: '00000000-0000-0000-0000-000000000006' },
  { id: 7, number: 7, status: 'empty', seats: 4 },
  { id: 8, number: 8, status: 'occupied', seats: 6, open_order_id: '00000000-0000-0000-0000-000000000008' },
]

export default function TablesPage(): JSX.Element {
  return (
    <main className="min-h-screen bg-zinc-900 p-6">
      <h1 className="text-2xl font-bold text-white mb-8">Tables</h1>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {TABLES.map((table) => (
          <TableCard key={table.id} table={table} />
        ))}
      </div>
    </main>
  )
}
