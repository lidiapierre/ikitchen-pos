'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import type { JSX } from 'react'
import { callCreateOrder } from '../../../components/createOrderApi'
import { useUser } from '@/lib/user-context'

type Step = 'capture' | 'creating' | 'error'

/**
 * Dine-in new order page with optional customer capture (issue #401).
 *
 * Navigated to when staff tap an empty table. Shows an optional customer name
 * + mobile form. Staff can fill in customer details or leave blank and tap
 * "Create Order" to skip. The form never blocks order creation.
 *
 * On submit, transitions to a "creating" shell that shows a spinner while
 * callCreateOrder fires in the background, then redirects to the real order
 * page on success, or shows an error with a "Go back" button on failure.
 */
export default function NewOrderPage(): JSX.Element {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const tableId = params.id
  const { accessToken: _at } = useUser()
  // _at === null means auth is still loading; disable the submit button until ready.
  const accessToken = _at ?? ''

  const [step, setStep] = useState<Step>('capture')
  const [customerName, setCustomerName] = useState('')
  const [customerMobile, setCustomerMobile] = useState('')
  const [error, setError] = useState<string | null>(null)
  // Keep an AbortController ref so we can clean up if the component unmounts
  const controllerRef = useRef<AbortController | null>(null)

  // Abort any in-flight API call when the component unmounts (e.g. OS back gesture
  // during the 'creating' step) so stale callbacks don't fire on an unmounted component.
  useEffect(() => {
    return () => { controllerRef.current?.abort() }
  }, [])

  function handleCreateOrder(): void {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!supabaseUrl || !accessToken) {
      setError('Not authenticated')
      setStep('error')
      return
    }

    setStep('creating')

    const controller = new AbortController()
    controllerRef.current = controller

    const trimmedName = customerName.trim()
    const trimmedMobile = customerMobile.trim()

    callCreateOrder(
      supabaseUrl,
      accessToken,
      {
        tableId,
        orderType: 'dine_in',
        ...(trimmedName ? { customerName: trimmedName } : {}),
        ...(trimmedMobile ? { customerMobile: trimmedMobile } : {}),
      },
      controller.signal,
    )
      .then(({ order_id }: { order_id: string }) => {
        if (controller.signal.aborted) return
        router.replace(`/tables/${tableId}/order/${order_id}`)
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        const message = err instanceof Error ? err.message : 'Failed to create order'
        setError(message)
        setStep('error')
      })
  }

  // ── Error state ───────────────────────────────────────────────────────────
  if (step === 'error') {
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

  // ── Creating shell — visible after staff tap "Create Order" ───────────────
  if (step === 'creating') {
    const displayName = customerName.trim()
    const displayMobile = customerMobile.trim()
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
          <dl className="space-y-2 text-base">
            <div className="flex gap-3">
              <dt className="text-zinc-500">Table</dt>
              <dd className="font-semibold text-white">{tableId}</dd>
            </div>
            {displayName && (
              <div className="flex gap-3">
                <dt className="text-zinc-500">Customer</dt>
                <dd className="font-semibold text-white">{displayName}</dd>
              </div>
            )}
            {displayMobile && (
              <div className="flex gap-3">
                <dt className="text-zinc-500">Phone</dt>
                <dd className="text-zinc-300">{displayMobile}</dd>
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

  // ── Capture step — optional customer details form ─────────────────────────
  return (
    <main className="min-h-screen bg-zinc-900 p-6 flex flex-col">
      <button
        type="button"
        onClick={() => { router.replace('/tables') }}
        className="inline-flex items-center gap-2 text-zinc-400 hover:text-white text-base mb-8 min-h-[48px] min-w-[48px] transition-colors"
      >
        ← Back to tables
      </button>

      <header className="mb-6">
        <h1 className="text-2xl font-bold text-white mb-4">New Dine-in Order</h1>
        <dl className="space-y-2 text-base">
          <div className="flex gap-3">
            <dt className="text-zinc-500">Table</dt>
            <dd className="font-semibold text-white">{tableId}</dd>
          </div>
        </dl>
      </header>

      <section className="flex-1 max-w-sm">
        <h2 className="text-lg font-semibold text-white mb-1">Customer Details</h2>
        <p className="text-zinc-500 text-sm mb-4">Optional — leave blank to skip</p>

        <div className="space-y-4">
          <div>
            <label htmlFor="customerName" className="block text-sm font-medium text-zinc-400 mb-1">
              Customer Name
            </label>
            <input
              id="customerName"
              type="text"
              value={customerName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setCustomerName(e.target.value) }}
              placeholder="e.g. Ahmed Khan"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-600 text-base focus:outline-none focus:border-amber-500 transition-colors"
            />
          </div>

          <div>
            <label htmlFor="customerMobile" className="block text-sm font-medium text-zinc-400 mb-1">
              Mobile Number
            </label>
            <input
              id="customerMobile"
              type="tel"
              value={customerMobile}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setCustomerMobile(e.target.value) }}
              placeholder="e.g. +8801712345678"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-600 text-base focus:outline-none focus:border-amber-500 transition-colors"
            />
          </div>
        </div>
      </section>

      <footer className="mt-6 pt-4 border-t border-zinc-700">
        <button
          type="button"
          onClick={handleCreateOrder}
          disabled={_at === null}
          className="w-full min-h-[48px] px-6 rounded-xl text-base font-semibold bg-amber-500 hover:bg-amber-400 disabled:bg-zinc-700 disabled:text-zinc-500 disabled:cursor-not-allowed text-zinc-900 transition-colors"
        >
          Create Order
        </button>
      </footer>
    </main>
  )
}
