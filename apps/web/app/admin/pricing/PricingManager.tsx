'use client'

import { useState, useEffect, useRef } from 'react'
import type { JSX } from 'react'
import Link from 'next/link'
import { fetchPricingAdminData } from './pricingAdminData'
import type { VatRate, PricingCategory, PricingMenuItem } from './pricingAdminData'
import {
  callCreateVatRate,
  callUpdateVatRate,
  callDeleteVatRate,
  callUpdateItemPrice,
  callUpsertConfig,
} from './pricingAdminApi'

interface VatRateForm {
  label: string
  percentage: string
  menuId: string
}

interface VatRateFormErrors {
  label?: string
  percentage?: string
}

interface ItemEditForm {
  price: string
  vatRateId: string
}

interface ItemEditFormErrors {
  price?: string
}

type FeedbackType = 'success' | 'error'

interface Feedback {
  type: FeedbackType
  message: string
}

const EMPTY_VAT_RATE_FORM: VatRateForm = { label: '', percentage: '', menuId: '' }

export function formatCurrency(priceCents: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(
    priceCents / 100,
  )
}

export function computePreviewCents(
  baseCents: number,
  percentage: number,
  taxInclusive: boolean,
): number {
  if (taxInclusive) return baseCents
  return Math.round(baseCents * (1 + percentage / 100))
}

function validateVatRateForm(form: VatRateForm): VatRateFormErrors {
  const errors: VatRateFormErrors = {}
  if (!form.label.trim()) errors.label = 'Label is required'
  if (!form.percentage.trim()) {
    errors.percentage = 'Percentage is required'
  } else {
    const val = parseFloat(form.percentage)
    if (isNaN(val) || val < 0 || val > 100) {
      errors.percentage = 'Enter a valid percentage (0–100)'
    }
  }
  return errors
}

