'use client'

import { useState, useEffect } from 'react'
import type { JSX } from 'react'
import Link from 'next/link'

interface ActiveShift {
  shift_id: string
  started_at: string
}

interface ShiftSummary {
  shift_id: string
  started_at: string
  ended_at: string
}

const STORAGE_KEY = 'ikitchen_active_shift'

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
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function getDuration(start: string, end: string): string {
  const ms = new Date(end).getTime() - new Date(start).getTime()
  const totalMinutes = Math.floor(ms / 60000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
}

export default function ShiftsClient(): JSX.Element {
  const [activeShift, setActiveShift] = useState<ActiveShift | null>(null)
  const [closedSummary, setClosedSummary] = useState<ShiftSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setActiveShift(loadShiftFromStorage())
  }, [])

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

  async function handleOpenShift(): Promise<void> {
    setLoading(true)
    setError(null)
    setClosedSummary(null)
    try {
      const url = supabaseUrl
        ? `${supabaseUrl}/functions/v1/open_shift`
        : '/functions/v1/open_shift'
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staff_id: 'demo-staff', opening_float: 0 }),
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
      const url = supabaseUrl
        ? `${supabaseUrl}/functions/v1/close_shift`
        : '/functions/v1/close_shift'
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shift_id: activeShift.shift_id, closing_float: 0 }),
      })
      const json = (await res.json()) as {
        success: boolean
        data?: unknown
        error?: string
      }
      if (!json.success) {
        throw new Error(json.error ?? 'Failed to close shift')
      }
      const endedAt = new Date().toISOString()
      setClosedSummary({
        shift_id: activeShift.shift_id,
        started_at: activeShift.started_at,
        ended_at: endedAt,
      })
      setActiveShift(null)
      saveShiftToStorage(null)
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
