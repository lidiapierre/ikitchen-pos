'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { JSX } from 'react'
import { callCreateOrder } from '../../../components/createOrderApi'
import { useUser } from '@/lib/user-context'
import { Bike } from 'lucide-react'

/**
 * Client component for the optimistic delivery order creation page (issue #317).
 *
 * Must be rendered inside a <Suspense> boundary by page.tsx because it calls
 * useSearchParams() — without Suspense Next.js would de-opt the whole route to
 * dynamic rendering.
 *
 * customerName and deliveryNote are passed as URL search params by
 * handleCreateDelivery() in tables/page.tsx.
 */
export default function NewDeliveryOrderClient(): JSX.Element {
  const router = useRouter()
  const searchParams = useSearchParams()
  const customerName = searchParams.get('customerName') ?? ''
  const customerPhone = searchParams.get('customerPhone') ?? ''
  const deliveryNote = searchParams.get('deliveryNote') ?? ''
  const scheduledTime = searchParams.get('scheduledTime') ?? ''
  const { accessToken: _at } = useUser()
  // _at === null means auth is still loading; wait before firing.
  const accessToken = _at ?? ''
  const [error, setError] = useState<string | null>(null)
  const hasFired = useRef(false)

  useEffect(() => {
    if (_at === null) return
    if (hasFired.current) return
    hasFired.current = true

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!supabaseUrl || !accessToken) {
      void Promise.resolve().then(() => { setError('Not authenticated') })
      return
    }

    if (!customerName) {
      void Promise.resolve().then(() => { setError('Customer name is required for delivery orders') })
      return
    }

    if (!scheduledTime) {
      void Promise.resolve().then(() => { setError('Delivery Time is required for delivery orders') })
      return
    }

    const controller = new AbortController()

    callCreateOrder(
      supabaseUrl,
      accessToken,
      {
        orderType: 'delivery',
        customerName,
        ...(customerPhone ? { customerMobile: customerPhone } : {}),
        ...(deliveryNote ? { deliveryNote } : {}),
        scheduledTime,
      },
      controller.signal,
    )
      .then(({ order_id }: { order_id: string }) => {
        if (controller.signal.aborted) return
        router.replace(`/tables/delivery/order/${order_id}`)
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        const message = err instanceof Error ? err.message : 'Failed to create order'
        setError(message)
      })

    return () => { controller.abort() }
  }, [_at, accessToken, customerName, customerPhone, deliveryNote, scheduledTime, router])

  if (error !== null) {
    return (
      <main className="min-h-screen bg-zinc-900 flex flex-col items-center justify-center p-6 gap-6">
        <div className="flex flex-col items-center gap-4 max-w-sm w-full">
          <div className="text-red-400 text-center">
            <p className="text-xl font-semibold mb-2">Failed to create order</p>
            <p className="text-sm text-red-300 break-words">{error}</p>
          </div>
          <button
            type="button"
            onClick={() => { router.replace('/tables') }}
            className="w-full min-h-[48px] px-6 rounded-xl text-base font-semibold bg-zinc-700 hover:bg-zinc-600 text-white transition-colors"
          >
            ← Go back to tables
          </button>
        </div>
      </main>
    )
  }

  // ── Delivery order shell — visible immediately on confirm ─────────────────
  return (
    <main className="min-h-screen bg-zinc-900 p-6 flex flex-col">
      <button
        type="button"
        disabled
        className="inline-flex items-center gap-2 text-zinc-600 text-base mb-8 min-h-[48px] min-w-[48px] cursor-not-allowed"
      >
        ← Back to tables
      </button>

      <header className="mb-6">
        <h1 className="text-2xl font-bold text-white mb-4">Order</h1>
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="inline-flex items-center gap-2 bg-blue-900/40 border border-blue-700 rounded-xl px-4 py-2">
            <span className="text-blue-400 font-semibold text-base inline-flex items-center gap-1">
              <Bike size={16} aria-hidden="true" />Delivery
            </span>
          </div>
        </div>
        <dl className="space-y-2 text-base">
          {customerName && (
            <div className="flex gap-3">
              <dt className="text-zinc-500">Customer</dt>
              <dd className="font-semibold text-white">{customerName}</dd>
            </div>
          )}
          {customerPhone && (
            <div className="flex gap-3">
              <dt className="text-zinc-500">Phone</dt>
              <dd className="text-zinc-300">{customerPhone}</dd>
            </div>
          )}
          {deliveryNote && (
            <div className="flex gap-3">
              <dt className="text-zinc-500">Note</dt>
              <dd className="text-zinc-300">{deliveryNote}</dd>
            </div>
          )}
          {scheduledTime && (
            <div className="flex gap-3">
              <dt className="text-zinc-500">Delivery Time</dt>
              <dd className="font-semibold text-amber-300">
                {new Date(scheduledTime).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
              </dd>
            </div>
          )}
          <div className="flex gap-3">
            <dt className="text-zinc-500">Order ID</dt>
            <dd className="font-mono text-sm text-zinc-500 flex items-center gap-2">
              <svg
                className="animate-spin h-3 w-3 text-amber-400 flex-shrink-0"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span role="status" aria-label="Creating order…">Creating order…</span>
            </dd>
          </div>
        </dl>
      </header>

      <section className="flex-1">
        <h2 className="text-lg font-semibold text-white mb-4">Items</h2>
        <p className="text-zinc-500 text-base">No items yet — tap Add Items to start</p>
      </section>

      <footer className="mt-6 pt-4 border-t border-zinc-700">
        <div className="flex items-center justify-between mb-6">
          <span className="text-lg text-zinc-400">Total</span>
          <span className="text-2xl font-bold text-zinc-600">৳0.00</span>
        </div>
        <div className="flex gap-4 mb-3">
          <button
            type="button"
            disabled
            className="flex-1 min-h-[48px] min-w-[48px] px-6 rounded-xl border-2 border-zinc-700 text-zinc-600 text-base font-semibold cursor-not-allowed"
          >
            Add Items
          </button>
          <button
            type="button"
            disabled
            className="flex-1 min-h-[48px] min-w-[48px] px-6 rounded-xl text-base font-semibold bg-zinc-800 text-zinc-600 cursor-not-allowed"
          >
            Close Order
          </button>
        </div>
      </footer>
    </main>
  )
}
