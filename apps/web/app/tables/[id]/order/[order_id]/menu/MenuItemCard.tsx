'use client'

import { useState } from 'react'
import type { JSX } from 'react'
import type { MenuItem } from './menuData'
import { callAddItemToOrder } from './addItemApi'
import ModifierSelectionModal from './ModifierSelectionModal'
import { formatPrice, DEFAULT_CURRENCY_SYMBOL } from '@/lib/formatPrice'
import { useUser } from '@/lib/user-context'

interface MenuItemCardProps {
  item: MenuItem
  orderId: string
  onItemAdded: (priceCents: number) => void
  currencySymbol?: string
}

export default function MenuItemCard({ item, orderId, onItemAdded, currencySymbol = DEFAULT_CURRENCY_SYMBOL }: MenuItemCardProps): JSX.Element {
  const { accessToken } = useUser()
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Modifier modal state
  const [showModal, setShowModal] = useState(false)
  const [selectedModifierIds, setSelectedModifierIds] = useState<string[]>([])

  async function addItem(modifierIds: string[]): Promise<void> {
    setError(null)
    setSuccess(false)
    setLoading(true)
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      if (!supabaseUrl || !accessToken) {
        throw new Error('Not authenticated')
      }
      await callAddItemToOrder(supabaseUrl, accessToken, orderId, item.id, modifierIds.length > 0 ? modifierIds : undefined)
      setSuccess(true)
      const modifierDeltaCents = item.modifiers
        .filter((mod) => modifierIds.includes(mod.id))
        .reduce((sum, mod) => sum + mod.price_delta_cents, 0)
      onItemAdded(item.price_cents + modifierDeltaCents)
      setTimeout(() => setSuccess(false), 1500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add item')
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
    mild: '🌶 Mild',
    medium: '🌶🌶 Medium',
    hot: '🌶🌶🌶 Hot',
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
                  {badge.toLowerCase() === 'halal' ? '✓ Halal' : badge}
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
          {isUnavailable ? '86\'d' : loading ? 'Adding…' : success ? '✓ Added' : 'Add'}
        </button>
        {error !== null && (
          <span className="text-base text-red-400">{error}</span>
        )}
      </div>
    </>
  )
}