export default function PricingManager(): JSX.Element {
  const [restaurantId, setRestaurantId] = useState<string>('')
  const [vatRates, setVatRates] = useState<VatRate[]>([])
  const [categories, setCategories] = useState<PricingCategory[]>([])
  const [taxInclusive, setTaxInclusive] = useState<boolean>(false)
  const [loading, setLoading] = useState<boolean>(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState<boolean>(false)

  const supabaseConfig = useRef<{ url: string; key: string } | null>(null)

  const [showAddVatRate, setShowAddVatRate] = useState<boolean>(false)
  const [addForm, setAddForm] = useState<VatRateForm>(EMPTY_VAT_RATE_FORM)
  const [addFormErrors, setAddFormErrors] = useState<VatRateFormErrors>({})

  const [editingVatRateId, setEditingVatRateId] = useState<string | null>(null)
  const [editVatRateForm, setEditVatRateForm] = useState<VatRateForm>(EMPTY_VAT_RATE_FORM)
  const [editVatRateFormErrors, setEditVatRateFormErrors] = useState<VatRateFormErrors>({})

  const [deletingVatRateId, setDeletingVatRateId] = useState<string | null>(null)

  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editingItemCategoryId, setEditingItemCategoryId] = useState<string | null>(null)
  const [editItemForm, setEditItemForm] = useState<ItemEditForm>({ price: '', vatRateId: '' })
  const [editItemFormErrors, setEditItemFormErrors] = useState<ItemEditFormErrors>({})

  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    if (!supabaseUrl || !supabaseKey) {
      setFetchError('API not configured')
      setLoading(false)
      return
    }
    supabaseConfig.current = { url: supabaseUrl, key: supabaseKey }

    fetchPricingAdminData(supabaseUrl, supabaseKey)
      .then((data) => {
        setRestaurantId(data.restaurantId)
        setVatRates(data.vatRates)
        setCategories(data.categories)
        setTaxInclusive(data.taxInclusive)
      })
      .catch((err: unknown) => {
        setFetchError(err instanceof Error ? err.message : 'Failed to load pricing data')
      })
      .finally(() => {
        setLoading(false)
      })
  }, [])

  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current)
    }
  }, [])

  function showFeedback(type: FeedbackType, message: string): void {
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current)
    setFeedback({ type, message })
    feedbackTimerRef.current = setTimeout(() => setFeedback(null), 3000)
  }

  function getVatRateForCategory(categoryId: string): VatRate | null {
    return vatRates.find((r) => r.menu_id === categoryId) ?? null
  }

  function canDeleteVatRate(rate: VatRate): boolean {
    if (rate.menu_id === null) return true
    const category = categories.find((c) => c.id === rate.menu_id)
    if (!category) return true
    return category.items.length === 0
  }

  async function handleToggleTaxInclusive(): Promise<void> {
    const config = supabaseConfig.current
    if (!config || !restaurantId) return
    const newValue = !taxInclusive
    setSubmitting(true)
    try {
      await callUpsertConfig(config.url, config.key, restaurantId, 'tax_inclusive', String(newValue))
      setTaxInclusive(newValue)
      showFeedback(
        'success',
        `Tax mode set to ${newValue ? 'tax-inclusive' : 'tax-exclusive'}.`,
      )
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : 'Failed to update tax mode.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleAddVatRate(): Promise<void> {
    const errors = validateVatRateForm(addForm)
    if (Object.keys(errors).length > 0) {
      setAddFormErrors(errors)
      return
    }
    const config = supabaseConfig.current
    if (!config) return
    setSubmitting(true)
    try {
      const percentage = parseFloat(addForm.percentage)
      const menuId = addForm.menuId || null
      const id = await callCreateVatRate(
        config.url,
        config.key,
        restaurantId,
        addForm.label.trim(),
        percentage,
        menuId,
      )
      const newRate: VatRate = {
        id,
        restaurant_id: restaurantId,
        label: addForm.label.trim(),
        percentage,
        menu_id: menuId,
      }
      let updatedRates = [...vatRates]
      if (menuId !== null) {
        updatedRates = updatedRates.map((r) =>
          r.menu_id === menuId ? { ...r, menu_id: null } : r,
        )
      }
      setVatRates([...updatedRates, newRate])
      setAddForm(EMPTY_VAT_RATE_FORM)
      setAddFormErrors({})
      setShowAddVatRate(false)
      showFeedback('success', `VAT rate "${newRate.label}" added.`)
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : 'Failed to add VAT rate.')
    } finally {
      setSubmitting(false)
    }
  }

  function handleStartEditVatRate(rate: VatRate): void {
    setEditingVatRateId(rate.id)
    setEditVatRateForm({
      label: rate.label,
      percentage: String(rate.percentage),
      menuId: rate.menu_id ?? '',
    })
    setEditVatRateFormErrors({})
    setShowAddVatRate(false)
    setDeletingVatRateId(null)
  }

  async function handleSaveEditVatRate(): Promise<void> {
    if (!editingVatRateId) return
    const errors = validateVatRateForm(editVatRateForm)
    if (Object.keys(errors).length > 0) {
      setEditVatRateFormErrors(errors)
      return
    }
    const config = supabaseConfig.current
    if (!config) return
    setSubmitting(true)
    try {
      const percentage = parseFloat(editVatRateForm.percentage)
      const menuId = editVatRateForm.menuId || null
      await callUpdateVatRate(
        config.url,
        config.key,
        editingVatRateId,
        editVatRateForm.label.trim(),
        percentage,
        menuId,
      )
      setVatRates((prev) =>
        prev.map((r) => {
          if (r.id === editingVatRateId) {
            return { ...r, label: editVatRateForm.label.trim(), percentage, menu_id: menuId }
          }
          if (menuId !== null && r.menu_id === menuId && r.id !== editingVatRateId) {
            return { ...r, menu_id: null }
          }
          return r
        }),
      )
      setEditingVatRateId(null)
      setEditVatRateForm(EMPTY_VAT_RATE_FORM)
      setEditVatRateFormErrors({})
      showFeedback('success', 'VAT rate updated.')
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : 'Failed to update VAT rate.')
    } finally {
      setSubmitting(false)
    }
  }

  function handleCancelEditVatRate(): void {
    setEditingVatRateId(null)
    setEditVatRateForm(EMPTY_VAT_RATE_FORM)
    setEditVatRateFormErrors({})
  }

  async function handleDeleteVatRate(): Promise<void> {
    if (!deletingVatRateId) return
    const config = supabaseConfig.current
    if (!config) return
    const rate = vatRates.find((r) => r.id === deletingVatRateId)
    setSubmitting(true)
    try {
      await callDeleteVatRate(config.url, config.key, deletingVatRateId)
      setVatRates((prev) => prev.filter((r) => r.id !== deletingVatRateId))
      setDeletingVatRateId(null)
      showFeedback(
        'success',
        rate ? `VAT rate "${rate.label}" deleted.` : 'VAT rate deleted.',
      )
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : 'Failed to delete VAT rate.')
      setDeletingVatRateId(null)
    } finally {
      setSubmitting(false)
    }
  }

  function handleStartEditItem(item: PricingMenuItem, categoryId: string): void {
    const assignedRate = getVatRateForCategory(categoryId)
    setEditingItemId(item.id)
    setEditingItemCategoryId(categoryId)
    setEditItemForm({
      price: (item.price_cents / 100).toFixed(2),
      vatRateId: assignedRate?.id ?? '',
    })
    setEditItemFormErrors({})
    setShowAddVatRate(false)
    setEditingVatRateId(null)
  }

  async function handleSaveEditItem(): Promise<void> {
    if (!editingItemId || !editingItemCategoryId) return
    const priceStr = editItemForm.price.trim()
    if (!priceStr || isNaN(parseFloat(priceStr)) || parseFloat(priceStr) < 0) {
      setEditItemFormErrors({ price: 'Enter a valid price' })
      return
    }
    const config = supabaseConfig.current
    if (!config) return
    setSubmitting(true)
    try {
      const priceCents = Math.round(parseFloat(priceStr) * 100)
      await callUpdateItemPrice(config.url, config.key, editingItemId, priceCents)

      const currentRate = getVatRateForCategory(editingItemCategoryId)
      const newRateId = editItemForm.vatRateId || null

      if (newRateId !== (currentRate?.id ?? null)) {
        if (currentRate) {
          await callUpdateVatRate(
            config.url,
            config.key,
            currentRate.id,
            currentRate.label,
            currentRate.percentage,
            null,
          )
        }
        if (newRateId) {
          const newRate = vatRates.find((r) => r.id === newRateId)
          if (newRate) {
            await callUpdateVatRate(
              config.url,
              config.key,
              newRateId,
              newRate.label,
              newRate.percentage,
              editingItemCategoryId,
            )
          }
        }
        setVatRates((prev) =>
          prev.map((r) => {
            if (r.id === currentRate?.id) return { ...r, menu_id: null }
            if (r.id === newRateId) return { ...r, menu_id: editingItemCategoryId }
            return r
          }),
        )
      }

      setCategories((prev) =>
        prev.map((cat) => ({
          ...cat,
          items: cat.items.map((item) =>
            item.id === editingItemId ? { ...item, price_cents: priceCents } : item,
          ),
        })),
      )

      setEditingItemId(null)
      setEditingItemCategoryId(null)
      setEditItemForm({ price: '', vatRateId: '' })
      setEditItemFormErrors({})
      showFeedback('success', 'Item pricing updated.')
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : 'Failed to update item pricing.')
    } finally {
      setSubmitting(false)
    }
  }

  function handleCancelEditItem(): void {
    setEditingItemId(null)
    setEditingItemCategoryId(null)
    setEditItemForm({ price: '', vatRateId: '' })
    setEditItemFormErrors({})
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-bold text-white">Pricing &amp; VAT</h1>
        <p className="text-zinc-400 text-base">Loading pricing data…</p>
      </div>
    )
  }

  if (fetchError !== null) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-bold text-white">Pricing &amp; VAT</h1>
        <p className="text-red-400 text-base">Unable to load pricing data. Please try again.</p>
        <p className="text-red-300 text-sm font-mono">{fetchError}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Page header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/admin"
            className="flex items-center min-h-[48px] px-3 py-2 rounded-xl text-base font-medium text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors"
          >
            ← Admin
          </Link>
          <h1 className="text-2xl font-bold text-white">Pricing &amp; VAT</h1>
        </div>
        <button
          onClick={() => {
            setShowAddVatRate((v) => !v)
            setEditingVatRateId(null)
            setEditVatRateForm(EMPTY_VAT_RATE_FORM)
            setEditVatRateFormErrors({})
          }}
          disabled={submitting}
          className="min-h-[48px] px-5 py-2 rounded-xl text-base font-medium bg-indigo-600 text-white hover:bg-indigo-500 transition-colors disabled:opacity-50"
        >
          + Add VAT Rate
        </button>
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

      {/* Tax mode toggle */}
      <div className="bg-zinc-800 border border-zinc-700 rounded-2xl p-5 flex items-center justify-between gap-4">
        <div>
          <p className="text-base font-semibold text-white">Pricing display mode</p>
          <p className="text-sm text-zinc-400 mt-1">
            {taxInclusive
              ? 'Tax-inclusive: prices shown already include VAT'
              : 'Tax-exclusive: VAT is added on top of the base price'}
          </p>
        </div>
        <button
          onClick={() => { void handleToggleTaxInclusive() }}
          disabled={submitting || !restaurantId}
          aria-pressed={taxInclusive}
          className={[
            'min-h-[48px] px-6 py-2 rounded-xl text-base font-medium transition-colors shrink-0 disabled:opacity-50',
            taxInclusive
              ? 'bg-indigo-600 text-white hover:bg-indigo-500'
              : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600',
          ].join(' ')}
        >
          {taxInclusive ? 'Tax-inclusive' : 'Tax-exclusive'}
        </button>
      </div>

      {/* Add VAT Rate inline form */}
      {showAddVatRate && (
        <div className="bg-zinc-800 border border-indigo-600 rounded-2xl p-5 flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-white">New VAT Rate</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="flex flex-col gap-1">
              <label htmlFor="add-vat-label" className="text-sm font-medium text-zinc-300">
                Label <span className="text-red-400">*</span>
              </label>
              <input
                id="add-vat-label"
                type="text"
                value={addForm.label}
                onChange={(e) => {
                  setAddForm((f) => ({ ...f, label: e.target.value }))
                  setAddFormErrors((e2) => ({ ...e2, label: undefined }))
                }}
                className="min-h-[48px] px-4 py-2 rounded-xl bg-zinc-900 text-white border border-zinc-600 focus:border-indigo-500 focus:outline-none text-base"
                placeholder="e.g. Standard 20%"
              />
              {addFormErrors.label && (
                <span className="text-sm text-red-400">{addFormErrors.label}</span>
              )}
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="add-vat-percentage" className="text-sm font-medium text-zinc-300">
                Percentage (%) <span className="text-red-400">*</span>
              </label>
              <input
                id="add-vat-percentage"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                max="100"
                value={addForm.percentage}
                onChange={(e) => {
                  setAddForm((f) => ({ ...f, percentage: e.target.value }))
                  setAddFormErrors((e2) => ({ ...e2, percentage: undefined }))
                }}
                className="min-h-[48px] px-4 py-2 rounded-xl bg-zinc-900 text-white border border-zinc-600 focus:border-indigo-500 focus:outline-none text-base"
                placeholder="20"
              />
              {addFormErrors.percentage && (
                <span className="text-sm text-red-400">{addFormErrors.percentage}</span>
              )}
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="add-vat-category" className="text-sm font-medium text-zinc-300">
                Applies to category
              </label>
              <select
                id="add-vat-category"
                value={addForm.menuId}
                onChange={(e) => setAddForm((f) => ({ ...f, menuId: e.target.value }))}
                className="min-h-[48px] px-4 py-2 rounded-xl bg-zinc-900 text-white border border-zinc-600 focus:border-indigo-500 focus:outline-none text-base"
              >
                <option value="">None</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => { void handleAddVatRate() }}
              disabled={submitting}
              className="min-h-[48px] px-5 py-2 rounded-xl bg-indigo-600 text-white text-base font-medium hover:bg-indigo-500 transition-colors disabled:opacity-50"
            >
              Save VAT Rate
            </button>
            <button
              onClick={() => {
                setShowAddVatRate(false)
                setAddForm(EMPTY_VAT_RATE_FORM)
                setAddFormErrors({})
              }}
              className="min-h-[48px] px-5 py-2 rounded-xl bg-zinc-700 text-white text-base font-medium hover:bg-zinc-600 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* VAT Rates section */}
      <section>
        <h2 className="text-lg font-semibold text-zinc-300 uppercase tracking-wide mb-3">
          VAT Rates
        </h2>
        {vatRates.length === 0 ? (
          <p className="text-zinc-500 text-base px-2">
            No VAT rates defined. Use &ldquo;+ Add VAT Rate&rdquo; to create one.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {vatRates.map((rate) => {
              const isEditing = editingVatRateId === rate.id
              const isDeleting = deletingVatRateId === rate.id
              const deletable = canDeleteVatRate(rate)
              const assignedCategory = categories.find((c) => c.id === rate.menu_id)

              if (isEditing) {
                return (
                  <div
                    key={rate.id}
                    className="bg-zinc-800 border border-indigo-500 rounded-2xl p-4 flex flex-col gap-4"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="flex flex-col gap-1">
                        <label
                          htmlFor={`edit-vat-label-${rate.id}`}
                          className="text-sm font-medium text-zinc-300"
                        >
                          Label <span className="text-red-400">*</span>
                        </label>
                        <input
                          id={`edit-vat-label-${rate.id}`}
                          type="text"
                          value={editVatRateForm.label}
                          onChange={(e) => {
                            setEditVatRateForm((f) => ({ ...f, label: e.target.value }))
                            setEditVatRateFormErrors((e2) => ({ ...e2, label: undefined }))
                          }}
                          className="min-h-[48px] px-4 py-2 rounded-xl bg-zinc-900 text-white border border-zinc-600 focus:border-indigo-500 focus:outline-none text-base"
                        />
                        {editVatRateFormErrors.label && (
                          <span className="text-sm text-red-400">{editVatRateFormErrors.label}</span>
                        )}
                      </div>
                      <div className="flex flex-col gap-1">
                        <label
                          htmlFor={`edit-vat-pct-${rate.id}`}
                          className="text-sm font-medium text-zinc-300"
                        >
                          Percentage (%) <span className="text-red-400">*</span>
                        </label>
                        <input
                          id={`edit-vat-pct-${rate.id}`}
                          type="number"
                          inputMode="decimal"
                          step="0.01"
                          min="0"
                          max="100"
                          value={editVatRateForm.percentage}
                          onChange={(e) => {
                            setEditVatRateForm((f) => ({ ...f, percentage: e.target.value }))
                            setEditVatRateFormErrors((e2) => ({ ...e2, percentage: undefined }))
                          }}
                          className="min-h-[48px] px-4 py-2 rounded-xl bg-zinc-900 text-white border border-zinc-600 focus:border-indigo-500 focus:outline-none text-base"
                        />
                        {editVatRateFormErrors.percentage && (
                          <span className="text-sm text-red-400">
                            {editVatRateFormErrors.percentage}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-col gap-1">
                        <label
                          htmlFor={`edit-vat-cat-${rate.id}`}
                          className="text-sm font-medium text-zinc-300"
                        >
                          Applies to category
                        </label>
                        <select
                          id={`edit-vat-cat-${rate.id}`}
                          value={editVatRateForm.menuId}
                          onChange={(e) =>
                            setEditVatRateForm((f) => ({ ...f, menuId: e.target.value }))
                          }
                          className="min-h-[48px] px-4 py-2 rounded-xl bg-zinc-900 text-white border border-zinc-600 focus:border-indigo-500 focus:outline-none text-base"
                        >
                          <option value="">None</option>
                          {categories.map((cat) => (
                            <option key={cat.id} value={cat.id}>
                              {cat.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <button
                        onClick={() => { void handleSaveEditVatRate() }}
                        disabled={submitting}
                        className="min-h-[48px] px-5 py-2 rounded-xl bg-indigo-600 text-white text-base font-medium hover:bg-indigo-500 transition-colors disabled:opacity-50"
                      >
                        Save Changes
                      </button>
                      <button
                        onClick={handleCancelEditVatRate}
                        className="min-h-[48px] px-5 py-2 rounded-xl bg-zinc-700 text-white text-base font-medium hover:bg-zinc-600 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )
              }

              return (
                <div
                  key={rate.id}
                  className="bg-zinc-800 border border-zinc-700 rounded-2xl px-5 py-4 flex items-center gap-4"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-base font-semibold text-white">{rate.label}</div>
                    <div className="text-sm text-zinc-400">
                      {rate.percentage}%
                      {assignedCategory
                        ? ` · assigned to ${assignedCategory.name}`
                        : ' · unassigned'}
                    </div>
                  </div>
                  <div className="text-xl font-bold text-indigo-300 shrink-0 tabular-nums">
                    {rate.percentage}%
                  </div>
                  <button
                    onClick={() => handleStartEditVatRate(rate)}
                    aria-label={`Edit VAT rate ${rate.label}`}
                    className="min-h-[48px] min-w-[48px] px-4 py-2 rounded-xl bg-zinc-700 text-white text-base font-medium hover:bg-zinc-600 transition-colors shrink-0"
                  >
                    Edit
                  </button>
                  {isDeleting ? (
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-sm text-red-400">Delete?</span>
                      <button
                        onClick={() => { void handleDeleteVatRate() }}
                        disabled={submitting}
                        aria-label={`Confirm delete VAT rate ${rate.label}`}
                        className="min-h-[48px] min-w-[48px] px-4 py-2 rounded-xl bg-red-700 text-white text-base font-medium hover:bg-red-600 transition-colors disabled:opacity-50"
                      >
                        Yes
                      </button>
                      <button
                        onClick={() => setDeletingVatRateId(null)}
                        aria-label="Cancel delete"
                        className="min-h-[48px] min-w-[48px] px-4 py-2 rounded-xl bg-zinc-700 text-white text-base font-medium hover:bg-zinc-600 transition-colors"
                      >
                        No
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDeletingVatRateId(rate.id)}
                      disabled={!deletable}
                      aria-label={`Delete VAT rate ${rate.label}`}
                      title={
                        deletable
                          ? undefined
                          : 'Remove all items from the assigned category before deleting this rate'
                      }
                      className="min-h-[48px] min-w-[48px] px-4 py-2 rounded-xl bg-red-900 text-red-200 text-base font-medium hover:bg-red-800 transition-colors shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Delete
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Items Pricing section */}
      <section>
        <h2 className="text-lg font-semibold text-zinc-300 uppercase tracking-wide mb-3">
          Item Pricing
        </h2>

        {/* Column headers */}
        <div className="hidden sm:grid sm:grid-cols-[1fr_auto_auto_auto_auto] gap-4 px-5 mb-2">
          <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Item</span>
          <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wide text-right">
            Base Price
          </span>
          <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wide text-right">
            VAT Rate
          </span>
          <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wide text-right">
            {taxInclusive ? 'Final Price (incl. VAT)' : 'Final Price (excl. VAT)'}
          </span>
          <span className="sr-only">Actions</span>
        </div>

        {categories.length === 0 ? (
          <p className="text-zinc-500 text-base px-2">No menu items found.</p>
        ) : (
          <div className="flex flex-col gap-6">
            {categories.map((category) => {
              const categoryVatRate = getVatRateForCategory(category.id)
              return (
                <div key={category.id}>
                  <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide mb-2 px-2">
                    {category.name}
                    {categoryVatRate && (
                      <span className="ml-2 text-indigo-400 normal-case">
                        · {categoryVatRate.label} ({categoryVatRate.percentage}%)
                      </span>
                    )}
                  </h3>
                  {category.items.length === 0 ? (
                    <p className="text-zinc-600 text-sm px-2">No items in this category.</p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {category.items.map((item) => {
                        const isEditingThisItem = editingItemId === item.id
                        const previewCents = categoryVatRate
                          ? computePreviewCents(
                              item.price_cents,
                              categoryVatRate.percentage,
                              taxInclusive,
                            )
                          : item.price_cents

                        if (isEditingThisItem) {
                          return (
                            <div
                              key={item.id}
                              className="bg-zinc-800 border border-indigo-500 rounded-2xl p-4 flex flex-col gap-4"
                            >
                              <div className="text-base font-semibold text-white">{item.name}</div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="flex flex-col gap-1">
                                  <label
                                    htmlFor={`edit-item-price-${item.id}`}
                                    className="text-sm font-medium text-zinc-300"
                                  >
                                    Base Price (£) <span className="text-red-400">*</span>
                                  </label>
                                  <input
                                    id={`edit-item-price-${item.id}`}
                                    type="number"
                                    inputMode="decimal"
                                    step="0.01"
                                    min="0"
                                    value={editItemForm.price}
                                    onChange={(e) => {
                                      setEditItemForm((f) => ({ ...f, price: e.target.value }))
                                      setEditItemFormErrors({})
                                    }}
                                    className="min-h-[48px] px-4 py-2 rounded-xl bg-zinc-900 text-white border border-zinc-600 focus:border-indigo-500 focus:outline-none text-base"
                                    placeholder="0.00"
                                  />
                                  {editItemFormErrors.price && (
                                    <span className="text-sm text-red-400">
                                      {editItemFormErrors.price}
                                    </span>
                                  )}
                                </div>
                                <div className="flex flex-col gap-1">
                                  <label
                                    htmlFor={`edit-item-vat-${item.id}`}
                                    className="text-sm font-medium text-zinc-300"
                                  >
                                    VAT Rate
                                  </label>
                                  <select
                                    id={`edit-item-vat-${item.id}`}
                                    value={editItemForm.vatRateId}
                                    onChange={(e) =>
                                      setEditItemForm((f) => ({ ...f, vatRateId: e.target.value }))
                                    }
                                    className="min-h-[48px] px-4 py-2 rounded-xl bg-zinc-900 text-white border border-zinc-600 focus:border-indigo-500 focus:outline-none text-base"
                                  >
                                    <option value="">None</option>
                                    {vatRates.map((r) => (
                                      <option key={r.id} value={r.id}>
                                        {r.label} ({r.percentage}%)
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              </div>
                              {/* Live preview while editing */}
                              {editItemForm.price && !isNaN(parseFloat(editItemForm.price)) && (
                                <div className="text-sm text-zinc-400">
                                  Preview:{' '}
                                  <span className="text-indigo-300 font-semibold">
                                    {(() => {
                                      const baseCents = Math.round(
                                        parseFloat(editItemForm.price) * 100,
                                      )
                                      const selectedRate = vatRates.find(
                                        (r) => r.id === editItemForm.vatRateId,
                                      )
                                      const cents = selectedRate
                                        ? computePreviewCents(
                                            baseCents,
                                            selectedRate.percentage,
                                            taxInclusive,
                                          )
                                        : baseCents
                                      return formatCurrency(cents)
                                    })()}
                                  </span>
                                </div>
                              )}
                              <div className="flex gap-3">
                                <button
                                  onClick={() => { void handleSaveEditItem() }}
                                  disabled={submitting}
                                  className="min-h-[48px] px-5 py-2 rounded-xl bg-indigo-600 text-white text-base font-medium hover:bg-indigo-500 transition-colors disabled:opacity-50"
                                >
                                  Save Changes
                                </button>
                                <button
                                  onClick={handleCancelEditItem}
                                  className="min-h-[48px] px-5 py-2 rounded-xl bg-zinc-700 text-white text-base font-medium hover:bg-zinc-600 transition-colors"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          )
                        }

                        return (
                          <div
                            key={item.id}
                            className="bg-zinc-800 border border-zinc-700 rounded-2xl px-5 py-4 grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-4"
                          >
                            <div className="text-base font-semibold text-white truncate">
                              {item.name}
                            </div>
                            <div className="text-base text-zinc-300 tabular-nums shrink-0">
                              {formatCurrency(item.price_cents)}
                            </div>
                            <div className="text-sm text-zinc-400 shrink-0">
                              {categoryVatRate
                                ? `${categoryVatRate.percentage}%`
                                : <span className="text-zinc-600">—</span>}
                            </div>
                            <div className="text-base font-bold text-indigo-300 tabular-nums shrink-0">
                              {formatCurrency(previewCents)}
                            </div>
                            <button
                              onClick={() => handleStartEditItem(item, category.id)}
                              aria-label={`Edit pricing for ${item.name}`}
                              className="min-h-[48px] min-w-[48px] px-4 py-2 rounded-xl bg-zinc-700 text-white text-base font-medium hover:bg-zinc-600 transition-colors shrink-0"
                            >
                              Edit
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
