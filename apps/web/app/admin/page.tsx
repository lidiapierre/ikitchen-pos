import type { JSX } from 'react'

interface StatCard {
  label: string
  value: number
  description: string
}

const MOCK_STATS: StatCard[] = [
  { label: 'Total Tables', value: 8, description: 'Configured in the floor plan' },
  { label: 'Menu Items', value: 24, description: 'Active items across all categories' },
  { label: 'Open Orders', value: 3, description: 'Currently active orders' },
]

export default function AdminDashboardPage(): JSX.Element {
  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Dashboard</h1>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {MOCK_STATS.map(({ label, value, description }) => (
          <div
            key={label}
            className="bg-zinc-800 border border-zinc-700 rounded-2xl p-6 flex flex-col gap-2"
          >
            <span className="text-sm font-medium text-zinc-400 uppercase tracking-wide">
              {label}
            </span>
            <span className="text-5xl font-bold text-white">{value}</span>
            <span className="text-base text-zinc-400">{description}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
