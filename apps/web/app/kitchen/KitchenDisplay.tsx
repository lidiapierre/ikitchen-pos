'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import { useUser } from '@/lib/user-context'
import {
  fetchKdsOrders,
  fetchKdsSettings,
  markOrderKitchenDone,
  type KdsOrder,
  type KdsSettings,
} from './kdsApi'
import { CheckCircle2, AlertTriangle, ChefHat, Delete } from 'lucide-react'
import { formatTimeOnly } from '@/lib/dateFormat'

// ── Helpers ────────────────────────────────────────────────────────────────

function getAgeMs(firedAt: string): number {
  return Date.now() - new Date(firedAt).getTime()
}

function formatAge(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes === 0) return `${seconds}s`
  return `${minutes}m ${seconds}s`
}

type AgeLevel = 'green' | 'yellow' | 'red'

function ageLevel(ms: number): AgeLevel {
  const minutes = ms / 60000
  if (minutes < 5) return 'green'
  if (minutes < 10) return 'yellow'
  return 'red'
}

const AGE_RING: Record<AgeLevel, string> = {
  green: 'border-green-500',
  yellow: 'border-yellow-400',
  red: 'border-red-500',
}

const AGE_BADGE: Record<AgeLevel, string> = {
  green: 'bg-green-900/60 text-green-300',
  yellow: 'bg-yellow-900/60 text-yellow-300',
  red: 'bg-red-900/60 text-red-300 animate-pulse',
}

const AGE_DOT_COLOR: Record<AgeLevel, string> = {
  green: 'bg-green-500',
  yellow: 'bg-yellow-400',
  red: 'bg-red-500',
}

const KDS_UNLOCK_KEY = 'kds_unlocked'

// ── PIN Screen ─────────────────────────────────────────────────────────────

