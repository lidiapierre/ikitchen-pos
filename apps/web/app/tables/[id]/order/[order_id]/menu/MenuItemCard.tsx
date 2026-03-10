'use client'

import { useState } from 'react'
import type { JSX } from 'react'
import type { MenuItem } from './menuData'
import { callAddItemToOrder } from './addItemApi'
import ModifierSelectionModal from './ModifierSelectionModal'

interface MenuItemCardProps {
  item: MenuItem
  orderId: string
  onItemAdded: (priceCents: number) => void
}

export default function MenuItemCard({ item, orderId, onItemAdded }: MenuItemCardProps): JSX.Element {
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
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
      if (!supabaseUrl || !supabaseKey) {
        throw new Error('API not configured')
      }
      await callAddItemToOrder(supabaseUrl, supabaseKey, orderId, item.id, modifierIds.length > 0 ? modifierIds : undefined)
      setSuccess(true)
      onItemAdded(item.price_cents)
      setTimeout(() => setSuccess(false), 1500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add item')
    } finally {
      setLoading(false)
    }
  }

  function handleTap(): void {
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

  const priceFormatted = `$${(item.price_cents / 100).toFixed(2)}`

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

      <div className="flex flex-col gap-3 bg-zinc-800 rounded-2xl p-4 border-2 border-zinc-600">
        <div className="flex flex-col gap-1">
          <span className="text-base font-semibold text-white">{item.name}</span>
          <span className="text-lg font-bold text-amber-400">{priceFormatted}</span>
          {item.modifiers.length > 0 && (
            <span className="text-sm text-zinc-400">{item.modifiers.length} option{item.modifiers.length !== 1 ? 's' : ''}</span>
          )}
        </div>
        <button
          type="button"
          onClick={handleTap}
          disabled={loading}
          className={[
            'min-h-[48px] min-w-[48px] rounded-xl text-base font-semibold',
            'transition-colors',
            success
              ? 'bg-green-600 text-white'
              : loading
                ? 'bg-zinc-700 text-zinc-400 cursor-wait'
                : 'bg-amber-600 hover:bg-amber-500 text-white',
          ].join(' ')}
        >
          {loading ? 'Adding…' : success ? '✓ Added' : 'Add'}
        </button>
        {error !== null && (
          <span className="text-base text-red-400">{error}</span>
        )}
      </div>
    </>
  )
}
