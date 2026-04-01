'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { JSX } from 'react'
import { fetchMenuCategoriesCached } from '@/lib/menuCache'
import type { MenuCategory } from './menuData'
import MenuItemCard from './MenuItemCard'
import { filterMenuItemsWithFilters, hasActiveFilters, EMPTY_FILTERS } from './menuSearch'
import type { MenuFilters } from './menuSearch'
import { formatPrice, DEFAULT_CURRENCY_SYMBOL } from '@/lib/formatPrice'
import { X, Check } from 'lucide-react'
import { useToast } from '@/hooks/useToast'
import { ToastContainer } from '@/components/ui/Toast'
import VoiceOrderButton from './VoiceOrderButton'
import { callAddItemToOrder } from './addItemApi'
import { useUser } from '@/lib/user-context'

interface MenuPageClientProps {
  tableId: string
  orderId: string
}

export default function MenuPageClient({ tableId, orderId }: MenuPageClientProps): JSX.Element {
  const router = useRouter()
  const { accessToken: _at } = useUser(); const accessToken = _at ?? ''
  const [orderTotalCents, setOrderTotalCents] = useState(0)
  const [categories, setCategories] = useState<MenuCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [filters, setFilters] = useState<MenuFilters>(EMPTY_FILTERS)
  const [addingVoiceItems, setAddingVoiceItems] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const { toasts, addToast, dismissToast } = useToast()

  useEffect(() => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!supabaseUrl) {
      setFetchError('API not configured')
      setLoading(false)
      return
    }
    // Wait for auth to resolve — accessToken starts as empty string
    if (!accessToken) return

    setFetchError(null)
    setLoading(true)
    fetchMenuCategoriesCached(supabaseUrl, accessToken, orderId)
      .then((data) => {
        setCategories(data)
      })
      .catch((err: unknown) => {
        setFetchError(err instanceof Error ? err.message : 'Failed to load menu')
      })
      .finally(() => {
        setLoading(false)
      })
  }, [orderId, accessToken])

  useEffect(() => {
    if (!loading) {
      searchInputRef.current?.focus()
    }
  }, [loading])

  function handleItemAdded(priceCents: number): void {
    setOrderTotalCents((prev) => prev + priceCents)
  }

  /** Called when add-item API fails so we can roll back the optimistic total increment. */
  function handleItemFailed(priceCents: number): void {
    setOrderTotalCents((prev) => Math.max(0, prev - priceCents))
    addToast('Failed to add item — please retry', 'error')
  }

  function handleClearSearch(): void {
    setSearchQuery('')
    setFilters(EMPTY_FILTERS)
    searchInputRef.current?.focus()
  }

  const handleVoiceItemsConfirmed = useCallback(
    async (items: Array<{ menu_item_id: string; name: string; quantity: number }>) => {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      if (!supabaseUrl || !accessToken) return
      setAddingVoiceItems(true)
      try {
        await Promise.all(
          items.flatMap((item) =>
            Array.from({ length: item.quantity }, () =>
              callAddItemToOrder(supabaseUrl, accessToken, orderId, item.menu_item_id),
            ),
          ),
        )
      } catch (err) {
        addToast(err instanceof Error ? err.message : 'Failed to add voice items', 'error')
      } finally {
        setAddingVoiceItems(false)
        router.push(`/tables/${tableId}/order/${orderId}`)
      }
    },
    [accessToken, orderId, tableId, router, addToast],
  )

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
              onItemFailed={handleItemFailed}
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
                  onItemFailed={handleItemFailed}
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
              <X size={16} aria-hidden="true" />
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
              {badge === 'halal' ? (
                <span className="flex items-center gap-1"><Check size={10} aria-hidden="true" />Halal</span>
              ) : badge.charAt(0).toUpperCase() + badge.slice(1)}
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
        <div className="flex items-center gap-3">
          <VoiceOrderButton orderId={orderId} onItemsConfirmed={handleVoiceItemsConfirmed} />
          {addingVoiceItems ? (
            <span className="inline-flex items-center justify-center min-h-[48px] min-w-[48px] px-8 rounded-xl bg-zinc-700 text-zinc-400 text-base font-semibold cursor-not-allowed">
              Adding…
            </span>
          ) : (
            <Link
              href={`/tables/${tableId}/order/${orderId}`}
              className="inline-flex items-center justify-center min-h-[48px] min-w-[48px] px-8 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-base font-semibold transition-colors"
            >
              View Order
            </Link>
          )}
        </div>
      </footer>

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </main>
  )
}
