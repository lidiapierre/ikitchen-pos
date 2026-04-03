'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { JSX } from 'react'
import { callCreateOrder } from '../../../components/createOrderApi'
import { useUser } from '@/lib/user-context'
import { ShoppingBag } from 'lucide-react'

/**
 * Optimistic takeaway order creation page (issue #317).
 *
 * Navigated to immediately when staff tap "New Takeaway Order".
 * Renders the takeaway order shell instantly — no full-screen blocking spinner.
 * Fires callCreateOrder({ orderType: 'takeaway' }) in the background and
 * redirects to the real order page via router.replace on success.
 */
export default function NewTakeawayOrderPage(): JSX.Element {
  const router = useRouter()
  const { accessToken: _at } = useUser(); const accessToken = _at ?? ''
  const [error, setError] = useState<string | null>(null)
  const hasFired = useRef(false)

  useEffect(() => {
    if (accessToken === null) return
    if (hasFired.current) return
    hasFired.current = true

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!supabaseUrl || !accessToken) {
      void Promise.resolve().then(() => { setError('Not authenticated') })
      return
    }

    const controller = new AbortController()

    callCreateOrder(supabaseUrl, accessToken, { orderType: 'takeaway' }, controller.signal)
      .then(({ order_id }: { order_id: string }) => {
        if (controller.signal.aborted) return
        router.replace(`/tables/takeaway/order/${order_id}`)
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        const message = err instanceof Error ? err.message : 'Failed to create order'
        setError(message)
      })

    return () => { controller.abort() }
  }, [accessToken, router])

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

  // ── Takeaway order shell — visible immediately on tap ─────────────────────
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
          <div className="inline-flex items-center gap-2 bg-amber-900/40 border border-amber-700 rounded-xl px-4 py-2">
            <span className="text-amber-400 font-semibold text-base inline-flex items-center gap-1">
              <ShoppingBag size={16} aria-hidden="true" />Takeaway
            </span>
          </div>
        </div>
        <dl className="space-y-2 text-base">
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
