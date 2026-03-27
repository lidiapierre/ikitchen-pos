'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { JSX } from 'react'
import { callProvisionRestaurant } from '../restaurantAdminApi'
import { fetchIsSuperAdmin } from '../restaurantAdminData'
import { useUser } from '@/lib/user-context'
import { Zap, CheckCircle2 } from 'lucide-react'

interface FormValues {
  name: string
  slug: string
  timezone: string
  currency: string
  ownerEmail: string
}

interface FormErrors {
  name?: string
  slug?: string
  timezone?: string
  currency?: string
  ownerEmail?: string
}

const EMPTY_FORM: FormValues = {
  name: '',
  slug: '',
  timezone: 'Asia/Dhaka',
  currency: 'BDT',
  ownerEmail: '',
}

const COMMON_TIMEZONES = [
  'Asia/Dhaka',
  'Asia/Kolkata',
  'Asia/Karachi',
  'Asia/Dubai',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Europe/London',
  'Europe/Paris',
  'America/New_York',
  'America/Los_Angeles',
  'UTC',
]

const CURRENCY_OPTIONS = [
  { code: 'BDT', label: 'BDT — Bangladeshi Taka (৳)' },
  { code: 'INR', label: 'INR — Indian Rupee (₹)' },
  { code: 'USD', label: 'USD — US Dollar ($)' },
  { code: 'EUR', label: 'EUR — Euro (€)' },
  { code: 'GBP', label: 'GBP — British Pound (£)' },
  { code: 'SGD', label: 'SGD — Singapore Dollar (S$)' },
  { code: 'AED', label: 'AED — UAE Dirham (د.إ)' },
]

/** Auto-generate a slug from a restaurant name */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 48)
}

function validate(form: FormValues): FormErrors {
  const errors: FormErrors = {}
  if (!form.name.trim()) errors.name = 'Restaurant name is required'
  if (!form.slug.trim()) {
    errors.slug = 'Slug is required'
  } else if (!/^[a-z0-9-]+$/.test(form.slug)) {
    errors.slug = 'Slug must be lowercase letters, numbers, and hyphens only'
  }
  if (!form.timezone.trim()) errors.timezone = 'Timezone is required'
  if (!form.currency.trim()) errors.currency = 'Currency is required'
  if (!form.ownerEmail.trim() || !form.ownerEmail.includes('@')) {
    errors.ownerEmail = 'A valid owner email is required'
  }
  return errors
}

