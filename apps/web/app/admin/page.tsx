import type { JSX } from 'react'
import { createSupabaseServerClient } from '@/lib/supabase-server'

interface StatCard {
  label: string
  value: number | string
  description: string
}

async function fetchStats(): Promise<StatCard[]> {
  const supabase = await createSupabaseServerClient()

  // Resolve the restaurant ID from the logged-in user
  const { data: { user } } = await supabase.auth.getUser()
  const restaurantId = user
    ? (await supabase.from('users').select('restaurant_id').eq('id', user.id).single()).data?.restaurant_id as string | null
    : null

  if (!restaurantId) {
    return [
      { label: 'Total Tables', value: '—', description: 'Configured in the floor plan' },
      { label: 'Menu Items', value: '—', description: 'Active items across all categories' },
      { label: 'Open Orders', value: '—', description: 'Currently active orders' },
    ]
  }

  // menu_items belong to menus, not directly to a restaurant — join via menus
  const menuIdsRes = await supabase.from('menus').select('id').eq('restaurant_id', restaurantId)
  const menuIds = (menuIdsRes.data ?? []).map((m: { id: string }) => m.id)

  const [tablesRes, menuItemsRes, ordersRes] = await Promise.all([
    supabase.from('tables').select('*', { count: 'exact', head: true }).eq('restaurant_id', restaurantId),
    menuIds.length > 0
      ? supabase.from('menu_items').select('*', { count: 'exact', head: true }).in('menu_id', menuIds)
      : Promise.resolve({ count: 0, error: null }),
    supabase.from('orders').select('*', { count: 'exact', head: true }).eq('restaurant_id', restaurantId).eq('status', 'open'),
  ])

  return [
    {
      label: 'Total Tables',
      value: tablesRes.count ?? '—',
      description: 'Configured in the floor plan',
    },
    {
      label: 'Menu Items',
      value: menuItemsRes.count ?? '—',
      description: 'Active items across all categories',
    },
    {
      label: 'Open Orders',
      value: ordersRes.count ?? '—',
      description: 'Currently active orders',
    },
  ]
}

export default async function AdminDashboardPage(): Promise<JSX.Element> {
  const stats = await fetchStats()

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Dashboard</h1>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {stats.map(({ label, value, description }) => (
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
