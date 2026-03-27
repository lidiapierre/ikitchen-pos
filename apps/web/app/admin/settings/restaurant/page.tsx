'use client'

/**
 * Admin → Settings → Restaurant
 *
 * Issue #261: Configure BIN number and register name for bill printing.
 * Also supports restaurant address line shown on printed receipts.
 *
 * Stores settings in the `config` table (same upsert pattern as VAT/currency config).
 */

import React, { useState, useEffect, useRef } from 'react'
import type { JSX } from 'react'
import Link from 'next/link'
import { callUpsertConfig } from '@/app/admin/pricing/pricingAdminApi'
import { fetchConfigValue } from '@/app/admin/pricing/pricingAdminData'

type FeedbackType = 'success' | 'error'
interface Feedback {
  type: FeedbackType
  message: string
}

export default function RestaurantSettingsPage(): JSX.Element {
  const [loading, setLoading] = useState(true)
  const [restaurantId, setRestaurantId] = useState<string>('')
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Form state
  const [binNumber, setBinNumber] = useState('')
  const [registerName, setRegisterName] = useState('')
  const [restaurantAddress, setRestaurantAddress] = useState('')

  // Supabase config ref
  const supabaseConfig = useRef<{ url: string; key: string } | null>(null)

  useEffect(() => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    if (!supabaseUrl || !supabaseKey) {
      setFetchError('API not configured')
      setLoading(false)
      return
    }
    supabaseConfig.current = { url: supabaseUrl, key: supabaseKey }

    // Fetch restaurant id then load config keys
    const headers = { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` }
    fetch(`${supabaseUrl}/rest/v1/restaurants?select=id&limit=1`, { headers })
      .then((r) => r.json() as Promise<Array<{ id: string }>>)
      .then(async (rows) => {
        if (rows.length === 0) throw new Error('No restaurant found')
        const rid = rows[0].id
        setRestaurantId(rid)
        const [binVal, regVal, addrVal] = await Promise.all([
          fetchConfigValue(supabaseUrl, supabaseKey, rid, 'bin_number', ''),
          fetchConfigValue(supabaseUrl, supabaseKey, rid, 'register_name', ''),
          fetchConfigValue(supabaseUrl, supabaseKey, rid, 'restaurant_address', ''),
        ])
        setBinNumber(binVal)
        setRegisterName(regVal)
        setRestaurantAddress(addrVal)
      })
      .catch((err: unknown) => {
        setFetchError(err instanceof Error ? err.message : 'Failed to load settings')
      })
      .finally(() => { setLoading(false) })
  }, [])

  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current)
    }
  }, [])

  function showFeedback(type: FeedbackType, message: string): void {
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current)
    setFeedback({ type, message })
    feedbackTimerRef.current = setTimeout(() => { setFeedback(null) }, 4000)
  }

  async function handleSave(): Promise<void> {
    const config = supabaseConfig.current
    if (!config || !restaurantId) return
    setSubmitting(true)
    try {
      await Promise.all([
        binNumber.trim()
          ? callUpsertConfig(config.url, config.key, restaurantId, 'bin_number', binNumber.trim())
          : Promise.resolve(),
        registerName.trim()
          ? callUpsertConfig(config.url, config.key, restaurantId, 'register_name', registerName.trim())
          : Promise.resolve(),
        restaurantAddress.trim()
          ? callUpsertConfig(config.url, config.key, restaurantId, 'restaurant_address', restaurantAddress.trim())
          : Promise.resolve(),
      ])
      showFeedback('success', 'Restaurant settings saved.')
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : 'Failed to save settings.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-bold text-white">Restaurant Settings</h1>
        <p className="text-zinc-400 text-base">Loading…</p>
      </div>
    )
  }

  if (fetchError) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-bold text-white">Restaurant Settings</h1>
        <p className="text-red-400 text-base">Unable to load settings. Please try again.</p>
        <p className="text-red-300 text-sm font-mono">{fetchError}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-8 max-w-2xl">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <Link
          href="/admin"
          className="flex items-center min-h-[48px] px-3 py-2 rounded-xl text-base font-medium text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors"
        >
          ← Admin
        </Link>
        <h1 className="text-2xl font-bold text-white">Restaurant Settings</h1>
      </div>

      {/* Feedback banner */}
      {feedback && (
        <div
          role="status"
          className={[
            'px-5 py-3 rounded-xl text-base font-medium',
            feedback.type === 'success'
              ? 'bg-green-800 text-green-100'
              : 'bg-red-800 text-red-100',
          ].join(' ')}
        >
          {feedback.message}
        </div>
      )}

      {/* Bill printing section */}
      <div className="bg-zinc-800 border border-zinc-700 rounded-2xl p-6 flex flex-col gap-6">
        <div>
          <h2 className="text-lg font-semibold text-white">Bill / Receipt Settings</h2>
          <p className="text-sm text-zinc-400 mt-1">
            These details appear on every printed bill and receipt.
          </p>
        </div>

        {/* Restaurant Address */}
        <div className="flex flex-col gap-1">
          <label htmlFor="restaurant-address" className="text-sm font-medium text-zinc-300">
            Restaurant Address
          </label>
          <input
            id="restaurant-address"
            type="text"
            value={restaurantAddress}
            onChange={(e) => { setRestaurantAddress(e.target.value) }}
            disabled={submitting}
            placeholder="e.g. 123 Main Street, Dhaka 1200"
            className="min-h-[48px] px-4 py-2 rounded-xl bg-zinc-900 text-white border border-zinc-600 focus:border-indigo-500 focus:outline-none text-base disabled:opacity-50 placeholder-zinc-600"
          />
          <p className="text-xs text-zinc-500">Shown below restaurant name on the printed bill.</p>
        </div>

        {/* BIN Number */}
        <div className="flex flex-col gap-1">
          <label htmlFor="bin-number" className="text-sm font-medium text-zinc-300">
            BIN Number <span className="text-zinc-500 font-normal">(VAT Registration)</span>
          </label>
          <input
            id="bin-number"
            type="text"
            value={binNumber}
            onChange={(e) => { setBinNumber(e.target.value) }}
            disabled={submitting}
            placeholder="e.g. 003206332-0101 -Musak6.3"
            className="min-h-[48px] px-4 py-2 rounded-xl bg-zinc-900 text-white border border-zinc-600 focus:border-indigo-500 focus:outline-none text-base disabled:opacity-50 placeholder-zinc-600"
          />
          <p className="text-xs text-zinc-500">
            Your VAT / BIN registration number printed on every receipt. Leave blank to hide.
          </p>
        </div>

        {/* Register Name */}
        <div className="flex flex-col gap-1">
          <label htmlFor="register-name" className="text-sm font-medium text-zinc-300">
            Register / Terminal Name
          </label>
          <input
            id="register-name"
            type="text"
            value={registerName}
            onChange={(e) => { setRegisterName(e.target.value) }}
            disabled={submitting}
            placeholder="e.g. Cashier 1"
            className="min-h-[48px] px-4 py-2 rounded-xl bg-zinc-900 text-white border border-zinc-600 focus:border-indigo-500 focus:outline-none text-base disabled:opacity-50 placeholder-zinc-600"
          />
          <p className="text-xs text-zinc-500">
            Terminal identifier printed on each bill (e.g. &ldquo;Cashier 1&rdquo;, &ldquo;Front Desk&rdquo;).
          </p>
        </div>

        {/* Save button */}
        <div>
          <button
            onClick={() => { void handleSave() }}
            disabled={submitting || !restaurantId}
            className="min-h-[48px] px-6 py-2 rounded-xl bg-indigo-600 text-white text-base font-medium hover:bg-indigo-500 transition-colors disabled:opacity-50"
          >
            {submitting ? 'Saving…' : 'Save Settings'}
          </button>
        </div>
      </div>

      {/* Info box */}
      <div className="bg-zinc-800/60 border border-zinc-700 rounded-2xl p-5 text-sm text-zinc-400">
        <p className="font-semibold text-zinc-300 mb-2">Bill Number Sequence</p>
        <p>
          Bill numbers are auto-generated sequentially when an order is closed (e.g. <span className="font-mono text-zinc-200">RN0001234</span>).
          The counter is per-restaurant and cannot be reset here — contact support if needed.
        </p>
      </div>
    </div>
  )
}
