'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import type { JSX } from 'react'
import { Search } from 'lucide-react'
import { useUser } from '@/lib/user-context'
import { useActiveRestaurant } from '@/lib/useActiveRestaurant'
import { invalidateMenuCache } from '@/lib/menuCache'
import { fetchMenuAvailability, type AvailabilityCategory } from './availabilityApi'
import { callToggleItemAvailability } from '../menu/menuAdminApi'

type FeedbackType = 'success' | 'error'
interface Feedback {
  type: FeedbackType
  message: string
}

export default function AvailabilityPanel(): JSX.Element {
  const { accessToken } = useUser()
  const { restaurantId } = useActiveRestaurant()
  const [categories, setCategories] = useState<AvailabilityCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const apiKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ''

  function showFeedback(type: FeedbackType, message: string): void {
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current)
    setFeedback({ type, message })
    feedbackTimerRef.current = setTimeout(() => setFeedback(null), 4000)
  }

  useEffect(() => {
    if (!supabaseUrl || !apiKey) {
      setFetchError('API not configured')
      setLoading(false)
      return
    }
    if (!restaurantId) return
    fetchMenuAvailability(supabaseUrl, apiKey, restaurantId)
      .then((cats) => setCategories(cats))
      .catch((err: unknown) => {
        setFetchError(err instanceof Error ? err.message : 'Failed to load availability data')
      })
      .finally(() => setLoading(false))

    return () => {
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current)
    }
  }, [supabaseUrl, apiKey, restaurantId])

  async function handleToggle(categoryId: string, itemId: string, newAvailable: boolean): Promise<void> {
    if (!accessToken) {
      showFeedback('error', 'Not authenticated')
      return
    }
    if (togglingIds.has(itemId)) return

    // Optimistic update
    setTogglingIds((prev) => new Set(prev).add(itemId))
    setCategories((prev) =>
      prev.map((cat) =>
        cat.id === categoryId
          ? {
              ...cat,
              items: cat.items.map((item) =>
                item.id === itemId ? { ...item, available: newAvailable } : item,
              ),
            }
          : cat,
      ),
    )

    try {
      await callToggleItemAvailability(supabaseUrl, accessToken, itemId, newAvailable)
      invalidateMenuCache(restaurantId ?? undefined)
      showFeedback(
        'success',
        newAvailable ? 'Item marked as available.' : 'Item 86\'d.',
      )
    } catch (err) {
      // Revert on failure
      setCategories((prev) =>
        prev.map((cat) =>
          cat.id === categoryId
            ? {
                ...cat,
                items: cat.items.map((item) =>
                  item.id === itemId ? { ...item, available: !newAvailable } : item,
                ),
              }
            : cat,
        ),
      )
      showFeedback('error', err instanceof Error ? err.message : 'Failed to update availability')
    } finally {
      setTogglingIds((prev) => {
        const next = new Set(prev)
        next.delete(itemId)
        return next
      })
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <p className="text-zinc-400">Loading…</p>
      </div>
    )
  }

  if (fetchError) {
    return (
      <div className="flex flex-col gap-6">
        <p className="text-red-400">{fetchError}</p>
      </div>
    )
  }

  const totalItems = categories.reduce((sum, cat) => sum + cat.items.length, 0)
  const eightySixCount = categories.reduce(
    (sum, cat) => sum + cat.items.filter((i) => !i.available).length,
    0,
  )

  // Filter categories/items by search query
  const filteredCategories = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return categories
    return categories
      .map((cat) => ({
        ...cat,
        items: cat.items.filter((item) => item.name.toLowerCase().includes(q)),
      }))
      .filter((cat) => cat.items.length > 0)
  }, [categories, searchQuery])

  return (
    <div className="flex flex-col gap-6">
      {/* Search bar */}
      <div className="relative">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" aria-hidden="true" />
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search items to 86…"
          className="w-full min-h-[48px] pl-10 pr-4 py-2 rounded-xl bg-zinc-800 text-white border border-zinc-600 focus:border-indigo-500 focus:outline-none placeholder-zinc-500"
        />
      </div>

      {/* Header summary */}
      <div className="flex items-center gap-3 flex-wrap">
        <p className="text-sm text-zinc-400">
          {totalItems} items across {categories.length} categories
        </p>
        {eightySixCount > 0 && (
          <span className="text-xs font-bold bg-red-700 text-red-100 px-2 py-1 rounded-full">
            {eightySixCount} 86&apos;d
          </span>
        )}
      </div>

      {/* Feedback */}
      {feedback && (
        <div
          role="status"
          className={[
            'px-5 py-3 rounded-xl text-base font-medium',
            feedback.type === 'success' ? 'bg-green-800 text-green-100' : 'bg-red-800 text-red-100',
          ].join(' ')}
        >
          {feedback.message}
        </div>
      )}

      {/* Categories */}
      {filteredCategories.length === 0 && (
        <p className="text-zinc-500">
          {searchQuery.trim() ? `No items match "${searchQuery.trim()}".` : 'No menu categories found.'}
        </p>
      )}

      {filteredCategories.map((category) => (
        <div key={category.id} className="flex flex-col gap-3">
          {/* Category header */}
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-white">{category.name}</h2>
            <div className="flex-1 h-px bg-zinc-700" />
            {category.items.filter((i) => !i.available).length > 0 && (
              <span className="text-xs font-bold bg-red-700 text-red-100 px-2 py-0.5 rounded-full">
                {category.items.filter((i) => !i.available).length} 86&apos;d
              </span>
            )}
          </div>

          {category.items.length === 0 && (
            <p className="text-zinc-500 text-sm">No items in this category.</p>
          )}

          {/* Item rows */}
          {category.items.map((item) => {
            const isToggling = togglingIds.has(item.id)

            return (
              <div
                key={item.id}
                className={[
                  'bg-zinc-800 border border-zinc-700 rounded-2xl px-5 py-4',
                  'flex items-center gap-4',
                  !item.available ? 'border-red-900' : '',
                ].join(' ')}
              >
                {/* Item name + badge */}
                <div className={['flex-1 min-w-0 flex items-center gap-2', !item.available ? 'opacity-60' : ''].join(' ')}>
                  <span className="text-base font-medium text-white truncate">{item.name}</span>
                  {!item.available && (
                    <span className="shrink-0 bg-red-700 text-red-100 text-xs font-bold px-2 py-0.5 rounded-full">
                      86&apos;d
                    </span>
                  )}
                </div>

                {/* Toggle switch */}
                <button
                  type="button"
                  role="switch"
                  aria-checked={item.available}
                  aria-label={`Toggle availability for ${item.name}`}
                  onClick={() => { void handleToggle(category.id, item.id, !item.available) }}
                  disabled={isToggling}
                  className={[
                    'relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent',
                    'transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-zinc-800',
                    'disabled:opacity-50',
                    // min 48px touch target via padding
                    'min-w-[48px] min-h-[48px] items-center justify-center',
                    item.available ? 'bg-green-600' : 'bg-zinc-600',
                  ].join(' ')}
                >
                  <span
                    aria-hidden="true"
                    className={[
                      'pointer-events-none inline-block h-6 w-6 rounded-full bg-white shadow transform ring-0',
                      'transition duration-200 ease-in-out',
                      item.available ? 'translate-x-5' : 'translate-x-0',
                    ].join(' ')}
                  />
                </button>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
