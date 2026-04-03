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
      <h1 className="text-2xl font-bold text-brand-navy mb-6 font-heading">Dashboard</h1>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {stats.map(({ label, value, description }) => (
          <div
            key={label}
            className="bg-white border border-brand-grey rounded-2xl overflow-hidden shadow-sm"
          >
            {/* Navy header */}
            <div className="bg-brand-navy px-6 py-3">
              <span className="text-sm font-medium text-white/80 uppercase tracking-wide font-body">
                {label}
              </span>
            </div>
            {/* Content */}
            <div className="px-6 py-5 flex flex-col gap-1">
              <span className="text-5xl font-bold text-brand-gold font-heading">{value}</span>
              <span className="text-base text-brand-blue/70 font-body">{description}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
