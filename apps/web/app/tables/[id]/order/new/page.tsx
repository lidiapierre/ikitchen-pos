'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import type { JSX } from 'react'
import { callCreateOrder } from '../../../components/createOrderApi'
import { useUser } from '@/lib/user-context'

/**
 * Optimistic order creation loading page (issue #298).
 *
 * Navigated to immediately when staff tap an empty table.
 * Fires callCreateOrder in the background and redirects to the real
 * order page on success, or shows an error with a "Go back" button on failure.
 */
export default function NewOrderPage(): JSX.Element {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const tableId = params.id
  const { accessToken } = useUser()
  const [error, setError] = useState<string | null>(null)
  const hasFired = useRef(false)

  useEffect(() => {
    if (!tableId || accessToken === null) return
    if (hasFired.current) return
    hasFired.current = true

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!supabaseUrl || !accessToken) {
      void Promise.resolve().then(() => { setError('Not authenticated') })
      return
    }

    const controller = new AbortController()

    callCreateOrder(supabaseUrl, accessToken, tableId, controller.signal)
      .then(({ order_id }) => {
        if (controller.signal.aborted) return
        router.replace(`/tables/${tableId}/order/${order_id}`)
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        const message = err instanceof Error ? err.message : 'Failed to create order'
        setError(message)
      })

    return () => { controller.abort() }
  }, [tableId, accessToken, router])

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

  return (
    <main className="min-h-screen bg-zinc-900 flex flex-col items-center justify-center p-6 gap-4">
      {/* Full-page loading spinner */}
      <div
        role="status"
        aria-label="Creating order…"
        className="flex flex-col items-center gap-4"
      >
        <svg
          className="animate-spin h-12 w-12 text-amber-400"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
        <p className="text-zinc-400 text-base">Creating order…</p>
      </div>
    </main>
  )
}