export default function ProvisionRestaurantForm(): JSX.Element {
  const router = useRouter()
  const { accessToken } = useUser()
  const [form, setForm] = useState<FormValues>(EMPTY_FORM)
  const [errors, setErrors] = useState<FormErrors>({})
  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean | null>(null)
  const slugAutoRef = useRef(true) // track whether slug was auto-generated

  useEffect(() => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    if (!supabaseUrl || !supabaseKey || !accessToken) return

    fetchIsSuperAdmin(supabaseUrl, supabaseKey, accessToken)
      .then((val) => setIsSuperAdmin(val))
      .catch(() => setIsSuperAdmin(false))
  }, [accessToken])

  function handleNameChange(value: string): void {
    const updated = { ...form, name: value }
    // Auto-fill slug when it hasn't been manually edited
    if (slugAutoRef.current) {
      updated.slug = slugify(value)
    }
    setForm(updated)
    setErrors((e) => ({ ...e, name: undefined, slug: slugAutoRef.current ? undefined : e.slug }))
  }

  function handleSlugChange(value: string): void {
    slugAutoRef.current = false // user took manual control
    setForm((f) => ({ ...f, slug: value }))
    setErrors((e) => ({ ...e, slug: undefined }))
  }

  async function handleSubmit(): Promise<void> {
    const validationErrors = validate(form)
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors)
      return
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!supabaseUrl || !accessToken) {
      setFeedback({ type: 'error', message: 'Not authenticated. Please refresh.' })
      return
    }

    setSubmitting(true)
    setFeedback(null)
    try {
      const result = await callProvisionRestaurant(supabaseUrl, accessToken, {
        name: form.name.trim(),
        slug: form.slug.trim(),
        timezone: form.timezone,
        currency: form.currency,
        ownerEmail: form.ownerEmail.trim().toLowerCase(),
      })
      setFeedback({
        type: 'success',
        message: `Restaurant "${result.restaurant.name}" provisioned! Owner invite sent to ${result.owner_email}.`,
      })
      // Navigate back to the list after a short delay
      setTimeout(() => router.push('/admin/restaurants'), 2000)
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to provision restaurant',
      })
    } finally {
      setSubmitting(false)
    }
  }

  // Loading state while super-admin check resolves
  if (isSuperAdmin === null) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-bold text-white">New Restaurant</h1>
        <p className="text-zinc-400">Checking permissions…</p>
      </div>
    )
  }

  if (!isSuperAdmin) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-bold text-white">New Restaurant</h1>
        <div className="bg-red-900/40 border border-red-700 rounded-2xl p-6">
          <p className="text-red-200 text-base font-medium">Access Denied</p>
          <p className="text-red-300 text-sm mt-1">
            Only iKitchen super-admins can provision new restaurants.
          </p>
        </div>
        <Link href="/admin/restaurants" className="text-indigo-400 hover:underline text-sm">
          ← Back to Restaurants
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/admin/restaurants"
          className="text-indigo-400 hover:text-indigo-300 transition-colors text-sm"
        >
          ← Restaurants
        </Link>
        <span className="text-zinc-600">/</span>
        <h1 className="text-2xl font-bold text-white">New Restaurant</h1>
      </div>

      {/* Super-admin badge */}
      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-purple-900/50 border border-purple-700 w-fit">
        <Zap size={14} className="text-purple-300" aria-hidden="true" />
        <span className="text-xs font-bold uppercase tracking-wider text-purple-300">
          Super Admin — Provisioning
        </span>
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

      {/* Form */}
      <div className="bg-zinc-800 border border-zinc-700 rounded-2xl p-6 flex flex-col gap-5">
        {/* Restaurant Name */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="r-name" className="text-sm font-medium text-zinc-300">
            Restaurant Name <span className="text-red-400">*</span>
          </label>
          <input
            id="r-name"
            type="text"
            value={form.name}
            onChange={(e) => handleNameChange(e.target.value)}
            disabled={submitting}
            className="min-h-[48px] px-4 py-2 rounded-xl bg-zinc-900 text-white border border-zinc-600 focus:border-indigo-500 focus:outline-none text-base disabled:opacity-50"
            placeholder="e.g. Dhaka Kitchen"
          />
          {errors.name && <span className="text-sm text-red-400">{errors.name}</span>}
        </div>

        {/* Slug */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="r-slug" className="text-sm font-medium text-zinc-300">
            Slug <span className="text-red-400">*</span>
            <span className="ml-2 text-zinc-500 font-normal text-xs">(URL-safe identifier)</span>
          </label>
          <div className="flex items-center">
            <span className="px-3 py-2 min-h-[48px] flex items-center bg-zinc-700 text-zinc-400 border border-r-0 border-zinc-600 rounded-l-xl text-sm">
              /
            </span>
            <input
              id="r-slug"
              type="text"
              value={form.slug}
              onChange={(e) => handleSlugChange(e.target.value)}
              disabled={submitting}
              className="flex-1 min-h-[48px] px-4 py-2 rounded-r-xl bg-zinc-900 text-white border border-zinc-600 focus:border-indigo-500 focus:outline-none text-base font-mono disabled:opacity-50"
              placeholder="dhaka-kitchen"
            />
          </div>
          {errors.slug && <span className="text-sm text-red-400">{errors.slug}</span>}
          <p className="text-xs text-zinc-500">Lowercase letters, numbers, and hyphens only. Auto-filled from name.</p>
        </div>

        {/* Timezone */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="r-timezone" className="text-sm font-medium text-zinc-300">
            Timezone <span className="text-red-400">*</span>
          </label>
          <select
            id="r-timezone"
            value={form.timezone}
            onChange={(e) => {
              setForm((f) => ({ ...f, timezone: e.target.value }))
              setErrors((err) => ({ ...err, timezone: undefined }))
            }}
            disabled={submitting}
            className="min-h-[48px] px-4 py-2 rounded-xl bg-zinc-900 text-white border border-zinc-600 focus:border-indigo-500 focus:outline-none text-base disabled:opacity-50"
          >
            {COMMON_TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
          {errors.timezone && <span className="text-sm text-red-400">{errors.timezone}</span>}
        </div>

        {/* Currency */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="r-currency" className="text-sm font-medium text-zinc-300">
            Currency <span className="text-red-400">*</span>
          </label>
          <select
            id="r-currency"
            value={form.currency}
            onChange={(e) => {
              setForm((f) => ({ ...f, currency: e.target.value }))
              setErrors((err) => ({ ...err, currency: undefined }))
            }}
            disabled={submitting}
            className="min-h-[48px] px-4 py-2 rounded-xl bg-zinc-900 text-white border border-zinc-600 focus:border-indigo-500 focus:outline-none text-base disabled:opacity-50"
          >
            {CURRENCY_OPTIONS.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </select>
          {errors.currency && <span className="text-sm text-red-400">{errors.currency}</span>}
        </div>

        {/* Owner Email */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="r-owner-email" className="text-sm font-medium text-zinc-300">
            Owner Email <span className="text-red-400">*</span>
          </label>
          <input
            id="r-owner-email"
            type="email"
            value={form.ownerEmail}
            onChange={(e) => {
              setForm((f) => ({ ...f, ownerEmail: e.target.value }))
              setErrors((err) => ({ ...err, ownerEmail: undefined }))
            }}
            disabled={submitting}
            className="min-h-[48px] px-4 py-2 rounded-xl bg-zinc-900 text-white border border-zinc-600 focus:border-indigo-500 focus:outline-none text-base disabled:opacity-50"
            placeholder="owner@restaurant.com"
          />
          {errors.ownerEmail && <span className="text-sm text-red-400">{errors.ownerEmail}</span>}
          <p className="text-xs text-zinc-500">
            An invite email will be sent to this address. The owner will set their own password.
          </p>
        </div>

        {/* Default config note */}
        <div className="bg-zinc-900/60 border border-zinc-700 rounded-xl p-4 text-sm text-zinc-400">
          <p className="font-medium text-zinc-300 mb-1">Default config seeded automatically:</p>
          <ul className="list-disc list-inside space-y-0.5">
            <li>Currency: {form.currency || 'BDT'}</li>
            <li>VAT: 0%</li>
            <li>Service charge: 0%</li>
          </ul>
          <p className="mt-2 text-xs text-zinc-500">
            The owner can update these in the Pricing admin after logging in.
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <button
            onClick={() => { void handleSubmit() }}
            disabled={submitting}
            className="min-h-[48px] px-6 py-2 rounded-xl bg-indigo-600 text-white text-base font-medium hover:bg-indigo-500 transition-colors disabled:opacity-50"
          >
            {submitting ? 'Provisioning…' : 'Provision Restaurant'}
          </button>
          <Link
            href="/admin/restaurants"
            className="min-h-[48px] px-5 py-2 rounded-xl bg-zinc-700 text-white text-base font-medium hover:bg-zinc-600 transition-colors flex items-center"
          >
            Cancel
          </Link>
        </div>
      </div>
    </div>
  )
}
