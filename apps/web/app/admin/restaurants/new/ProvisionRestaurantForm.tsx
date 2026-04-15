'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import type { JSX } from 'react'
import { Eye, EyeOff, Zap, CheckCircle2 } from 'lucide-react'
import { callProvisionRestaurant } from '../restaurantAdminApi'
import { fetchIsSuperAdmin } from '../restaurantAdminData'
import { useUser } from '@/lib/user-context'

interface ProvisionRestaurantFormProps {
  variant?: 'admin' | 'public'
}

interface FormValues {
  name: string
  branchName: string
  ownerEmail: string
  ownerPassword: string
  currencyCode: string
  currencySymbol: string
  vatPercentage: string
  serviceChargePercentage: string
}

interface FormErrors {
  name?: string
  ownerEmail?: string
  ownerPassword?: string
}

const EMPTY_FORM: FormValues = {
  name: '',
  branchName: '',
  ownerEmail: '',
  ownerPassword: '',
  currencyCode: 'BDT',
  currencySymbol: '৳',
  vatPercentage: '0',
  serviceChargePercentage: '0',
}

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function validate(form: FormValues): FormErrors {
  const errors: FormErrors = {}

  if (!form.name.trim()) {
    errors.name = 'Restaurant name is required'
  } else if (form.name.trim().length < 2) {
    errors.name = 'Restaurant name must be at least 2 characters'
  }

  if (!form.ownerEmail.trim()) {
    errors.ownerEmail = 'Owner email is required'
  } else if (!validateEmail(form.ownerEmail)) {
    errors.ownerEmail = 'Please enter a valid email address'
  }

  if (!form.ownerPassword) {
    errors.ownerPassword = 'Owner password is required'
  } else if (form.ownerPassword.length < 8) {
    errors.ownerPassword = 'Password must be at least 8 characters'
  }

  return errors
}

const INPUT_CLASS =
  'w-full bg-zinc-900 border border-zinc-600 rounded-xl px-4 py-3 text-white placeholder-zinc-500 focus:border-indigo-500 focus:outline-none min-h-[48px]'

const LABEL_CLASS = 'text-sm font-medium text-zinc-300'

