'use client'

import React, { useEffect, useState } from 'react'
import type { JSX } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'

interface KdsSettingsRow {
  id: string | null
  restaurant_id: string
  pin_enabled: boolean
  pin: string | null
  refresh_interval_seconds: number
}

const PIN_REGEX = /^\d{4}$/

export default function KdsSettingsPage(): JSX.Element {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [restaurantId, setRestaurantId] = useState<string | null>(null)

  const [pinEnabled, setPinEnabled] = useState(false)
  const [pin, setPin] = useState('')
  const [refreshInterval, setRefreshInterval] = useState('15')

  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    async function load(): Promise<void> {
      setLoading(true)
      setErrorMsg(null)

      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        setErrorMsg('Not authenticated')
        setLoading(false)
        return
      }

      const { data: userData } = await supabase
        .from('users')
        .select('restaurant_id')
        .eq('id', user.id)
        .single()

      const rid =
        (userData as { restaurant_id: string | null } | null)?.restaurant_id ??
        null
      setRestaurantId(rid)

      if (!rid) {
        setLoading(false)
        return
      }

      const { data: config } = await supabase
        .from('kds_settings')
        .select('id,restaurant_id,pin_enabled,pin,refresh_interval_seconds')
        .eq('restaurant_id', rid)
        .single()

      if (config) {
        const row = config as KdsSettingsRow
        setPinEnabled(row.pin_enabled)
        setPin(row.pin ?? '')
        setRefreshInterval(String(row.refresh_interval_seconds ?? 15))
      }

      setLoading(false)
    }

    void load()
  }, [])

  function validate(): string | null {
    if (pinEnabled) {
      if (!PIN_REGEX.test(pin)) return 'PIN must be exactly 4 digits.'
    }
    const interval = parseInt(refreshInterval, 10)
    if (isNaN(interval) || interval < 5 || interval > 300) {
      return 'Refresh interval must be between 5 and 300 seconds.'
    }
    return null
  }

  async function handleSave(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setSuccessMsg(null)
    setErrorMsg(null)

    const validationError = validate()
    if (validationError) {
      setErrorMsg(validationError)
      return
    }

    if (!restaurantId) {
      setErrorMsg('No restaurant associated with your account.')
      return
    }

    setSaving(true)

    const payload = {
      restaurant_id: restaurantId,
      pin_enabled: pinEnabled,
      pin: pinEnabled ? pin : null,
      refresh_interval_seconds: parseInt(refreshInterval, 10),
      updated_at: new Date().toISOString(),
    }

    const { error } = await supabase
      .from('kds_settings')
      .upsert(payload, { onConflict: 'restaurant_id' })

    setSaving(false)

    if (error) {
      setErrorMsg(`Failed to save: ${error.message}`)
    } else {
      setSuccessMsg('KDS settings saved successfully.')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <span className="text-zinc-400 text-lg">Loading…</span>
      </div>
    )
  }

  return (
    <div className="max-w-xl">
      <div className="flex items-center gap-4 mb-2">
        <h1 className="text-2xl font-bold text-white">Kitchen Display (KDS)</h1>
        <Link
          href="/kitchen"
          target="_blank"
          rel="noopener noreferrer"
          className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
        >
          Open KDS →
        </Link>
      </div>
      <p className="text-zinc-400 text-sm mb-8">
        Configure the kitchen display screen that replaces paper KOTs. Open{' '}
        <code className="text-zinc-300">/kitchen</code> on a wall-mounted tablet
        in the kitchen.
      </p>

      <form
        onSubmit={(e) => {
          void handleSave(e)
        }}
        className="space-y-6"
      >
        {/* PIN toggle */}
        <div className="p-4 rounded-xl bg-zinc-800 border border-zinc-700 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-base font-semibold text-white">PIN Protection</div>
              <div className="text-sm text-zinc-400">
                Require a 4-digit PIN when opening the KDS screen
              </div>
            </div>
            <button
              type="button"
              onClick={() => setPinEnabled((v) => !v)}
              className={[
                'relative inline-flex h-7 w-12 items-center rounded-full transition-colors',
                pinEnabled ? 'bg-indigo-600' : 'bg-zinc-600',
              ].join(' ')}
            >
              <span
                className={[
                  'inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform',
                  pinEnabled ? 'translate-x-6' : 'translate-x-1',
                ].join(' ')}
              />
            </button>
          </div>

          {pinEnabled && (
            <div>
              <label
                htmlFor="kds-pin"
                className="block text-sm font-medium text-zinc-300 mb-1"
              >
                PIN (4 digits)
              </label>
              <input
                id="kds-pin"
                type="text"
                inputMode="numeric"
                pattern="\d{4}"
                maxLength={4}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="e.g. 1234"
                className="w-full bg-zinc-900 border border-zinc-600 rounded-lg px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-base tracking-widest font-mono"
              />
              <p className="mt-1 text-xs text-zinc-500">
                Devices that have unlocked once stay unlocked until browser data is cleared.
              </p>
            </div>
          )}
        </div>

        {/* Refresh interval */}
        <div>
          <label
            htmlFor="kds-refresh"
            className="block text-sm font-medium text-zinc-300 mb-1"
          >
            Auto-refresh interval (seconds)
          </label>
          <input
            id="kds-refresh"
            type="number"
            value={refreshInterval}
            onChange={(e) => setRefreshInterval(e.target.value)}
            min="5"
            max="300"
            className="w-full bg-zinc-900 border border-zinc-600 rounded-lg px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-base"
          />
          <p className="mt-1 text-xs text-zinc-500">
            Default: 15 seconds. Range: 5–300 seconds.
          </p>
        </div>

        {/* Messages */}
        {errorMsg && (
          <div className="p-3 rounded-xl bg-red-900/50 border border-red-700 text-red-200 text-sm flex items-center gap-2">
            <AlertTriangle size={16} aria-hidden="true" />
            {errorMsg}
          </div>
        )}
        {successMsg && (
          <div className="p-3 rounded-xl bg-green-900/50 border border-green-700 text-green-200 text-sm flex items-center gap-2">
            <CheckCircle2 size={16} aria-hidden="true" />
            {successMsg}
          </div>
        )}

        <button
          type="submit"
          disabled={saving}
          className="w-full py-3 px-6 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-base font-semibold transition-colors min-h-[48px] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving…' : 'Save Settings'}
        </button>
      </form>
    </div>
  )
}
