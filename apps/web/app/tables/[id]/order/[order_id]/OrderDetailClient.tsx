'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { JSX } from 'react'
import { fetchOrderItems } from './orderData'
import type { OrderItem } from './orderData'
import { callCloseOrder } from './closeOrderApi'

interface OrderDetailClientProps {
  tableId: string
  orderId: string
}

export default function OrderDetailClient({ tableId, orderId }: OrderDetailClientProps): JSX.Element {
  const router = useRouter()
  const [closing, setClosing] = useState(false)
  const [closeError, setCloseError] = useState<string | null>(null)
  const [items, setItems] = useState<OrderItem[]>([])
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

    fetchOrderItems(supabaseUrl, supabaseKey, orderId)
      .then((data) => {
        setItems(data)
      })
      .catch((err: unknown) => {
        setFetchError(err instanceof Error ? err.message : 'Failed to load order items')
      })
      .finally(() => {
        setLoading(false)
      })
  }, [orderId])

  const totalCents = items.reduce((sum, item) => sum + item.quantity * item.price_cents, 0)
  const totalFormatted = `$${(totalCents / 100).toFixed(2)}`

  async function handleCloseOrder(): Promise<void> {
    setCloseError(null)
    setClosing(true)
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
      if (!supabaseUrl || !supabaseKey) {
        throw new Error('API not configured')
      }
      await callCloseOrder(supabaseUrl, supabaseKey, orderId)
      router.push(`/tables/${tableId}`)
    } catch (err) {
      setCloseError(err instanceof Error ? err.message : 'Failed to close order')
    } finally {
      setClosing(false)
    }
  }

  function renderItems(): JSX.Element {
    if (loading) {
      return <p className="text-zinc-400 text-base">Loading items…</p>
    }
    if (fetchError !== null) {
      return <p className="text-red-400 text-base">{fetchError}</p>
    }
    if (items.length === 0) {
      return <p className="text-zinc-500 text-base">No items yet — tap Add Items to start</p>
    }
    return (
      <ul className="space-y-2 mb-6">
        {items.map((item) => {
          const lineTotal = (item.quantity * item.price_cents) / 100
          const priceEach = item.price_cents / 100
          return (
            <li
              key={item.id}
              className="flex items-center justify-between gap-4 bg-zinc-800 rounded-xl px-4 py-3 text-base"
            >
              <span className="font-semibold text-white flex-1">{item.name}</span>
              <span className="text-zinc-400">×{item.quantity}</span>
              <span className="text-zinc-400">${priceEach.toFixed(2)} each</span>
              <span className="font-bold text-amber-400">${lineTotal.toFixed(2)}</span>
            </li>
          )
        })}
      </ul>
    )
  }

  return (
    <main className="min-h-screen bg-zinc-900 p-6 flex flex-col">
      <Link
        href="/tables"
        className="inline-flex items-center gap-2 text-zinc-400 hover:text-white text-base mb-8 min-h-[48px] min-w-[48px]"
      >
        ← Back to tables
      </Link>

      <header className="mb-6">
        <h1 className="text-2xl font-bold text-white mb-4">Order</h1>
        <dl className="space-y-2 text-base">
          <div className="flex gap-3">
            <dt className="text-zinc-500">Table</dt>
            <dd className="font-semibold text-white">{tableId}</dd>
          </div>
          <div className="flex gap-3">
            <dt className="text-zinc-500">Order ID</dt>
            <dd className="font-mono text-sm text-zinc-300">{orderId}</dd>
          </div>
        </dl>
      </header>

      <section className="flex-1">
        <h2 className="text-lg font-semibold text-white mb-4">Items</h2>
        {renderItems()}
      </section>

      <footer className="mt-6 pt-4 border-t border-zinc-700">
        <div className="flex items-center justify-between mb-6">
          <span className="text-lg text-zinc-400">Total</span>
          <span className="text-2xl font-bold text-white">{totalFormatted}</span>
        </div>

        <div className="flex gap-4">
          <Link
            href={`/tables/${tableId}/order/${orderId}/menu`}
            className="flex-1 inline-flex items-center justify-center min-h-[48px] min-w-[48px] px-6 rounded-xl border-2 border-zinc-600 text-white text-base font-semibold hover:border-zinc-400 transition-colors"
          >
            Add Items
          </Link>
          <button
            type="button"
            onClick={() => { void handleCloseOrder() }}
            disabled={closing}
            className={[
              'flex-1 min-h-[48px] min-w-[48px] px-6 rounded-xl text-base font-semibold transition-colors',
              closing
                ? 'bg-zinc-700 text-zinc-400 cursor-wait'
                : 'bg-red-700 hover:bg-red-600 text-white',
            ].join(' ')}
          >
            {closing ? 'Closing…' : 'Close Order'}
          </button>
        </div>

        {closeError !== null && (
          <p className="mt-4 text-base text-red-400">{closeError}</p>
        )}
      </footer>
    </main>
  )
}
