'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import type { JSX } from 'react'
import { useRouter } from 'next/navigation'
import { fetchMenuAdminData } from './menuAdminData'
import type { AdminMenu, AdminModifier } from './menuAdminData'
import { fetchConfigValue } from '../pricing/pricingAdminData'
import { DEFAULT_CURRENCY_SYMBOL } from '@/lib/formatPrice'
import { callCreateMenuItem, callUpdateMenuItem } from './menuAdminApi'
import type { ModifierInput } from './menuAdminApi'
import { callExtractMenuItem, uploadMenuFile, fileToBase64 } from './extractMenuItemApi'
import { useUser } from '@/lib/user-context'
import FileUploadZone from './FileUploadZone'
import type { UploadState } from './FileUploadZone'
import { generateId, formatCurrency } from './MenuManager'

export const ALLERGEN_OPTIONS = ['nuts', 'dairy', 'gluten', 'eggs', 'shellfish', 'soy', 'sesame'] as const
export const DIETARY_OPTIONS = ['halal', 'vegetarian', 'vegan'] as const
export const SPICY_OPTIONS = ['none', 'mild', 'medium', 'hot'] as const

interface ItemFormValues {
  name: string
  description: string
  price: string
  menuId: string
  available: boolean
  modifiers: AdminModifier[]
  allergens: string[]
  dietaryBadges: string[]
  spicyLevel: string
}

interface ItemFormErrors {
  name?: string
  price?: string
  menuId?: string
}

interface ModifierFormValues {
  name: string
  price: string
}

export interface MenuItemFormPageProps {
  mode: 'new' | 'edit'
  itemId?: string
}

interface MenuItemRow {
  id: string
  name: string
  description?: string
  price_cents: number
  image_url?: string
  menu_id: string
  available: boolean
  modifiers: Array<{ id: string; name: string; price_delta_cents: number }>
  allergens?: string[]
  dietary_badges?: string[]
  spicy_level?: string
}

const EMPTY_FORM: ItemFormValues = {
  name: '',
  description: '',
  price: '',
  menuId: '',
  available: true,
  modifiers: [],
  allergens: [],
  dietaryBadges: [],
  spicyLevel: 'none',
}

const EMPTY_MODIFIER: ModifierFormValues = { name: '', price: '' }

function validateForm(form: ItemFormValues): ItemFormErrors {
  const errors: ItemFormErrors = {}
  if (!form.name.trim()) errors.name = 'Name is required'
  if (!form.price.trim()) {
    errors.price = 'Price is required'
  } else if (isNaN(parseFloat(form.price)) || parseFloat(form.price) < 0) {
    errors.price = 'Enter a valid price'
  }
  if (!form.menuId) errors.menuId = 'Category is required'
  return errors
}

async function fetchMenuItemById(
  supabaseUrl: string,
  apiKey: string,
  itemId: string,
): Promise<MenuItemRow | null> {
  const headers = { apikey: apiKey, Authorization: `Bearer ${apiKey}` }
  const url = new URL(`${supabaseUrl}/rest/v1/menu_items`)
  url.searchParams.set('select', 'id,name,description,price_cents,image_url,menu_id,available,allergens,dietary_badges,spicy_level,modifiers(id,name,price_delta_cents)')
  url.searchParams.set('id', `eq.${itemId}`)
  const res = await fetch(url.toString(), { headers })
  if (!res.ok) throw new Error(`Failed to fetch menu item: ${res.status}`)
  const rows = (await res.json()) as MenuItemRow[]
  return rows[0] ?? null
}

