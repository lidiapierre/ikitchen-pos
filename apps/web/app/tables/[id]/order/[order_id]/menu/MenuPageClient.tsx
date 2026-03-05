'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import type { JSX } from 'react'
import { fetchMenuCategories } from './menuData'
import type { MenuCategory } from './menuData'
import MenuItemCard from './MenuItemCard'

interface MenuPageClientProps {
  tableId: string
  orderId: string
}

export default function MenuPageClient({ tableId, orderId }: MenuPageClientProps): JSX.Element {
  const [orderTotalCents, setOrderTotalCents] = useState(0)
  const [categories, setCategories] = useState<MenuCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  useEffect(() => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    if (!supabaseUrl || !supabaseKey) {
      setFetchError('API not configured')
      setLoading(false)
      return
    }

    fetchMenuCategories(supabaseUrl, supabaseKey, orderId)
      .then((data) => {
        setCategories(data)
      })
      .catch((err: unknown) => {
        setFetchError(err instanceof Error ? err.message : 'Failed to load menu')
      })
      .finally(() => {
        setLoading(false)
      })
  }, [orderId])

  function handleItemAdded(priceCents: number): void {
    setOrderTotalCents((prev) => prev + priceCents)
  }

  const totalFormatted = `$${(orderTotalCents / 100).toFixed(2)}`

  function renderMenu(): JSX.Element {
    if (loading) {
      return <p className="text-zinc-400 text-base">Loading menu…</p>
    }
    if (fetchError !== null) {
      return <p className="text-red-400 text-base">Unable to load menu. Please try again.</p>
    }
    if (categories.length === 0) {
      return <p className="text-zinc-500 text-base">No menu items available</p>
    }
    return (
      <div className="space-y-8">
        {categories.map((category) => (
          <section key={category.name}>
            <h2 className="text-lg font-semibold text-zinc-300 mb-4">{category.name}</h2>
            <div className="grid grid-cols-3 gap-4">
              {category.items.map((item) => (
                <MenuItemCard
                  key={item.id}
                  item={item}
                  orderId={orderId}
                  onItemAdded={handleItemAdded}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-zinc-900 p-6 flex flex-col">
      <header className="mb-6">
        <Link
          href={`/tables/${tableId}/order/${orderId}`}
          className="inline-flex items-center gap-2 text-zinc-400 hover:text-white text-base mb-4 min-h-[48px] min-w-[48px]"
        >
          ← Back to order
        </Link>
        <h1 className="text-2xl font-bold text-white">Menu</h1>
      </header>

      <div className="flex-1 overflow-y-auto">
        {renderMenu()}
      </div>

      <footer className="mt-6 pt-4 border-t border-zinc-700 flex items-center justify-between gap-4">
        <div className="flex flex-col">
          <span className="text-base text-zinc-400">Added this session</span>
          <span className="text-2xl font-bold text-white">{totalFormatted}</span>
        </div>
        <Link
          href={`/tables/${tableId}/order/${orderId}`}
          className="inline-flex items-center justify-center min-h-[48px] min-w-[48px] px-8 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-base font-semibold transition-colors"
        >
          View Order
        </Link>
      </footer>
    </main>
  )
}
