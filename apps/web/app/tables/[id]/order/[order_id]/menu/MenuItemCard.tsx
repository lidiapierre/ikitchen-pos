'use client'

import { useState } from 'react'
import type { JSX } from 'react'
import type { MenuItem } from './menuData'
import { callAddItemToOrder } from './addItemApi'
import ModifierSelectionModal from './ModifierSelectionModal'
import { formatPrice, DEFAULT_CURRENCY_SYMBOL } from '@/lib/formatPrice'
import { useUser } from '@/lib/user-context'
import { Check } from 'lucide-react'

type CourseType = 'starter' | 'main' | 'dessert'

const COURSES: { value: CourseType; label: string }[] = [
  { value: 'starter', label: 'S' },
  { value: 'main', label: 'M' },
  { value: 'dessert', label: 'D' },
]

const COURSE_COLORS: Record<CourseType, string> = {
  starter: 'border-sky-400 bg-sky-400/10 text-sky-400',
  main: 'border-amber-400 bg-amber-400/10 text-amber-400',
  dessert: 'border-pink-400 bg-pink-400/10 text-pink-400',
}

interface MenuItemCardProps {
  item: MenuItem
  orderId: string
  onItemAdded: (priceCents: number) => void
  /** Called with the same priceCents if the add API call fails, so the caller can roll back its running total. */
  onItemFailed?: (priceCents: number) => void
  currencySymbol?: string
}