export default function MenuItemFormPage({ mode, itemId }: MenuItemFormPageProps): JSX.Element {
  const router = useRouter()
  const { accessToken } = useUser()
  const supabaseConfig = useRef<{ url: string; key: string } | null>(null)

  const [menus, setMenus] = useState<AdminMenu[]>([])
  const [currencySymbol, setCurrencySymbol] = useState<string>(DEFAULT_CURRENCY_SYMBOL)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const [form, setForm] = useState<ItemFormValues>(EMPTY_FORM)
  const [formErrors, setFormErrors] = useState<ItemFormErrors>({})
  const [modifierForm, setModifierForm] = useState<ModifierFormValues>(EMPTY_MODIFIER)
  const [modifierError, setModifierError] = useState('')

  const [uploadState, setUploadState] = useState<UploadState>('idle')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [extractError, setExtractError] = useState<string | null>(null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  useEffect(() => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    if (!supabaseUrl || !supabaseKey) {
      setFetchError('API not configured')
      setLoading(false)
      return
    }
    supabaseConfig.current = { url: supabaseUrl, key: supabaseKey }

    const fetches: Promise<void>[] = [
      fetchMenuAdminData(supabaseUrl, supabaseKey).then((data) => {
        setMenus(data.menus)
        void fetchConfigValue(supabaseUrl, supabaseKey, data.restaurantId, 'currency_symbol', DEFAULT_CURRENCY_SYMBOL)
          .then((sym) => setCurrencySymbol(sym))
      }),
    ]

    if (mode === 'edit' && itemId) {
      fetches.push(
        fetchMenuItemById(supabaseUrl, supabaseKey, itemId).then((item) => {
          if (!item) {
            setFetchError('Menu item not found')
            return
          }
          setForm({
            name: item.name,
            description: item.description ?? '',
            price: (item.price_cents / 100).toFixed(2),
            menuId: item.menu_id,
            available: item.available ?? true,
            modifiers: (item.modifiers ?? []).map((m) => ({ ...m })),
            allergens: item.allergens ?? [],
            dietaryBadges: item.dietary_badges ?? [],
            spicyLevel: item.spicy_level ?? 'none',
          })
          if (item.image_url) {
            setPreviewUrl(item.image_url)
            setUploadState('done')
          }
        }),
      )
    }

    Promise.all(fetches)
      .catch((err: unknown) => {
        setFetchError(err instanceof Error ? err.message : 'Failed to load data')
      })
      .finally(() => setLoading(false))
  }, [mode, itemId])

  const handleFileSelected = useCallback(
    async (file: File): Promise<void> => {
      const config = supabaseConfig.current
      if (!config) return

      setPendingFile(file)
      setExtractError(null)

      // Show thumbnail immediately for images
      if (file.type.startsWith('image/')) {
        const objectUrl = URL.createObjectURL(file)
        setPreviewUrl(objectUrl)
      } else {
        setPreviewUrl(null)
      }

      setUploadState('uploading')

      let base64: string
      try {
        base64 = await fileToBase64(file)
      } catch {
        setUploadState('error')
        setExtractError('Could not read the file. Please try again.')
        return
      }

      setUploadState('extracting')

      try {
        const extracted = await callExtractMenuItem(config.url, accessToken ?? '', base64, file.type)
        setForm((prev) => ({
          ...prev,
          ...(extracted.name ? { name: extracted.name } : {}),
          ...(extracted.description ? { description: extracted.description } : {}),
          ...(extracted.price !== undefined ? { price: extracted.price.toFixed(2) } : {}),
          menuId: (() => {
            if (!extracted.category) return prev.menuId
            const match = menus.find(
              (m) => m.name.toLowerCase() === extracted.category!.toLowerCase(),
            )
            return match ? match.id : prev.menuId
          })(),
        }))
        setUploadState('done')
      } catch (err) {
        setUploadState('error')
        setExtractError(err instanceof Error ? err.message : 'Extraction failed. Fill in the form manually.')
      }
    },
    [menus],
  )

  function handleAddModifier(): void {
    if (!modifierForm.name.trim()) {
      setModifierError('Modifier name is required')
      return
    }
    const raw = modifierForm.price.trim()
    const price = raw === '' ? 0 : parseFloat(raw)
    if (isNaN(price) || price < 0) {
      setModifierError('Enter a valid price')
      return
    }
    const mod: AdminModifier = {
      id: generateId(),
      name: modifierForm.name.trim(),
      price_delta_cents: Math.round(price * 100),
    }
    setForm((f) => ({ ...f, modifiers: [...f.modifiers, mod] }))
    setModifierForm(EMPTY_MODIFIER)
    setModifierError('')
  }

  function handleRemoveModifier(modId: string): void {
    setForm((f) => ({ ...f, modifiers: f.modifiers.filter((m) => m.id !== modId) }))
  }

  async function handleSave(): Promise<void> {
    const errors = validateForm(form)
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors)
      return
    }
    const config = supabaseConfig.current
    if (!config) return

    setSubmitting(true)
    setSubmitError(null)

    try {
      const priceCents = Math.round(parseFloat(form.price) * 100)
      const modifierInputs: ModifierInput[] = form.modifiers.map((m) => ({
        name: m.name,
        price_delta_cents: m.price_delta_cents,
      }))
      const description = form.description.trim() || undefined

      // Upload file to storage if a new file was selected
      let imageUrl: string | undefined
      if (pendingFile) {
        imageUrl = await uploadMenuFile(config.url, config.key, pendingFile)
      }

      if (mode === 'new') {
        await callCreateMenuItem(
          config.url,
          accessToken ?? '',
          form.menuId,
          form.name.trim(),
          priceCents,
          modifierInputs,
          description,
          imageUrl,
          form.available,
          form.allergens,
          form.dietaryBadges,
          form.spicyLevel,
        )
      } else if (mode === 'edit' && itemId) {
        await callUpdateMenuItem(
          config.url,
          accessToken ?? '',
          itemId,
          form.name.trim(),
          priceCents,
          modifierInputs,
          description,
          imageUrl,
          form.available,
          form.allergens,
          form.dietaryBadges,
          form.spicyLevel,
        )
      }

      router.push('/admin/menu')
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to save item.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-bold text-white">
          {mode === 'new' ? 'New Item' : 'Edit Item'}
        </h1>
        <p className="text-zinc-400">Loading…</p>
      </div>
    )
  }

  if (fetchError) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-bold text-white">
          {mode === 'new' ? 'New Item' : 'Edit Item'}
        </h1>
        <p className="text-red-400">{fetchError}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.push('/admin/menu')}
          aria-label="Back to menu"
          className="min-h-[48px] min-w-[48px] flex items-center justify-center rounded-xl bg-zinc-700 text-zinc-300 hover:bg-zinc-600 transition-colors"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-2xl font-bold text-white">
          {mode === 'new' ? 'New Item' : 'Edit Item'}
        </h1>
      </div>

      {/* Upload section */}
      <section className="bg-zinc-800 border border-zinc-700 rounded-2xl p-5 flex flex-col gap-4">
        <h2 className="text-base font-semibold text-zinc-200">
          Upload Image or PDF{' '}
          <span className="text-zinc-500 font-normal">(optional — AI will extract details)</span>
        </h2>
        <FileUploadZone
          uploadState={uploadState}
          previewUrl={previewUrl}
          errorMessage={extractError}
          onFileSelected={(file) => { void handleFileSelected(file) }}
          disabled={submitting}
        />
      </section>

      {/* Item form */}
      <section className="bg-zinc-800 border border-zinc-700 rounded-2xl p-5 flex flex-col gap-4">
        <h2 className="text-base font-semibold text-zinc-200">Item Details</h2>

        <div className="grid grid-cols-2 gap-4">
          {/* Name */}
          <div className="col-span-2 flex flex-col gap-1">
            <label htmlFor="item-name" className="text-sm font-medium text-zinc-300">
              Name <span className="text-red-400">*</span>
            </label>
            <input
              id="item-name"
              type="text"
              value={form.name}
              onChange={(e) => {
                setForm((f) => ({ ...f, name: e.target.value }))
                setFormErrors((fe) => ({ ...fe, name: undefined }))
              }}
              disabled={submitting}
              className="min-h-[48px] px-4 py-2 rounded-xl bg-zinc-900 text-white border border-zinc-600 focus:border-indigo-500 focus:outline-none text-base disabled:opacity-50"
              placeholder="e.g. Grilled Chicken"
            />
            {formErrors.name && <span className="text-sm text-red-400">{formErrors.name}</span>}
          </div>

          {/* Description */}
          <div className="col-span-2 flex flex-col gap-1">
            <label htmlFor="item-description" className="text-sm font-medium text-zinc-300">
              Description
            </label>
            <textarea
              id="item-description"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              disabled={submitting}
              rows={2}
              className="px-4 py-3 rounded-xl bg-zinc-900 text-white border border-zinc-600 focus:border-indigo-500 focus:outline-none text-base resize-none disabled:opacity-50"
              placeholder="Brief description of the item"
            />
          </div>

          {/* Price */}
          <div className="flex flex-col gap-1">
            <label htmlFor="item-price" className="text-sm font-medium text-zinc-300">
              Price ({currencySymbol}) <span className="text-red-400">*</span>
            </label>
            <input
              id="item-price"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={form.price}
              onChange={(e) => {
                setForm((f) => ({ ...f, price: e.target.value }))
                setFormErrors((fe) => ({ ...fe, price: undefined }))
              }}
              disabled={submitting}
              className="min-h-[48px] px-4 py-2 rounded-xl bg-zinc-900 text-white border border-zinc-600 focus:border-indigo-500 focus:outline-none text-base disabled:opacity-50"
              placeholder="0.00"
            />
            {formErrors.price && <span className="text-sm text-red-400">{formErrors.price}</span>}
          </div>

          {/* Category */}
          <div className="flex flex-col gap-1">
            <label htmlFor="item-category" className="text-sm font-medium text-zinc-300">
              Category <span className="text-red-400">*</span>
            </label>
            <select
              id="item-category"
              value={form.menuId}
              onChange={(e) => {
                setForm((f) => ({ ...f, menuId: e.target.value }))
                setFormErrors((fe) => ({ ...fe, menuId: undefined }))
              }}
              disabled={submitting}
              className="min-h-[48px] px-4 py-2 rounded-xl bg-zinc-900 text-white border border-zinc-600 focus:border-indigo-500 focus:outline-none text-base disabled:opacity-50"
            >
              <option value="">Select category…</option>
              {menus.map((menu) => (
                <option key={menu.id} value={menu.id}>
                  {menu.name}
                </option>
              ))}
            </select>
            {formErrors.menuId && <span className="text-sm text-red-400">{formErrors.menuId}</span>}
          </div>
        </div>

        {/* Available toggle */}
        <div className="col-span-2 flex items-center justify-between bg-zinc-900 rounded-xl px-4 py-3 border border-zinc-600">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium text-zinc-300">Available</span>
            <span className="text-xs text-zinc-500">
              {form.available ? 'Item is on the menu' : 'Item is 86\'d (hidden from order menu)'}
            </span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={form.available}
            aria-label="Toggle item availability"
            onClick={() => setForm((f) => ({ ...f, available: !f.available }))}
            disabled={submitting}
            className={[
              'relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent',
              'transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-zinc-900',
              'disabled:opacity-50',
              form.available ? 'bg-indigo-600' : 'bg-zinc-600',
            ].join(' ')}
          >
            <span
              aria-hidden="true"
              className={[
                'pointer-events-none inline-block h-6 w-6 rounded-full bg-white shadow transform ring-0',
                'transition duration-200 ease-in-out',
                form.available ? 'translate-x-5' : 'translate-x-0',
              ].join(' ')}
            />
          </button>
        </div>

        {/* Allergens */}
        <div className="flex flex-col gap-3 border-t border-zinc-700 pt-4">
          <h3 className="text-base font-semibold text-zinc-200">
            Allergens <span className="text-zinc-500 font-normal">(select all that apply)</span>
          </h3>
          <div className="flex flex-wrap gap-2">
            {ALLERGEN_OPTIONS.map((allergen) => {
              const active = form.allergens.includes(allergen)
              return (
                <button
                  key={allergen}
                  type="button"
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      allergens: active
                        ? f.allergens.filter((a) => a !== allergen)
                        : [...f.allergens, allergen],
                    }))
                  }
                  disabled={submitting}
                  aria-pressed={active}
                  className={[
                    'min-h-[40px] px-4 py-1.5 rounded-full text-sm font-medium capitalize transition-colors disabled:opacity-50',
                    active
                      ? 'bg-red-700 text-white'
                      : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600',
                  ].join(' ')}
                >
                  {allergen}
                </button>
              )
            })}
          </div>
        </div>

        {/* Dietary badges */}
        <div className="flex flex-col gap-3 border-t border-zinc-700 pt-4">
          <h3 className="text-base font-semibold text-zinc-200">
            Dietary Badges <span className="text-zinc-500 font-normal">(select all that apply)</span>
          </h3>
          <div className="flex flex-wrap gap-2">
            {DIETARY_OPTIONS.map((badge) => {
              const active = form.dietaryBadges.includes(badge)
              return (
                <button
                  key={badge}
                  type="button"
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      dietaryBadges: active
                        ? f.dietaryBadges.filter((b) => b !== badge)
                        : [...f.dietaryBadges, badge],
                    }))
                  }
                  disabled={submitting}
                  aria-pressed={active}
                  className={[
                    'min-h-[40px] px-4 py-1.5 rounded-full text-sm font-medium capitalize transition-colors disabled:opacity-50',
                    active
                      ? 'bg-emerald-700 text-white'
                      : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600',
                  ].join(' ')}
                >
                  {badge === 'halal' ? '✓ Halal' : badge.charAt(0).toUpperCase() + badge.slice(1)}
                </button>
              )
            })}
          </div>
        </div>

        {/* Spicy level */}
        <div className="flex flex-col gap-3 border-t border-zinc-700 pt-4">
          <h3 className="text-base font-semibold text-zinc-200">Spicy Level</h3>
          <div className="flex flex-wrap gap-2">
            {SPICY_OPTIONS.map((level) => {
              const labels: Record<string, string> = { none: 'None', mild: '🌶 Mild', medium: '🌶🌶 Medium', hot: '🌶🌶🌶 Hot' }
              const active = form.spicyLevel === level
              return (
                <button
                  key={level}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, spicyLevel: level }))}
                  disabled={submitting}
                  aria-pressed={active}
                  className={[
                    'min-h-[40px] px-4 py-1.5 rounded-full text-sm font-medium transition-colors disabled:opacity-50',
                    active
                      ? 'bg-orange-700 text-white'
                      : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600',
                  ].join(' ')}
                >
                  {labels[level]}
                </button>
              )
            })}
          </div>
        </div>

        {/* Modifiers */}
        <div className="flex flex-col gap-3 border-t border-zinc-700 pt-4">
          <h3 className="text-base font-semibold text-zinc-200">
            Modifiers <span className="text-zinc-500 font-normal">(optional)</span>
          </h3>

          {form.modifiers.length > 0 && (
            <ul className="flex flex-col gap-2">
              {form.modifiers.map((mod) => (
                <li key={mod.id} className="flex items-center gap-3 bg-zinc-900 rounded-xl px-4 py-2">
                  <span className="flex-1 text-base text-white">{mod.name}</span>
                  <span className="text-base text-indigo-300 shrink-0">
                    {mod.price_delta_cents > 0
                      ? `+${formatCurrency(mod.price_delta_cents)}`
                      : 'Free'}
                  </span>
                  <button
                    onClick={() => handleRemoveModifier(mod.id)}
                    aria-label={`Remove modifier ${mod.name}`}
                    className="min-h-[48px] min-w-[48px] px-3 py-1 rounded-xl bg-red-900 text-red-200 text-sm font-medium hover:bg-red-800 transition-colors"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex gap-3 items-start">
            <div className="flex flex-col gap-1 flex-1">
              <label htmlFor="modifier-name" className="text-sm font-medium text-zinc-400">
                Modifier name
              </label>
              <input
                id="modifier-name"
                type="text"
                value={modifierForm.name}
                onChange={(e) => {
                  setModifierForm((f) => ({ ...f, name: e.target.value }))
                  setModifierError('')
                }}
                className="min-h-[48px] px-4 py-2 rounded-xl bg-zinc-900 text-white border border-zinc-600 focus:border-indigo-500 focus:outline-none text-base"
                placeholder="e.g. Extra sauce"
              />
              {modifierError && <span className="text-sm text-red-400">{modifierError}</span>}
            </div>
            <div className="flex flex-col gap-1 w-32">
              <label htmlFor="modifier-price" className="text-sm font-medium text-zinc-400">
                Add-on ({currencySymbol})
              </label>
              <input
                id="modifier-price"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={modifierForm.price}
                onChange={(e) => setModifierForm((f) => ({ ...f, price: e.target.value }))}
                className="min-h-[48px] px-4 py-2 rounded-xl bg-zinc-900 text-white border border-zinc-600 focus:border-indigo-500 focus:outline-none text-base"
                placeholder="0.00"
              />
            </div>
            <div className="flex flex-col gap-1 justify-end">
              <span className="text-sm font-medium text-zinc-400 invisible" aria-hidden="true">x</span>
              <button
                onClick={handleAddModifier}
                className="min-h-[48px] px-4 py-2 rounded-xl bg-zinc-600 text-white text-base font-medium hover:bg-zinc-500 transition-colors"
              >
                + Add
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Submit error */}
      {submitError && (
        <p role="alert" className="text-sm text-red-400 px-1">
          {submitError}
        </p>
      )}

      {/* Action buttons */}
      <div className="flex gap-3">
        <button
          onClick={() => { void handleSave() }}
          disabled={submitting || uploadState === 'uploading' || uploadState === 'extracting'}
          className="min-h-[48px] px-6 py-2 rounded-xl bg-indigo-600 text-white text-base font-medium hover:bg-indigo-500 transition-colors disabled:opacity-50"
        >
          {submitting ? 'Saving…' : 'Save Item'}
        </button>
        <button
          onClick={() => router.push('/admin/menu')}
          disabled={submitting}
          className="min-h-[48px] px-6 py-2 rounded-xl bg-zinc-700 text-white text-base font-medium hover:bg-zinc-600 transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