export default function ProvisionRestaurantForm({ variant = 'admin' }: ProvisionRestaurantFormProps): JSX.Element {
  const { accessToken: _at } = useUser(); const accessToken = _at ?? ''
  const [form, setForm] = useState<FormValues>(EMPTY_FORM)
  const [errors, setErrors] = useState<FormErrors>({})
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState<{ restaurantId: string; name: string } | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean | null>(variant === 'public' ? true : null)

  useEffect(() => {
    // In public variant, skip super-admin check — show form directly
    if (variant === 'public') return

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
        if (!supabaseUrl || !accessToken) return

    fetchIsSuperAdmin(supabaseUrl, accessToken)
      .then((val) => setIsSuperAdmin(val))
      .catch(() => setIsSuperAdmin(false))
  }, [accessToken, variant])

  function setField<K extends keyof FormValues>(key: K, value: FormValues[K]): void {
    setForm((f) => ({ ...f, [key]: value }))
    if (key in errors) {
      setErrors((e) => ({ ...e, [key]: undefined }))
    }
  }

  async function handleSubmit(): Promise<void> {
    const validationErrors = validate(form)
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors)
      return
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!supabaseUrl) {
      setSubmitError('Configuration error. Please refresh and try again.')
      return
    }

    setSubmitting(true)
    setSubmitError(null)

    try {
      const result = await callProvisionRestaurant(supabaseUrl, accessToken, {
        name: form.name.trim(),
        ownerEmail: form.ownerEmail.trim().toLowerCase(),
        ownerPassword: form.ownerPassword,
        branchName: form.branchName.trim() || undefined,
        currencyCode: form.currencyCode.trim() || 'BDT',
        currencySymbol: form.currencySymbol.trim() || '৳',
        vatPercentage: parseFloat(form.vatPercentage) || 0,
        serviceChargePercentage: parseFloat(form.serviceChargePercentage) || 0,
      })
      setSuccess({ restaurantId: result.restaurantId, name: form.name.trim() })
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to provision restaurant')
    } finally {
      setSubmitting(false)
    }
  }

  // — Loading while permission check runs (admin variant only) —
  if (isSuperAdmin === null) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-bold text-white">New Restaurant</h1>
        <p className="text-zinc-400">Checking permissions…</p>
      </div>
    )
  }

  // — Access denied (admin variant only) —
  if (!isSuperAdmin) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-bold text-white">New Restaurant</h1>
        <div className="bg-red-900/30 border border-red-700 text-red-300 rounded-xl px-4 py-3">
          <p className="font-medium">Access denied — super-admin only</p>
          <p className="text-sm mt-1 text-red-400">
            Only iKitchen super-admins can provision new restaurants.
          </p>
        </div>
        <Link href="/admin/restaurants" className="text-indigo-400 hover:underline text-sm">
          ← Back to Restaurants
        </Link>
      </div>
    )
  }

  // — Success state —
  if (success) {
    if (variant === 'public') {
      return (
        <div className="flex flex-col gap-6 max-w-2xl">
          <div className="bg-green-900/30 border border-green-700 text-green-300 rounded-xl px-4 py-3 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={20} className="text-green-400 shrink-0" aria-hidden="true" />
              <p className="font-medium text-green-200">
                Restaurant &ldquo;{success.name}&rdquo; has been set up!
              </p>
            </div>
            <p className="text-sm text-green-400">
              Your restaurant has been set up! You can now log in with the credentials you provided.
            </p>
            <Link
              href="/login"
              className="inline-flex items-center gap-1 text-sm font-medium text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              Go to login →
            </Link>
          </div>
        </div>
      )
    }

    return (
      <div className="flex flex-col gap-6 max-w-2xl">
        <div className="flex items-center gap-3">
          <Link href="/admin/restaurants" className="text-indigo-400 hover:text-indigo-300 text-sm transition-colors">
            ← Restaurants
          </Link>
          <span className="text-zinc-600">/</span>
          <h1 className="text-2xl font-bold text-white">New Restaurant</h1>
        </div>

        <div className="bg-green-900/30 border border-green-700 text-green-300 rounded-xl px-4 py-3 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={20} className="text-green-400 shrink-0" aria-hidden="true" />
            <p className="font-medium text-green-200">
              Restaurant &ldquo;{success.name}&rdquo; has been provisioned successfully!
            </p>
          </div>
          <p className="text-sm text-green-400">
            The owner account has been created. They can now log in with the credentials you set.
          </p>
          <Link
            href="/admin/restaurants"
            className="inline-flex items-center gap-1 text-sm font-medium text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            View restaurants →
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      {/* Header — admin variant only */}
      {variant === 'admin' && (
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
      )}

      {/* Super-admin badge — admin variant only */}
      {variant === 'admin' && (
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-purple-900/50 border border-purple-700 w-fit">
          <Zap size={14} className="text-purple-300" aria-hidden="true" />
          <span className="text-xs font-bold uppercase tracking-wider text-purple-300">
            Super Admin — Provisioning
          </span>
        </div>
      )}

      {/* Error banner */}
      {submitError && (
        <div
          role="alert"
          className="bg-red-900/30 border border-red-700 text-red-300 rounded-xl px-4 py-3"
        >
          {submitError}
        </div>
      )}

      {/* Form card */}
      <form
        onSubmit={(e) => { e.preventDefault(); void handleSubmit() }}
        className="bg-zinc-800 border border-zinc-700 rounded-2xl p-6 flex flex-col gap-5"
      >

        {/* Restaurant Name */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="r-name" className={LABEL_CLASS}>
            Restaurant name <span className="text-red-400">*</span>
          </label>
          <input
            id="r-name"
            type="text"
            value={form.name}
            onChange={(e) => setField('name', e.target.value)}
            disabled={submitting}
            className={INPUT_CLASS + (errors.name ? ' border-red-600' : '')}
            placeholder="e.g. Dhaka Kitchen"
          />
          {errors.name && <span className="text-sm text-red-400">{errors.name}</span>}
        </div>

        {/* Branch Name */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="r-branch" className={LABEL_CLASS}>
            Branch name
            <span className="ml-2 text-zinc-500 font-normal text-xs">(optional)</span>
          </label>
          <input
            id="r-branch"
            type="text"
            value={form.branchName}
            onChange={(e) => setField('branchName', e.target.value)}
            disabled={submitting}
            className={INPUT_CLASS}
            placeholder="e.g. Gulshan, Dhanmondi"
          />
        </div>

        {/* Owner Email */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="r-owner-email" className={LABEL_CLASS}>
            Owner email <span className="text-red-400">*</span>
          </label>
          <input
            id="r-owner-email"
            type="email"
            value={form.ownerEmail}
            onChange={(e) => setField('ownerEmail', e.target.value)}
            disabled={submitting}
            className={INPUT_CLASS + (errors.ownerEmail ? ' border-red-600' : '')}
            placeholder="owner@restaurant.com"
          />
          {errors.ownerEmail && <span className="text-sm text-red-400">{errors.ownerEmail}</span>}
        </div>

        {/* Owner Password */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="r-owner-password" className={LABEL_CLASS}>
            Owner password <span className="text-red-400">*</span>
          </label>
          <div className="relative">
            <input
              id="r-owner-password"
              type={showPassword ? 'text' : 'password'}
              value={form.ownerPassword}
              onChange={(e) => setField('ownerPassword', e.target.value)}
              disabled={submitting}
              className={INPUT_CLASS + ' pr-12' + (errors.ownerPassword ? ' border-red-600' : '')}
              placeholder="Min. 8 characters"
              autoComplete="new-password"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200 transition-colors"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {errors.ownerPassword && (
            <span className="text-sm text-red-400">{errors.ownerPassword}</span>
          )}
          <p className="text-xs text-zinc-500">
            The owner can change this password after logging in.
          </p>
        </div>

        {/* Currency Code + Symbol — side by side */}
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="r-currency-code" className={LABEL_CLASS}>
              Currency code
              <span className="ml-2 text-zinc-500 font-normal text-xs">(optional)</span>
            </label>
            <input
              id="r-currency-code"
              type="text"
              value={form.currencyCode}
              onChange={(e) => setField('currencyCode', e.target.value.toUpperCase())}
              disabled={submitting}
              className={INPUT_CLASS}
              placeholder="BDT"
              maxLength={10}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="r-currency-symbol" className={LABEL_CLASS}>
              Currency symbol
              <span className="ml-2 text-zinc-500 font-normal text-xs">(optional)</span>
            </label>
            <input
              id="r-currency-symbol"
              type="text"
              value={form.currencySymbol}
              onChange={(e) => setField('currencySymbol', e.target.value)}
              disabled={submitting}
              className={INPUT_CLASS}
              placeholder="৳"
              maxLength={8}
            />
          </div>
        </div>

        {/* VAT % + Service Charge % — side by side */}
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="r-vat" className={LABEL_CLASS}>
              VAT %
              <span className="ml-2 text-zinc-500 font-normal text-xs">(optional)</span>
            </label>
            <input
              id="r-vat"
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={form.vatPercentage}
              onChange={(e) => setField('vatPercentage', e.target.value)}
              disabled={submitting}
              className={INPUT_CLASS}
              placeholder="0"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="r-service-charge" className={LABEL_CLASS}>
              Service charge %
              <span className="ml-2 text-zinc-500 font-normal text-xs">(optional)</span>
            </label>
            <input
              id="r-service-charge"
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={form.serviceChargePercentage}
              onChange={(e) => setField('serviceChargePercentage', e.target.value)}
              disabled={submitting}
              className={INPUT_CLASS}
              placeholder="0"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={submitting}
            className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl min-h-[48px] px-6 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Provisioning…' : 'Provision Restaurant'}
          </button>
          <Link
            href={variant === 'public' ? '/login' : '/admin/restaurants'}
            className="min-h-[48px] px-5 rounded-xl bg-zinc-700 text-white font-medium hover:bg-zinc-600 transition-colors flex items-center"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}
