'use client'

import { useState } from 'react'
import type { JSX } from 'react'
import type { MenuItem } from './menuData'
import { callAddItemToOrder } from './addItemApi'

interface MenuItemCardProps {
  item: MenuItem
  orderId: string
  onItemAdded: (priceCents: number) => void
}

export default function MenuItemCard({ item, orderId, onItemAdded }: MenuItemCardProps): JSX.Element {
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleAdd(): Promise<void> {
    setError(null)
    setSuccess(false)
    setLoading(true)
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
      if (!supabaseUrl || !supabaseKey) {
        throw new Error('API not configured')
      }
      await callAddItemToOrder(supabaseUrl, supabaseKey, orderId, item.id)
      setSuccess(true)
      onItemAdded(item.price_cents)
      setTimeout(() => setSuccess(false), 1500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add item')
    } finally {
      setLoading(false)
    }
  }

  const priceFormatted = `$${(item.price_cents / 100).toFixed(2)}`

  return (
    <div className="flex flex-col gap-3 bg-zinc-800 rounded-2xl p-4 border-2 border-zinc-600">
      <div className="flex flex-col gap-1">
        <span className="text-base font-semibold text-white">{item.name}</span>
        <span className="text-lg font-bold text-amber-400">{priceFormatted}</span>
      </div>
      <button
        type="button"
        onClick={() => { void handleAdd() }}
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
        <span className="text-xs text-red-400">{error}</span>
      )}
    </div>
  )
}