function PinScreen({ onUnlock, correctPin }: { onUnlock: () => void; correctPin: string }): JSX.Element {
  const [entered, setEntered] = useState('')
  const [shaking, setShaking] = useState(false)

  function handleDigit(d: string): void {
    if (entered.length >= 4) return
    const next = entered + d
    setEntered(next)
    if (next.length === 4) {
      if (next === correctPin) {
        onUnlock()
      } else {
        setShaking(true)
        setTimeout(() => {
          setEntered('')
          setShaking(false)
        }, 600)
      }
    }
  }

  function handleBackspace(): void {
    setEntered((prev) => prev.slice(0, -1))
  }

  const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del']

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-zinc-950 gap-8 px-4">
      <div className="text-center">
        <div className="text-4xl font-bold text-white mb-2 flex items-center gap-3"><ChefHat size={40} aria-hidden="true" />Kitchen Display</div>
        <div className="text-zinc-400 text-xl">Enter PIN to continue</div>
      </div>

      {/* Dots */}
      <div className={`flex gap-4 transition-all ${shaking ? 'animate-bounce' : ''}`}>
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={[
              'w-5 h-5 rounded-full border-2 transition-colors',
              i < entered.length
                ? 'bg-indigo-400 border-indigo-400'
                : 'bg-transparent border-zinc-600',
            ].join(' ')}
          />
        ))}
      </div>

      {/* Numpad */}
      <div className="grid grid-cols-3 gap-4 w-full max-w-xs">
        {digits.map((d, idx) => {
          if (d === '') return <div key={idx} />
          const isBack = d === 'del'
          return (
            <button
              key={d}
              type="button"
              onClick={() => (isBack ? handleBackspace() : handleDigit(d))}
              className={[
                'rounded-2xl text-3xl font-bold min-h-[80px] transition-colors active:scale-95',
                isBack
                  ? 'bg-zinc-700 hover:bg-zinc-600 text-zinc-300'
                  : 'bg-zinc-800 hover:bg-zinc-700 text-white',
              ].join(' ')}
            >
              {isBack ? <Delete size={28} aria-hidden='true' /> : d}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Order Card ─────────────────────────────────────────────────────────────

interface OrderCardProps {
  order: KdsOrder
  onDone: (id: string) => void
  doneLoading: boolean
}

function OrderCard({ order, onDone, doneLoading }: OrderCardProps): JSX.Element {
  const [preparedItems, setPreparedItems] = useState<Set<string>>(new Set())
  const [nowMs, setNowMs] = useState(Date.now())

  // Tick every second for age timer
  useEffect(() => {
    const interval = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [])

  const ageMs = nowMs - new Date(order.firedAt).getTime()
  const level = ageLevel(ageMs)

  function toggleItem(itemId: string): void {
    setPreparedItems((prev) => {
      const next = new Set(prev)
      if (next.has(itemId)) next.delete(itemId)
      else next.add(itemId)
      return next
    })
  }

  return (
    <div
      className={[
        'flex flex-col bg-zinc-900 rounded-3xl border-4 p-6 gap-4',
        AGE_RING[level],
      ].join(' ')}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="text-4xl font-extrabold text-white leading-none">
          {order.tableLabel}
        </div>
        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-lg font-bold ${AGE_BADGE[level]}`}>
          <span className={`inline-block w-3 h-3 rounded-full ${AGE_DOT_COLOR[level]}`} aria-hidden="true" />
          <span>{formatAge(ageMs)}</span>
        </div>
      </div>

      {/* Items */}
      <ul className="flex flex-col gap-3">
        {order.items.map((item) => {
          const done = preparedItems.has(item.id)
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => toggleItem(item.id)}
                className={[
                  'w-full flex items-start gap-3 text-left rounded-xl px-3 py-2 transition-colors',
                  done
                    ? 'bg-zinc-800/40 text-zinc-500'
                    : 'bg-zinc-800 text-white hover:bg-zinc-700 active:scale-[0.98]',
                ].join(' ')}
              >
                <span
                  className={[
                    'text-3xl font-extrabold w-12 shrink-0 text-right',
                    done ? 'line-through opacity-40' : '',
                  ].join(' ')}
                >
                  {item.quantity}×
                </span>
                <div className="flex flex-col">
                  <span
                    className={[
                      'text-2xl font-bold leading-tight',
                      done ? 'line-through opacity-40' : '',
                    ].join(' ')}
                  >
                    {item.name}
                  </span>
                  {item.modifier_names.length > 0 && (
                    <span
                      className={[
                        'text-base text-zinc-400 mt-0.5',
                        done ? 'opacity-30' : '',
                      ].join(' ')}
                    >
                      {item.modifier_names.join(', ')}
                    </span>
                  )}
                </div>
              </button>
            </li>
          )
        })}
      </ul>

      {/* Mark Done */}
      <button
        type="button"
        onClick={() => onDone(order.id)}
        disabled={doneLoading}
        className={[
          'w-full mt-auto py-4 rounded-2xl text-2xl font-bold transition-colors min-h-[72px]',
          doneLoading
            ? 'bg-zinc-700 text-zinc-500 cursor-wait'
            : 'bg-green-700 hover:bg-green-600 active:bg-green-800 text-white',
        ].join(' ')}
      >
        {doneLoading ? 'Marking…' : <span className='inline-flex items-center gap-2'><CheckCircle2 size={24} aria-hidden='true' />Mark Done</span>}
      </button>
    </div>
  )
}

// ── Main KDS Display ───────────────────────────────────────────────────────

export default function KitchenDisplay(): JSX.Element {
  const { accessToken: _at } = useUser(); const accessToken = _at ?? ''
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''


  const [settings, setSettings] = useState<KdsSettings | null>(null)
  const [unlocked, setUnlocked] = useState(false)
  const [orders, setOrders] = useState<KdsOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [doneLoading, setDoneLoading] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Load settings on mount
  useEffect(() => {
    fetchKdsSettings(supabaseUrl, accessToken ?? "")
      .then((s) => {
        setSettings(s)
        // If PIN not enabled or already unlocked from localStorage, skip PIN screen
        const storedUnlock = typeof window !== 'undefined'
          ? localStorage.getItem(KDS_UNLOCK_KEY) === 'true'
          : false
        if (!s.pinEnabled || storedUnlock) {
          setUnlocked(true)
        }
      })
      .catch(() => {
        // If settings can't be fetched, allow open access
        setSettings({ pinEnabled: false, pin: null, refreshIntervalSeconds: 15 })
        setUnlocked(true)
      })
  }, [supabaseUrl, accessToken])

  const loadOrders = useCallback(async () => {
    try {
      const data = await fetchKdsOrders(supabaseUrl, accessToken ?? "")
      setOrders(data)
      setLastRefresh(new Date())
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load orders')
    } finally {
      setLoading(false)
    }
  }, [supabaseUrl, accessToken])

  // Start polling once unlocked
  useEffect(() => {
    if (!unlocked || settings === null) return

    void loadOrders()

    const interval = settings.refreshIntervalSeconds * 1000
    intervalRef.current = setInterval(() => void loadOrders(), interval)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [unlocked, settings, loadOrders])

  async function handleDone(orderId: string): Promise<void> {
    setDoneLoading(orderId)
    try {
      await markOrderKitchenDone(supabaseUrl, accessToken ?? "", orderId)
      setOrders((prev) => prev.filter((o) => o.id !== orderId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark done')
    } finally {
      setDoneLoading(null)
    }
  }

  function handleUnlock(): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem(KDS_UNLOCK_KEY, 'true')
    }
    setUnlocked(true)
  }

  // ── PIN gate ──────────────────────────────────────────────────────────────
  if (settings === null) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <span className="text-zinc-400 text-2xl animate-pulse">Loading…</span>
      </div>
    )
  }

  if (!unlocked && settings.pinEnabled && settings.pin) {
    return <PinScreen onUnlock={handleUnlock} correctPin={settings.pin} />
  }

  // ── KDS screen ────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col min-h-screen">
      {/* Top bar */}
      <header className="flex items-center justify-between bg-zinc-900 border-b border-zinc-800 px-6 py-4 shrink-0">
        <div className="flex items-center gap-3">
          <ChefHat size={32} className="text-amber-400" aria-hidden="true" />
          <span className="text-2xl font-bold text-white">Kitchen Display</span>
        </div>
        <div className="flex items-center gap-4">
          {lastRefresh && (
            <span className="text-zinc-500 text-base">
              Last refresh: {formatTimeOnly(lastRefresh.toISOString())}
            </span>
          )}
          <button
            type="button"
            onClick={() => void loadOrders()}
            className="px-4 py-2 rounded-xl bg-zinc-700 hover:bg-zinc-600 text-white text-base font-medium transition-colors min-h-[44px]"
          >
            ↻ Refresh
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 p-6">
        {error && (
          <div className="mb-4 p-4 rounded-xl bg-red-900/40 border border-red-700 text-red-300 text-lg">
            <span className="inline-flex items-center gap-2"><AlertTriangle size={20} aria-hidden="true" />{error}</span>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center h-64">
            <span className="text-zinc-400 text-2xl animate-pulse">Loading orders…</span>
          </div>
        )}

        {!loading && orders.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 gap-4">
            <CheckCircle2 size={64} className="text-green-500" aria-hidden="true" />
            <span className="text-zinc-400 text-2xl font-medium">All clear — no pending orders</span>
          </div>
        )}

        {!loading && orders.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {orders.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                onDone={(id) => void handleDone(id)}
                doneLoading={doneLoading === order.id}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
