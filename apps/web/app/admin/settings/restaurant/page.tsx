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
import { useUser } from '@/lib/user-context'

type FeedbackType = 'success' | 'error'
interface Feedback {
  type: FeedbackType
  message: string
}

export default function RestaurantSettingsPage(): JSX.Element {
  const { accessToken: _at } = useUser(); const accessToken = _at ?? ''
  const [loading, setLoading] = useState(true)
  const [restaurantId, setRestaurantId] = useState<string>('')
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Form state
  const [restaurantName, setRestaurantName] = useState('')
  const [binNumber, setBinNumber] = useState('')
  const [registerName, setRegisterName] = useState('')
  const [restaurantAddress, setRestaurantAddress] = useState('')
  const [loyaltyPointsPerOrder, setLoyaltyPointsPerOrder] = useState('10')

  // Supabase config ref
  const supabaseConfig = useRef<{ url: string; key: string } | null>(null)

  useEffect(() => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!supabaseUrl || !accessToken) {
      setFetchError('API not configured')
      setLoading(false)
      return
    }
    supabaseConfig.current = { url: supabaseUrl, key: accessToken }

    // Fetch restaurant id then load config keys
    const headers = { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '', Authorization: `Bearer ${accessToken}` }
    fetch(`${supabaseUrl}/rest/v1/restaurants?select=id&limit=1`, { headers })
      .then((r) => r.json() as Promise<Array<{ id: string }>>)
      .then(async (rows) => {
        if (rows.length === 0) throw new Error('No restaurant found')
        const rid = rows[0].id
        setRestaurantId(rid)
        const [nameVal, binVal, regVal, addrVal, loyaltyVal] = await Promise.all([
          fetchConfigValue(supabaseUrl, accessToken, rid, 'restaurant_name', ''),
          fetchConfigValue(supabaseUrl, accessToken, rid, 'bin_number', ''),
          fetchConfigValue(supabaseUrl, accessToken, rid, 'register_name', ''),
          fetchConfigValue(supabaseUrl, accessToken, rid, 'restaurant_address', ''),
          fetchConfigValue(supabaseUrl, accessToken, rid, 'loyalty_points_per_order', '10'),
        ])
        setRestaurantName(nameVal)
        setBinNumber(binVal)
        setRegisterName(regVal)
        setRestaurantAddress(addrVal)
        setLoyaltyPointsPerOrder(loyaltyVal)
      })
      .catch((err: unknown) => {
        setFetchError(err instanceof Error ? err.message : 'Failed to load settings')
      })
      .finally(() => { setLoading(false) })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken])

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
      const loyaltyNum = parseInt(loyaltyPointsPerOrder, 10)
      if (isNaN(loyaltyNum) || loyaltyNum < 0) {
        showFeedback('error', 'Loyalty points per order must be a non-negative number.')
        setSubmitting(false)
        return
      }
      await Promise.all([
        restaurantName.trim()
          ? callUpsertConfig(config.url, config.key, restaurantId, 'restaurant_name', restaurantName.trim())
          : Promise.resolve(),
        binNumber.trim()
          ? callUpsertConfig(config.url, config.key, restaurantId, 'bin_number', binNumber.trim())
          : Promise.resolve(),
        registerName.trim()
          ? callUpsertConfig(config.url, config.key, restaurantId, 'register_name', registerName.trim())
          : Promise.resolve(),
        restaurantAddress.trim()
          ? callUpsertConfig(config.url, config.key, restaurantId, 'restaurant_address', restaurantAddress.trim())
          : Promise.resolve(),
        callUpsertConfig(config.url, config.key, restaurantId, 'loyalty_points_per_order', String(loyaltyNum)),
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
        <h1 className="text-2xl font-bold text-brand-navy font-heading">Restaurant Settings</h1>
        <p className="text-brand-navy/60 text-base">Loading…</p>
      </div>
    )
  }

  if (fetchError) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-bold text-brand-navy font-heading">Restaurant Settings</h1>
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
          className="flex items-center min-h-[48px] px-3 py-2 rounded-xl text-base font-medium text-brand-navy/60 hover:text-white hover:bg-brand-offwhite transition-colors"
        >
          ← Admin
        </Link>
        <h1 className="text-2xl font-bold text-brand-navy font-heading">Restaurant Settings</h1>
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
      <div className="bg-white border border-brand-grey rounded-2xl p-6 flex flex-col gap-6">
        <div>
          <h2 className="text-lg font-semibold text-brand-navy">Bill / Receipt Settings</h2>
          <p className="text-sm text-brand-navy/60 mt-1">
            These details appear on every printed bill and receipt.
          </p>
        </div>

        {/* Restaurant Name */}
        <div className="flex flex-col gap-1">
          <label htmlFor="restaurant-name" className="text-sm font-medium text-brand-navy/80">
            Restaurant Name
          </label>
          <input
            id="restaurant-name"
            type="text"
            value={restaurantName}
            onChange={(e) => { setRestaurantName(e.target.value) }}
            disabled={submitting}
            placeholder="e.g. Lahore by iKitchen"
            className="min-h-[48px] px-4 py-2 rounded-xl bg-brand-navy text-white border border-brand-grey focus:border-brand-blue focus:outline-none text-base disabled:opacity-50 placeholder-zinc-600"
          />
          <p className="text-xs text-brand-grey">Displayed as the header on printed bills and receipts.</p>
        </div>

        {/* Restaurant Address */}
        <div className="flex flex-col gap-1">
          <label htmlFor="restaurant-address" className="text-sm font-medium text-brand-navy/80">
            Restaurant Address
          </label>
          <input
            id="restaurant-address"
            type="text"
            value={restaurantAddress}
            onChange={(e) => { setRestaurantAddress(e.target.value) }}
            disabled={submitting}
            placeholder="e.g. 123 Main Street, Dhaka 1200"
            className="min-h-[48px] px-4 py-2 rounded-xl bg-brand-navy text-white border border-brand-grey focus:border-brand-blue focus:outline-none text-base disabled:opacity-50 placeholder-zinc-600"
          />
          <p className="text-xs text-brand-grey">Shown below restaurant name on the printed bill.</p>
        </div>

        {/* BIN Number */}
        <div className="flex flex-col gap-1">
          <label htmlFor="bin-number" className="text-sm font-medium text-brand-navy/80">
            BIN Number <span className="text-brand-grey font-normal">(VAT Registration)</span>
          </label>
          <input
            id="bin-number"
            type="text"
            value={binNumber}
            onChange={(e) => { setBinNumber(e.target.value) }}
            disabled={submitting}
            placeholder="e.g. 003206332-0101 -Musak6.3"
            className="min-h-[48px] px-4 py-2 rounded-xl bg-brand-navy text-white border border-brand-grey focus:border-brand-blue focus:outline-none text-base disabled:opacity-50 placeholder-zinc-600"
          />
          <p className="text-xs text-brand-grey">
            Your VAT / BIN registration number printed on every receipt. Leave blank to hide.
          </p>
        </div>

        {/* Register Name */}
        <div className="flex flex-col gap-1">
          <label htmlFor="register-name" className="text-sm font-medium text-brand-navy/80">
            Register / Terminal Name
          </label>
          <input
            id="register-name"
            type="text"
            value={registerName}
            onChange={(e) => { setRegisterName(e.target.value) }}
            disabled={submitting}
            placeholder="e.g. Cashier 1"
            className="min-h-[48px] px-4 py-2 rounded-xl bg-brand-navy text-white border border-brand-grey focus:border-brand-blue focus:outline-none text-base disabled:opacity-50 placeholder-zinc-600"
          />
          <p className="text-xs text-brand-grey">
            Terminal identifier printed on each bill (e.g. &ldquo;Cashier 1&rdquo;, &ldquo;Front Desk&rdquo;).
          </p>
        </div>

      </div>

      {/* Loyalty programme section */}
      <div className="bg-white border border-brand-grey rounded-2xl p-6 flex flex-col gap-6">
        <div>
          <h2 className="text-lg font-semibold text-brand-navy">Loyalty Programme</h2>
          <p className="text-sm text-brand-navy/60 mt-1">
            Configure how many loyalty points customers earn per completed order.
            Membership tiers: Regular (0–99 pts) → Silver (100–499 pts) → Gold (500+ pts).
          </p>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="loyalty-points" className="text-sm font-medium text-brand-navy/80">
            Points Per Order
          </label>
          <input
            id="loyalty-points"
            type="number"
            min="0"
            step="1"
            value={loyaltyPointsPerOrder}
            onChange={(e) => { setLoyaltyPointsPerOrder(e.target.value) }}
            disabled={submitting}
            placeholder="10"
            className="min-h-[48px] px-4 py-2 rounded-xl bg-brand-navy text-white border border-brand-grey focus:border-brand-blue focus:outline-none text-base disabled:opacity-50 placeholder-zinc-600 max-w-[160px]"
          />
          <p className="text-xs text-brand-grey">
            Customers earn this many points each time they pay for an order. Set to 0 to disable.
          </p>
        </div>
      </div>

      {/* Single save button for all settings */}
      <div>
        <button
          onClick={() => { void handleSave() }}
          disabled={submitting || !restaurantId}
          className="min-h-[48px] px-6 py-2 rounded-xl bg-brand-navy text-white text-base font-medium hover:bg-brand-blue transition-colors disabled:opacity-50"
        >
          {submitting ? 'Saving…' : 'Save Settings'}
        </button>
      </div>

      {/* Info box */}
      <div className="bg-white/60 border border-brand-grey rounded-2xl p-5 text-sm text-brand-navy/60">
        <p className="font-semibold text-brand-navy/80 mb-2">Bill Number Sequence</p>
        <p>
          Bill numbers are auto-generated sequentially when an order is closed (e.g. <span className="font-mono text-zinc-200">RN0001234</span>).
          The counter is per-restaurant and cannot be reset here — contact support if needed.
        </p>
      </div>
    </div>
  )
}
