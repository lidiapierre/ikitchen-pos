'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { JSX } from 'react'
import { MOCK_ORDER_ITEMS } from './orderData'
import { callCloseOrder } from './closeOrderApi'
import { callRecordPayment } from './recordPaymentApi'

interface OrderDetailClientProps {
  tableId: string
  orderId: string
}

export default function OrderDetailClient({ tableId, orderId }: OrderDetailClientProps): JSX.Element {
  const router = useRouter()
  const [closing, setClosing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [step, setStep] = useState<'order' | 'payment' | 'change'>('order')
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card'>('cash')
  const [paying, setPaying] = useState(false)
  const [paymentError, setPaymentError] = useState<string | null>(null)
  const [changeDueCents, setChangeDueCents] = useState(0)
  const [amountTenderedDollars, setAmountTenderedDollars] = useState<string>('')

  const items = MOCK_ORDER_ITEMS
  const totalCents = items.reduce((sum, item) => sum + item.quantity * item.price_cents, 0)
  const totalFormatted = `$${(totalCents / 100).toFixed(2)}`

  async function handleCloseOrder(): Promise<void> {
    setError(null)
    setClosing(true)
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
      if (!supabaseUrl || !supabaseKey) {
        throw new Error('API not configured')
      }
      await callCloseOrder(supabaseUrl, supabaseKey, orderId)
      setStep('payment')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to close order')
    } finally {
      setClosing(false)
    }
  }

  async function handleRecordPayment(): Promise<void> {
    setPaymentError(null)

    const amountCentsToTender = paymentMethod === 'cash'
      ? Math.round(parseFloat(amountTenderedDollars || '0') * 100)
      : totalCents
    if (paymentMethod === 'cash' && amountCentsToTender < totalCents) {
      setPaymentError('Amount tendered must be at least the order total')
      return
    }

    setPaying(true)
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
      if (!supabaseUrl || !supabaseKey) {
        throw new Error('API not configured')
      }
      const result = await callRecordPayment(supabaseUrl, supabaseKey, orderId, amountCentsToTender, paymentMethod, totalCents)
      if (paymentMethod === 'cash') {
        setChangeDueCents(result.change_due)
        setStep('change')
      } else {
        router.push(`/tables/${tableId}`)
      }
    } catch (err) {
      setPaymentError(err instanceof Error ? err.message : 'Failed to record payment')
    } finally {
      setPaying(false)
    }
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
        {items.length === 0 ? (
          <p className="text-zinc-500 text-base">No items yet — tap Add Items to start</p>
        ) : (
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
        )}
      </section>

      <footer className="mt-6 pt-4 border-t border-zinc-700">
        <div className="flex items-center justify-between mb-6">
          <span className="text-lg text-zinc-400">Total</span>
          <span className="text-2xl font-bold text-white">{totalFormatted}</span>
        </div>

        {step === 'order' ? (
          <>
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

            {error !== null && (
              <p className="mt-4 text-base text-red-400">{error}</p>
            )}
          </>
        ) : step === 'payment' ? (
          <div className="space-y-5">
            <h2 className="text-xl font-semibold text-white">Record Payment</h2>

            <div>
              <p className="text-zinc-400 text-base mb-3">Payment method</p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => { setPaymentMethod('cash') }}
                  className={[
                    'flex-1 min-h-[48px] min-w-[48px] rounded-xl text-base font-semibold transition-colors border-2',
                    paymentMethod === 'cash'
                      ? 'border-amber-400 bg-amber-400/10 text-amber-400'
                      : 'border-zinc-600 text-zinc-300 hover:border-zinc-400',
                  ].join(' ')}
                >
                  Cash
                </button>
                <button
                  type="button"
                  onClick={() => { setPaymentMethod('card') }}
                  className={[
                    'flex-1 min-h-[48px] min-w-[48px] rounded-xl text-base font-semibold transition-colors border-2',
                    paymentMethod === 'card'
                      ? 'border-amber-400 bg-amber-400/10 text-amber-400'
                      : 'border-zinc-600 text-zinc-300 hover:border-zinc-400',
                  ].join(' ')}
                >
                  Card
                </button>
              </div>
            </div>

            {paymentMethod === 'cash' && (
              <div>
                <p className="text-zinc-400 text-base mb-2">Amount tendered</p>
                <input
                  type="number"
                  min={(totalCents / 100).toFixed(2)}
                  step="0.01"
                  placeholder={(totalCents / 100).toFixed(2)}
                  value={amountTenderedDollars}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setAmountTenderedDollars(e.target.value) }}
                  className="w-full min-h-[48px] px-4 rounded-xl text-base bg-zinc-800 text-white border-2 border-zinc-600 focus:border-amber-400 focus:outline-none"
                />
              </div>
            )}

            <button
              type="button"
              onClick={() => { void handleRecordPayment() }}
              disabled={paying}
              className={[
                'w-full min-h-[48px] min-w-[48px] px-6 rounded-xl text-base font-semibold transition-colors',
                paying
                  ? 'bg-zinc-700 text-zinc-400 cursor-wait'
                  : 'bg-amber-500 hover:bg-amber-400 text-zinc-900',
              ].join(' ')}
            >
              {paying ? 'Recording…' : `Confirm Payment · ${totalFormatted}`}
            </button>

            <button
              type="button"
              onClick={() => { router.push(`/tables/${tableId}`) }}
              className="w-full min-h-[48px] min-w-[48px] px-6 rounded-xl text-base font-semibold text-zinc-400 hover:text-white transition-colors"
            >
              Cancel
            </button>

            {paymentError !== null && (
              <p className="text-base text-red-400">{paymentError}</p>
            )}
          </div>
        ) : (
          <div className="space-y-5">
            <h2 className="text-xl font-semibold text-white">Change Due</h2>
            <p className="text-4xl font-bold text-amber-400">
              ${(changeDueCents / 100).toFixed(2)}
            </p>
            <button
              type="button"
              onClick={() => { router.push(`/tables/${tableId}`) }}
              className="w-full min-h-[48px] min-w-[48px] px-6 rounded-xl text-base font-semibold bg-amber-500 hover:bg-amber-400 text-zinc-900 transition-colors"
            >
              Done
            </button>
          </div>
        )}
      </footer>
    </main>
  )
}
