'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import type { JSX } from 'react'
import { fetchMenuCategories } from './menuData'
import type { MenuCategory } from './menuData'
import MenuItemCard from './MenuItemCard'
import { filterMenuItemsWithFilters, hasActiveFilters, EMPTY_FILTERS } from './menuSearch'
import type { MenuFilters } from './menuSearch'
import { formatPrice, DEFAULT_CURRENCY_SYMBOL } from '@/lib/formatPrice'

interface MenuPageClientProps {
  tableId: string
  orderId: string
}

export default function MenuPageClient({ tableId, orderId }: MenuPageClientProps): JSX.Element {
  const [orderTotalCents, setOrderTotalCents] = useState(0)
  const [categories, setCategories] = useState<MenuCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [filters, setFilters] = useState<MenuFilters>(EMPTY_FILTERS)
  const searchInputRef = useRef<HTMLInputElement>(null)

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

  useEffect(() => {
    if (!loading) {
      searchInputRef.current?.focus()
    }
  }, [loading])

  function handleItemAdded(priceCents: number): void {
    setOrderTotalCents((prev) => prev + priceCents)
  }

  function handleClearSearch(): void {
    setSearchQuery('')
    setFilters(EMPTY_FILTERS)
    searchInputRef.current?.focus()
  }

  function handleSetDietary(value: string): void {
    setFilters((f) => ({ ...f, dietary: f.dietary === value ? '' : value }))
  }

  function handleSetAllergenFree(value: string): void {
    setFilters((f) => ({ ...f, allergenFree: f.allergenFree === value ? '' : value }))
  }

  const totalFormatted = formatPrice(orderTotalCents, DEFAULT_CURRENCY_SYMBOL)

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

    const activeFilters: MenuFilters = { ...filters, query: searchQuery }
    if (hasActiveFilters(activeFilters)) {
      const results = filterMenuItemsWithFilters(categories, activeFilters)
      if (results.length === 0) {
        return (
          <p className="text-zinc-500 text-base">
            No items match your search or filters.
          </p>
        )
      }
      return (
        <div className="grid grid-cols-3 gap-4">
          {results.map(({ item }) => (
            <MenuItemCard
              key={item.id}
              item={item}
              orderId={orderId}
              onItemAdded={handleItemAdded}
            />
          ))}
        </div>
      )
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

      <div className="mb-6 flex flex-col gap-3">
        {/* Search bar */}
        <div className="relative">
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search items…"
            aria-label="Search menu items"
            className="w-full bg-zinc-800 text-white placeholder-zinc-500 rounded-xl px-4 py-3 pr-10 text-base border border-zinc-700 focus:outline-none focus:border-amber-500 transition-colors"
          />
          {(searchQuery !== '' || filters.dietary !== '' || filters.allergenFree !== '') && (
            <button
              type="button"
              onClick={handleClearSearch}
              aria-label="Clear search and filters"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white text-lg leading-none min-h-[48px] min-w-[48px] flex items-center justify-center transition-colors"
            >
              ×
            </button>
          )}
        </div>

        {/* Dietary filters */}
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs text-zinc-500 font-medium uppercase tracking-wide mr-1">Diet:</span>
          {(['halal', 'vegetarian', 'vegan'] as const).map((badge) => (
            <button
              key={badge}
              type="button"
              onClick={() => handleSetDietary(badge)}
              aria-pressed={filters.dietary === badge}
              className={[
                'text-xs font-medium px-3 py-1.5 rounded-full capitalize transition-colors min-h-[32px]',
                filters.dietary === badge
                  ? 'bg-emerald-600 text-white'
                  : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600',
              ].join(' ')}
            >
              {badge === 'halal' ? '✓ Halal' : badge.charAt(0).toUpperCase() + badge.slice(1)}
            </button>
          ))}

          <span className="text-xs text-zinc-500 font-medium uppercase tracking-wide mx-1">Allergen-free:</span>
          {(['nuts', 'dairy', 'gluten', 'eggs', 'shellfish', 'soy', 'sesame'] as const).map((allergen) => (
            <button
              key={allergen}
              type="button"
              onClick={() => handleSetAllergenFree(allergen)}
              aria-pressed={filters.allergenFree === allergen}
              className={[
                'text-xs font-medium px-3 py-1.5 rounded-full capitalize transition-colors min-h-[32px]',
                filters.allergenFree === allergen
                  ? 'bg-red-700 text-white'
                  : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600',
              ].join(' ')}
            >
              No {allergen}
            </button>
          ))}
        </div>
      </div>

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
