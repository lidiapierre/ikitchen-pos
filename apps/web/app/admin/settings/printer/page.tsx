'use client'

import React, { useState, useEffect } from 'react'
import type { JSX } from 'react'
import { supabase } from '@/lib/supabase'

const IP_REGEX = /^(\d{1,3}\.){3}\d{1,3}$/

interface PrinterConfigRow {
  mode: 'browser' | 'network'
  ip: string | null
  port: number | null
}

export default function PrinterSettingsPage(): JSX.Element {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [restaurantId, setRestaurantId] = useState<string | null>(null)

  const [mode, setMode] = useState<'browser' | 'network'>('browser')
  const [ip, setIp] = useState('')
  const [port, setPort] = useState('9100')

  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Load current config on mount
  useEffect(() => {
    async function load(): Promise<void> {
      setLoading(true)
      setErrorMsg(null)

      // Get restaurant_id from the logged-in user
      const { data: { user } } = await supabase.auth.getUser()
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

      const rid = (userData as { restaurant_id: string | null } | null)?.restaurant_id ?? null
      setRestaurantId(rid)

      if (!rid) {
        setLoading(false)
        return
      }

      const { data: config } = await supabase
        .from('printer_configs')
        .select('mode, ip, port')
        .eq('restaurant_id', rid)
        .single()

      if (config) {
        const row = config as PrinterConfigRow
        setMode(row.mode ?? 'browser')
        setIp(row.ip ?? '')
        setPort(String(row.port ?? 9100))
      }

      setLoading(false)
    }

    void load()
  }, [])

  function validate(): string | null {
    if (mode === 'network') {
      if (!ip.trim()) return 'IP address is required for network mode.'
      if (!IP_REGEX.test(ip.trim())) return 'Invalid IP address format (e.g. 192.168.1.100).'
      const portNum = parseInt(port, 10)
      if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
        return 'Port must be a number between 1 and 65535.'
      }
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
      mode,
      ip: mode === 'network' ? ip.trim() : null,
      port: mode === 'network' ? parseInt(port, 10) : 9100,
      updated_at: new Date().toISOString(),
    }

    const { error } = await supabase
      .from('printer_configs')
      .upsert(payload, { onConflict: 'restaurant_id' })

    setSaving(false)

    if (error) {
      setErrorMsg(`Failed to save: ${error.message}`)
    } else {
      setSuccessMsg('Printer settings saved successfully.')
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
      <h1 className="text-2xl font-bold text-white mb-2">Printer Settings</h1>
      <p className="text-zinc-400 text-sm mb-8">
        Configure how Kitchen Order Tickets (KOT) are printed. Use <strong className="text-zinc-200">Browser</strong> to
        print via the browser dialog, or <strong className="text-zinc-200">Network (WiFi/TCP)</strong> to send directly to
        a thermal printer on your local network using the print bridge.
      </p>

      <form onSubmit={(e) => { void handleSave(e) }} className="space-y-6">
        {/* Mode selector */}
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-2">Print Mode</label>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setMode('browser')}
              className={[
                'flex-1 py-3 px-4 rounded-xl text-base font-medium border transition-colors min-h-[48px]',
                mode === 'browser'
                  ? 'bg-indigo-600 border-indigo-500 text-white'
                  : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700',
              ].join(' ')}
            >
              🖥 Browser Print
            </button>
            <button
              type="button"
              onClick={() => setMode('network')}
              className={[
                'flex-1 py-3 px-4 rounded-xl text-base font-medium border transition-colors min-h-[48px]',
                mode === 'network'
                  ? 'bg-indigo-600 border-indigo-500 text-white'
                  : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700',
              ].join(' ')}
            >
              🖨 Network (WiFi/TCP)
            </button>
          </div>
        </div>

        {/* Network fields — only shown in network mode */}
        {mode === 'network' && (
          <div className="space-y-4 p-4 rounded-xl bg-zinc-800 border border-zinc-700">
            <div>
              <label htmlFor="printer-ip" className="block text-sm font-medium text-zinc-300 mb-1">
                Printer IP Address
              </label>
              <input
                id="printer-ip"
                type="text"
                value={ip}
                onChange={(e) => setIp(e.target.value)}
                placeholder="192.168.1.100"
                className="w-full bg-zinc-900 border border-zinc-600 rounded-lg px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-base"
              />
            </div>

            <div>
              <label htmlFor="printer-port" className="block text-sm font-medium text-zinc-300 mb-1">
                Port (default: 9100)
              </label>
              <input
                id="printer-port"
                type="number"
                value={port}
                onChange={(e) => setPort(e.target.value)}
                min="1"
                max="65535"
                className="w-full bg-zinc-900 border border-zinc-600 rounded-lg px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-base"
              />
            </div>

            <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-400 text-sm">
              <p className="font-semibold text-zinc-300 mb-1">ℹ️ Print Bridge Required</p>
              <p>
                Network printing requires the print bridge to run on the same computer as the browser:
              </p>
              <pre className="mt-2 text-xs bg-black/50 rounded p-2 text-green-400 overflow-x-auto">
                node scripts/print-bridge.js
              </pre>
            </div>
          </div>
        )}

        {/* Messages */}
        {errorMsg && (
          <div className="p-3 rounded-xl bg-red-900/50 border border-red-700 text-red-200 text-sm">
            ⚠️ {errorMsg}
          </div>
        )}
        {successMsg && (
          <div className="p-3 rounded-xl bg-green-900/50 border border-green-700 text-green-200 text-sm">
            ✅ {successMsg}
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
