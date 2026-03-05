import type { JSX } from 'react'
import MenuPageClient from './MenuPageClient'
import { fetchMenuCategories } from './menuData'
import type { MenuCategory } from './menuData'

interface PageProps {
  params: Promise<{ id: string; order_id: string }>
}

export default async function MenuPage({ params }: PageProps): Promise<JSX.Element> {
  const { id, order_id } = await params

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  // Prefer the service-role key (server-only, bypasses RLS) so that the
  // orders + menus fetch succeeds regardless of anon-read RLS policies.
  // Falls back to the publishable key so local dev without a service key
  // still works (provided the anon policies are in place).
  const fetchKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

  let initialCategories: MenuCategory[] | null = null
  if (supabaseUrl && fetchKey) {
    try {
      initialCategories = await fetchMenuCategories(supabaseUrl, fetchKey, order_id)
    } catch {
      // Server-side fetch failed; MenuPageClient will retry client-side.
    }
  }

  return (
    <MenuPageClient tableId={id} orderId={order_id} initialCategories={initialCategories} />
  )
}