export default function MenuItemCard({ item, orderId, onItemAdded, onItemFailed, currencySymbol = DEFAULT_CURRENCY_SYMBOL }: MenuItemCardProps): JSX.Element {
  const { accessToken: _at } = useUser(); const accessToken = _at ?? ''
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Course selection — default to 'main'
  const [selectedCourse, setSelectedCourse] = useState<CourseType>('main')

  // Modifier modal state
  const [showModal, setShowModal] = useState(false)
  const [selectedModifierIds, setSelectedModifierIds] = useState<string[]>([])

  async function addItem(modifierIds: string[]): Promise<void> {
    setError(null)

    const modifierDeltaCents = item.modifiers
      .filter((mod) => modifierIds.includes(mod.id))
      .reduce((sum, mod) => sum + mod.price_delta_cents, 0)
    const priceDelta = item.price_cents + modifierDeltaCents

    // ── Optimistic update ─────────────────────────────────────────────
    // Show success state and update the session total immediately (<50ms).
    // Disable the button immediately to prevent rapid-tap double-adds.
    // If the API call fails we roll back both.
    setSuccess(true)
    onItemAdded(priceDelta)
    setLoading(true)
    // ─────────────────────────────────────────────────────────────────

    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      if (!supabaseUrl || !accessToken) {
        throw new Error('Not authenticated')
      }
      await callAddItemToOrder(
        supabaseUrl,
        accessToken,
        orderId,
        item.id,
        modifierIds.length > 0 ? modifierIds : undefined,
        selectedCourse,
      )
      // API confirmed — clear success badge after 1.5 s
      setTimeout(() => { setSuccess(false) }, 1500)
    } catch (err) {
      // ── Rollback ──────────────────────────────────────────────────
      setSuccess(false)
      setLoading(false)
      const msg = err instanceof Error ? err.message : 'Failed to add item'
      setError(msg)
      onItemFailed?.(priceDelta)
      // ─────────────────────────────────────────────────────────────
    } finally {
      setLoading(false)
    }
  }

  function handleTap(): void {
    if (!item.available) return
    if (item.modifiers.length > 0) {
      setSelectedModifierIds([])
      setShowModal(true)
    } else {
      void addItem([])
    }
  }

  function handleToggleModifier(id: string): void {
    setSelectedModifierIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  function handleConfirmModal(): void {
    setShowModal(false)
    void addItem(selectedModifierIds)
  }

  function handleCancelModal(): void {
    setShowModal(false)
    setSelectedModifierIds([])
  }

  const priceFormatted = formatPrice(item.price_cents, currencySymbol)

  const isUnavailable = !item.available

  const SPICY_LABELS: Record<string, string> = {
    mild: 'Mild',
    medium: 'Medium',
    hot: 'Hot',
  }

  const DIETARY_COLORS: Record<string, string> = {
    halal: 'bg-emerald-800 text-emerald-200',
    vegetarian: 'bg-green-800 text-green-200',
    vegan: 'bg-lime-800 text-lime-200',
  }

  const ALLERGEN_COLORS = 'bg-red-900 text-red-200'

  return (
    <>
      {showModal && (
        <ModifierSelectionModal
          itemName={item.name}
          modifiers={item.modifiers}
          modifierLoadError={null}
          selectedIds={selectedModifierIds}
          onToggle={handleToggleModifier}
          onConfirm={handleConfirmModal}
          onCancel={handleCancelModal}
          confirming={loading}
        />
      )}

      <div
        className={[
          'flex flex-col gap-3 bg-zinc-800 rounded-2xl p-4 border-2 border-zinc-600',
          isUnavailable ? 'opacity-40' : '',
        ].join(' ')}
      >
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-base font-semibold text-white">{item.name}</span>
            {isUnavailable && (
              <span className="text-xs font-medium bg-zinc-700 text-zinc-400 px-2 py-0.5 rounded-full">
                Unavailable
              </span>
            )}
          </div>
          <span className="text-lg font-bold text-amber-400">{priceFormatted}</span>
          {item.modifiers.length > 0 && (
            <span className="text-sm text-zinc-400">{item.modifiers.length} option{item.modifiers.length !== 1 ? 's' : ''}</span>
          )}
          {/* Dietary badges */}
          {item.dietary_badges && item.dietary_badges.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-0.5">
              {item.dietary_badges.map((badge) => (
                <span
                  key={badge}
                  className={`text-xs font-medium px-1.5 py-0.5 rounded-full capitalize ${DIETARY_COLORS[badge.toLowerCase()] ?? 'bg-zinc-700 text-zinc-300'}`}
                >
                  {badge.toLowerCase() === 'halal' ? (
                    <span className="flex items-center gap-1"><Check size={10} aria-hidden="true" />Halal</span>
                  ) : badge}
                </span>
              ))}
            </div>
          )}
          {/* Allergen tags */}
          {item.allergens && item.allergens.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-0.5">
              {item.allergens.map((allergen) => (
                <span
                  key={allergen}
                  className={`text-xs font-medium px-1.5 py-0.5 rounded-full capitalize ${ALLERGEN_COLORS}`}
                >
                  {allergen}
                </span>
              ))}
            </div>
          )}
          {/* Spicy level */}
          {item.spicy_level && item.spicy_level !== 'none' && SPICY_LABELS[item.spicy_level.toLowerCase()] && (
            <span className="text-xs text-orange-400 font-medium mt-0.5">
              {SPICY_LABELS[item.spicy_level.toLowerCase()]}
            </span>
          )}
        </div>

        {/* Course selector — compact segmented control */}
        {!isUnavailable && (
          <div className="flex gap-1" role="group" aria-label="Course">
            {COURSES.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => { setSelectedCourse(value) }}
                aria-pressed={selectedCourse === value}
                className={[
                  'flex-1 min-h-[36px] rounded-lg text-xs font-bold border-2 transition-colors',
                  selectedCourse === value
                    ? COURSE_COLORS[value]
                    : 'border-zinc-600 text-zinc-500 hover:border-zinc-400 hover:text-zinc-300',
                ].join(' ')}
                title={value.charAt(0).toUpperCase() + value.slice(1)}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={handleTap}
          disabled={loading || isUnavailable}
          aria-disabled={isUnavailable}
          className={[
            'min-h-[48px] min-w-[48px] rounded-xl text-base font-semibold',
            'transition-colors',
            isUnavailable
              ? 'bg-zinc-700 text-zinc-500 cursor-not-allowed'
              : success
                ? 'bg-green-600 text-white'
                : loading
                  ? 'bg-zinc-700 text-zinc-400 cursor-wait'
                  : 'bg-amber-600 hover:bg-amber-500 text-white',
          ].join(' ')}
        >
          {isUnavailable ? '86\'d' : loading ? 'Adding…' : success ? (
            <span className="flex items-center justify-center gap-1"><Check size={16} aria-hidden="true" />Added</span>
          ) : 'Add'}
        </button>
        {error !== null && (
          <span className="text-base text-red-400">{error}</span>
        )}
      </div>
    </>
  )
}
