'use client'

import { useState, useEffect } from 'react'
import type { JSX } from 'react'
import Link from 'next/link'
import { fetchShiftRevenue } from './shiftRevenueApi'
import { formatPrice, DEFAULT_CURRENCY_SYMBOL } from '@/lib/formatPrice'
import type { ShiftRevenue } from './shiftRevenueApi'
import { useUser } from '@/lib/user-context'
import { supabase } from '@/lib/supabase'
import { formatDateTime as fmtDateTime } from '@/lib/dateFormat'

interface ActiveShift {
  shift_id: string
  started_at: string
}

interface ShiftSummary {
  shift_id: string
  started_at: string
  ended_at: string
  revenue: ShiftRevenue
}

const STORAGE_KEY = 'ikitchen_active_shift'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

function loadShiftFromStorage(): ActiveShift | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as ActiveShift) : null
  } catch {
    return null
  }
}

function saveShiftToStorage(shift: ActiveShift | null): void {
  if (typeof window === 'undefined') return
  if (shift) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(shift))
  } else {
    localStorage.removeItem(STORAGE_KEY)
  }
}

function formatDateTime(iso: string): string {
  return fmtDateTime(iso)
}

function getDuration(start: string, end: string): string {
  const ms = new Date(end).getTime() - new Date(start).getTime()
  const totalMinutes = Math.floor(ms / 60000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
}

export default function ShiftsClient(): JSX.Element {
  const { accessToken: _at, userId: _uid } = useUser(); const accessToken = _at ?? ''; const userId = _uid ?? ''
  const [activeShift, setActiveShift] = useState<ActiveShift | null>(null)
  const [closedSummary, setClosedSummary] = useState<ShiftSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function fetchActiveShiftOnMount(): Promise<void> {
    try {
      // Must use the user's JWT (not anon key) — the restaurant_isolation RLS policy
      // on the shifts table requires an authenticated session. The anon_read policy
      // was removed in migration 20260401001000_rls_restaurant_isolation.
      if (!accessToken || !userId) {
        setActiveShift(loadShiftFromStorage())
        return
      }
      const baseUrl = SUPABASE_URL ?? ''
      // Filter by user_id to match the open_shift guard check scope
      const url = `${baseUrl}/rest/v1/shifts?select=id,opened_at&user_id=eq.${userId}&closed_at=is.null&limit=1`
      const headers: Record<string, string> = {
        Authorization: `Bearer ${accessToken}`,
      }
      if (SUPABASE_ANON_KEY) {
        headers['apikey'] = SUPABASE_ANON_KEY
      }
      const res = await fetch(url, { headers })
      if (res.ok) {
        const rows = (await res.json()) as Array<{ id: string; opened_at: string }>
        if (rows.length > 0) {
          const shift: ActiveShift = { shift_id: rows[0].id, started_at: rows[0].opened_at }
          setActiveShift(shift)
          saveShiftToStorage(shift)
          return
        }
        // Server confirms no open shift — keep localStorage in sync
        setActiveShift(null)
        saveShiftToStorage(null)
        return
      }
    } catch {
      // Server unavailable — fall back to localStorage
    }
    setActiveShift(loadShiftFromStorage())
  }

  useEffect(() => {
    void fetchActiveShiftOnMount()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken])

  async function handleOpenShift(): Promise<void> {
    setLoading(true)
    setError(null)
    setClosedSummary(null)
    try {
      const url = SUPABASE_URL
        ? `${SUPABASE_URL}/functions/v1/open_shift`
        : '/functions/v1/open_shift'
      const token = accessToken ?? (await supabase.auth.getSession()).data.session?.access_token
      if (!token) throw new Error('Not authenticated — please log in and try again.')
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ opening_float: 0 }),
      })
      const json = (await res.json()) as {
        success: boolean
        data?: { shift_id: string; started_at: string }
        error?: string
      }
      if (!json.success || !json.data) {
        throw new Error(json.error ?? 'Failed to open shift')
      }
      const shift: ActiveShift = {
        shift_id: json.data.shift_id,
        started_at: json.data.started_at,
      }
      setActiveShift(shift)
      saveShiftToStorage(shift)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to open shift')
    } finally {
      setLoading(false)
    }
  }

  async function handleCloseShift(): Promise<void> {
    if (!activeShift) return
    setLoading(true)
    setError(null)
    try {
      const url = SUPABASE_URL
        ? `${SUPABASE_URL}/functions/v1/close_shift`
        : '/functions/v1/close_shift'
      const token = accessToken ?? (await supabase.auth.getSession()).data.session?.access_token
      if (!token) throw new Error('Not authenticated — please log in and try again.')
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ shift_id: activeShift.shift_id, closing_float: 0 }),
      })
      const json = (await res.json()) as {
        success: boolean
        data?: { shift_id: string; ended_at: string }
        error?: string
      }
      if (!json.success || !json.data) {
        throw new Error(json.error ?? 'Failed to close shift')
      }
      const endedAt = json.data.ended_at
      const startedAt = activeShift.started_at
      const shiftId = activeShift.shift_id

      setActiveShift(null)
      saveShiftToStorage(null)

      let revenue: ShiftRevenue = { orderCount: 0, totalCents: 0, cashCents: 0, cardCents: 0, cashTenderedCents: 0, changeDueCents: 0 }
      try {
        revenue = await fetchShiftRevenue(startedAt, endedAt, accessToken)
      } catch (err: unknown) {
        setError(`Revenue fetch failed: ${err instanceof Error ? err.message : 'unknown error'}`)
      }

      setClosedSummary({ shift_id: shiftId, started_at: startedAt, ended_at: endedAt, revenue })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to close shift')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-zinc-900 p-6">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-white">Shift Management</h1>
        <Link
          href="/tables"
          className="text-zinc-400 hover:text-white text-base font-medium px-4 py-2 rounded-lg border border-zinc-700 hover:border-zinc-500 transition-colors min-h-[48px] flex items-center"
        >
          ← Tables
        </Link>
      </div>

      {error !== null && (
        <p className="text-red-400 text-base mb-6" role="alert">{error}</p>
      )}

      {closedSummary !== null ? (
        <div className="bg-zinc-800 rounded-xl p-6 max-w-md" data-testid="shift-summary">
          <h2 className="text-xl font-semibold text-white mb-4">Shift Closed</h2>
          <dl className="space-y-3 text-base">
            <div className="flex justify-between">
              <dt className="text-zinc-400">Started</dt>
              <dd className="text-white">{formatDateTime(closedSummary.started_at)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-zinc-400">Ended</dt>
              <dd className="text-white">{formatDateTime(closedSummary.ended_at)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-zinc-400">Duration</dt>
              <dd className="text-white">{getDuration(closedSummary.started_at, closedSummary.ended_at)}</dd>
            </div>
            <div className="border-t border-zinc-700 pt-3" />
            {closedSummary.revenue.orderCount === 0 ? (
              <div className="flex justify-between">
                <dt className="text-zinc-400">Orders</dt>
                <dd className="text-white">0 orders — {formatPrice(0, DEFAULT_CURRENCY_SYMBOL)}</dd>
              </div>
            ) : (
              <>
                <div className="flex justify-between">
                  <dt className="text-zinc-400">Orders</dt>
                  <dd className="text-white">
                    {closedSummary.revenue.orderCount} order{closedSummary.revenue.orderCount !== 1 ? 's' : ''}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-zinc-400">Total Revenue</dt>
                  <dd className="text-white font-semibold">{formatPrice(closedSummary.revenue.totalCents, DEFAULT_CURRENCY_SYMBOL)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-zinc-400">Cash (billed)</dt>
                  <dd className="text-white">{formatPrice(closedSummary.revenue.cashCents, DEFAULT_CURRENCY_SYMBOL)}</dd>
                </div>
                {closedSummary.revenue.cashTenderedCents > closedSummary.revenue.cashCents && (
                  <>
                    <div className="flex justify-between">
                      <dt className="text-zinc-400">Cash tendered</dt>
                      <dd className="text-white">{formatPrice(closedSummary.revenue.cashTenderedCents, DEFAULT_CURRENCY_SYMBOL)}</dd>
                    </div>
                    {closedSummary.revenue.changeDueCents > 0 && (
                      <div className="flex justify-between">
                        <dt className="text-zinc-400">Change given</dt>
                        <dd className="text-amber-400">− {formatPrice(closedSummary.revenue.changeDueCents, DEFAULT_CURRENCY_SYMBOL)}</dd>
                      </div>
                    )}
                  </>
                )}
                <div className="flex justify-between">
                  <dt className="text-zinc-400">Card</dt>
                  <dd className="text-white">{formatPrice(closedSummary.revenue.cardCents, DEFAULT_CURRENCY_SYMBOL)}</dd>
                </div>
              </>
            )}
          </dl>
          <button
            type="button"
            onClick={() => { setClosedSummary(null) }}
            className="mt-6 w-full bg-zinc-700 hover:bg-zinc-600 text-white text-lg font-medium rounded-xl min-h-[48px] px-6 py-3 transition-colors"
          >
            Dismiss
          </button>
        </div>
      ) : activeShift !== null ? (
        <div className="bg-zinc-800 rounded-xl p-6 max-w-md" data-testid="shift-open">
          <div className="flex items-center gap-3 mb-4">
            <span className="w-3 h-3 rounded-full bg-green-500 inline-block" aria-hidden="true" />
            <h2 className="text-xl font-semibold text-white">Shift Open</h2>
          </div>
          <p className="text-zinc-400 text-base mb-6">
            Started at <span className="text-white">{formatDateTime(activeShift.started_at)}</span>
          </p>
          <button
            type="button"
            onClick={() => { void handleCloseShift() }}
            disabled={loading}
            className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-lg font-medium rounded-xl min-h-[48px] px-6 py-3 transition-colors"
          >
            {loading ? 'Closing…' : 'Close Shift'}
          </button>
        </div>
      ) : (
        <div className="bg-zinc-800 rounded-xl p-6 max-w-md" data-testid="shift-none">
          <div className="flex items-center gap-3 mb-4">
            <span className="w-3 h-3 rounded-full bg-zinc-500 inline-block" aria-hidden="true" />
            <h2 className="text-xl font-semibold text-white">No Active Shift</h2>
          </div>
          <p className="text-zinc-400 text-base mb-6">
            There is no shift currently open.
          </p>
          <button
            type="button"
            onClick={() => { void handleOpenShift() }}
            disabled={loading}
            className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-lg font-medium rounded-xl min-h-[48px] px-6 py-3 transition-colors"
          >
            {loading ? 'Opening…' : 'Open Shift'}
          </button>
        </div>
      )}
    </main>
  )
}
