'use client'

import { useState, useEffect, useRef } from 'react'
import type { JSX } from 'react'
import { fetchMenuAdminData } from './menuAdminData'
import type { AdminMenu, AdminMenuItem, AdminModifier } from './menuAdminData'
import {
  callCreateMenu,
  callUpdateMenu,
  callDeleteMenu,
  callCreateMenuItem,
  callUpdateMenuItem,
  callDeleteMenuItem,
} from './menuAdminApi'
import type { ModifierInput } from './menuAdminApi'

interface ItemFormValues {
  name: string
  price: string
  menuId: string
  modifiers: AdminModifier[]
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

type FeedbackType = 'success' | 'error'

interface Feedback {
  type: FeedbackType
  message: string
}

const EMPTY_ITEM_FORM: ItemFormValues = {
  name: '',
  price: '',
  menuId: '',
  modifiers: [],
}

const EMPTY_MODIFIER_FORM: ModifierFormValues = {
  name: '',
  price: '',
}

export function formatCurrency(priceCents: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(
    priceCents / 100,
  )
}

export function generateId(): string {
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function validateItemForm(form: ItemFormValues): ItemFormErrors {
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

function parsePriceToCents(priceStr: string): number {
  return Math.round(parseFloat(priceStr) * 100)
}

export default function MenuManager(): JSX.Element {
  const [menus, setMenus] = useState<AdminMenu[]>([])
  const [restaurantId, setRestaurantId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const supabaseConfig = useRef<{ url: string; key: string } | null>(null)

  const [showAddItem, setShowAddItem] = useState(false)
  const [itemForm, setItemForm] = useState<ItemFormValues>(EMPTY_ITEM_FORM)
  const [itemFormErrors, setItemFormErrors] = useState<ItemFormErrors>({})

  const [showAddCategory, setShowAddCategory] = useState(false)
  const [categoryName, setCategoryName] = useState('')
  const [categoryNameError, setCategoryNameError] = useState('')

  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null)

  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null)
  const [editingCategoryName, setEditingCategoryName] = useState('')
  const [editingCategoryNameError, setEditingCategoryNameError] = useState('')
  const [deletingCategoryId, setDeletingCategoryId] = useState<string | null>(null)

  const [modifierForm, setModifierForm] = useState<ModifierFormValues>(EMPTY_MODIFIER_FORM)
  const [modifierFormError, setModifierFormError] = useState('')

  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    if (supabaseUrl && supabaseKey) {
      supabaseConfig.current = { url: supabaseUrl, key: supabaseKey }
    }

    fetchMenuAdminData()
      .then((data) => {
        setRestaurantId(data.restaurantId)
        setMenus(data.menus)
      })
      .catch((err: unknown) => {
        setFetchError(err instanceof Error ? err.message : 'Failed to load menu data')
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

  function handleAddModifier(): void {
    if (!modifierForm.name.trim()) {
      setModifierFormError('Modifier name is required')
      return
    }
    const rawPrice = modifierForm.price.trim()
    const price = rawPrice === '' ? 0 : parseFloat(rawPrice)
    if (isNaN(price) || price < 0) {
      setModifierFormError('Enter a valid price')
      return
    }
    const newModifier: AdminModifier = {
      id: generateId(),
      name: modifierForm.name.trim(),
      price_delta_cents: Math.round(price * 100),
    }
    setItemForm((f) => ({ ...f, modifiers: [...f.modifiers, newModifier] }))
    setModifierForm(EMPTY_MODIFIER_FORM)
    setModifierFormError('')
  }

  function handleRemoveModifier(modifierId: string): void {
    setItemForm((f) => ({ ...f, modifiers: f.modifiers.filter((m) => m.id !== modifierId) }))
  }

  async function handleAddItem(): Promise<void> {
    const errors = validateItemForm(itemForm)
    if (Object.keys(errors).length > 0) {
      setItemFormErrors(errors)
      return
    }
    const config = supabaseConfig.current
    if (!config) return
    setSubmitting(true)
    try {
      const priceCents = parsePriceToCents(itemForm.price)
      const modifierInputs: ModifierInput[] = itemForm.modifiers.map((m) => ({
        name: m.name,
        price_delta_cents: m.price_delta_cents,
      }))
      const menuItemId = await callCreateMenuItem(
        config.url,
        config.key,
        itemForm.menuId,
        itemForm.name.trim(),
        priceCents,
        modifierInputs,
      )
      const newItem: AdminMenuItem = {
        id: menuItemId,
        name: itemForm.name.trim(),
        price_cents: priceCents,
        modifiers: itemForm.modifiers,
      }
      setMenus((prev) =>
        prev.map((m) =>
          m.id === itemForm.menuId ? { ...m, items: [...m.items, newItem] } : m,
        ),
      )
      const addedName = itemForm.name.trim()
      setItemForm(EMPTY_ITEM_FORM)
      setItemFormErrors({})
      setModifierForm(EMPTY_MODIFIER_FORM)
      setModifierFormError('')
      setShowAddItem(false)
      showFeedback('success', `"${addedName}" added successfully.`)
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : 'Failed to add item.')
    } finally {
      setSubmitting(false)
    }
  }

  function handleStartEdit(item: AdminMenuItem, menuId: string): void {
    setEditingItemId(item.id)
    setItemForm({
      name: item.name,
      price: (item.price_cents / 100).toFixed(2),
      menuId,
      modifiers: item.modifiers.map((m) => ({ ...m })),
    })
    setItemFormErrors({})
    setModifierForm(EMPTY_MODIFIER_FORM)
    setModifierFormError('')
    setShowAddItem(false)
    setShowAddCategory(false)
  }

  async function handleSaveEdit(): Promise<void> {
    if (!editingItemId) return
    const errors = validateItemForm(itemForm)
    if (Object.keys(errors).length > 0) {
      setItemFormErrors(errors)
      return
    }
    const config = supabaseConfig.current
    if (!config) return
    setSubmitting(true)
    try {
      const priceCents = parsePriceToCents(itemForm.price)
      const modifierInputs: ModifierInput[] = itemForm.modifiers.map((m) => ({
        name: m.name,
        price_delta_cents: m.price_delta_cents,
      }))
      await callUpdateMenuItem(
        config.url,
        config.key,
        editingItemId,
        itemForm.name.trim(),
        priceCents,
        modifierInputs,
      )
      const updatedName = itemForm.name.trim()
      const updatedItem: Partial<AdminMenuItem> = {
        name: updatedName,
        price_cents: priceCents,
        modifiers: itemForm.modifiers,
      }
      setMenus((prev) =>
        prev.map((menu) => ({
          ...menu,
          items: menu.items.map((item) =>
            item.id === editingItemId ? { ...item, ...updatedItem } : item,
          ),
        })),
      )
      setEditingItemId(null)
      setItemForm(EMPTY_ITEM_FORM)
      setItemFormErrors({})
      setModifierForm(EMPTY_MODIFIER_FORM)
      setModifierFormError('')
      showFeedback('success', `"${updatedName}" updated successfully.`)
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : 'Failed to update item.')
    } finally {
      setSubmitting(false)
    }
  }

  function handleCancelItemForm(): void {
    setShowAddItem(false)
    setEditingItemId(null)
    setItemForm(EMPTY_ITEM_FORM)
    setItemFormErrors({})
    setModifierForm(EMPTY_MODIFIER_FORM)
    setModifierFormError('')
  }

  async function handleDeleteConfirm(): Promise<void> {
    if (!deletingItemId) return
    const config = supabaseConfig.current
    if (!config) return
    const itemName = menus.flatMap((m) => m.items).find((i) => i.id === deletingItemId)?.name
    setSubmitting(true)
    try {
      await callDeleteMenuItem(config.url, config.key, deletingItemId)
      setMenus((prev) =>
        prev.map((menu) => ({
          ...menu,
          items: menu.items.filter((item) => item.id !== deletingItemId),
        })),
      )
      if (editingItemId === deletingItemId) {
        setEditingItemId(null)
        setItemForm(EMPTY_ITEM_FORM)
      }
      setDeletingItemId(null)
      showFeedback('success', itemName ? `"${itemName}" deleted.` : 'Item deleted.')
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : 'Failed to delete item.')
      setDeletingItemId(null)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleAddCategory(): Promise<void> {
    if (!categoryName.trim()) {
      setCategoryNameError('Category name is required')
      return
    }
    const config = supabaseConfig.current
    if (!config) return
    setSubmitting(true)
    try {
      const menuId = await callCreateMenu(config.url, config.key, restaurantId, categoryName.trim())
      const newMenu: AdminMenu = {
        id: menuId,
        name: categoryName.trim(),
        restaurant_id: restaurantId,
        items: [],
      }
      const addedName = categoryName.trim()
      setMenus((prev) => [...prev, newMenu])
      setCategoryName('')
      setCategoryNameError('')
      setShowAddCategory(false)
      showFeedback('success', `Category "${addedName}" added.`)
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : 'Failed to add category.')
    } finally {
      setSubmitting(false)
    }
  }

  function handleStartEditCategory(menu: AdminMenu): void {
    setEditingCategoryId(menu.id)
    setEditingCategoryName(menu.name)
    setEditingCategoryNameError('')
    setDeletingCategoryId(null)
  }

  async function handleSaveEditCategory(): Promise<void> {
    if (!editingCategoryName.trim()) {
      setEditingCategoryNameError('Category name is required')
      return
    }
    const config = supabaseConfig.current
    if (!config || !editingCategoryId) return
    setSubmitting(true)
    try {
      const newName = editingCategoryName.trim()
      await callUpdateMenu(config.url, config.key, editingCategoryId, newName)
      setMenus((prev) =>
        prev.map((m) => (m.id === editingCategoryId ? { ...m, name: newName } : m)),
      )
      setEditingCategoryId(null)
      setEditingCategoryName('')
      setEditingCategoryNameError('')
      showFeedback('success', `Category renamed to "${newName}".`)
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : 'Failed to rename category.')
    } finally {
      setSubmitting(false)
    }
  }

  function handleCancelEditCategory(): void {
    setEditingCategoryId(null)
    setEditingCategoryName('')
    setEditingCategoryNameError('')
  }

  async function handleDeleteCategoryConfirm(): Promise<void> {
    if (!deletingCategoryId) return
    const config = supabaseConfig.current
    if (!config) return
    const menu = menus.find((m) => m.id === deletingCategoryId)
    if (menu && menu.items.length > 0) {
      showFeedback('error', 'Remove all items in this category before deleting it.')
      setDeletingCategoryId(null)
      return
    }
    setSubmitting(true)
    try {
      await callDeleteMenu(config.url, config.key, deletingCategoryId)
      setMenus((prev) => prev.filter((m) => m.id !== deletingCategoryId))
      setDeletingCategoryId(null)
      showFeedback('success', menu ? `Category "${menu.name}" deleted.` : 'Category deleted.')
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : 'Failed to delete category.')
      setDeletingCategoryId(null)
    } finally {
      setSubmitting(false)
    }
  }

  const isItemFormActive = showAddItem || editingItemId !== null

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-bold text-white">Menu</h1>
        <p className="text-zinc-400 text-base">Loading menu…</p>
      </div>
    )
  }

  if (fetchError !== null) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-bold text-white">Menu</h1>
        <p className="text-red-400 text-base">Unable to load menu data. Please try again.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Page header */}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-white">Menu</h1>
        <div className="flex gap-3">
          <button
            onClick={() => {
              setShowAddCategory((v) => !v)
              setShowAddItem(false)
              setEditingItemId(null)
              setItemForm(EMPTY_ITEM_FORM)
              setItemFormErrors({})
            }}
            disabled={submitting}
            className="min-h-[48px] px-5 py-2 rounded-xl text-base font-medium bg-zinc-700 text-white hover:bg-zinc-600 transition-colors disabled:opacity-50"
          >
            + Add Category
          </button>
          <button
            onClick={() => {
              setShowAddItem((v) => !v)
              setEditingItemId(null)
              setItemForm(EMPTY_ITEM_FORM)
              setItemFormErrors({})
              setModifierForm(EMPTY_MODIFIER_FORM)
              setModifierFormError('')
              setShowAddCategory(false)
            }}
            disabled={submitting}
            className="min-h-[48px] px-5 py-2 rounded-xl text-base font-medium bg-indigo-600 text-white hover:bg-indigo-500 transition-colors disabled:opacity-50"
          >
            + Add Item
          </button>
        </div>
      </div>

      {/* Feedback banner */}
      {feedback && (
        <div
          role="status"
          className={[
            'px-5 py-3 rounded-xl text-base font-medium',
            feedback.type === 'success' ? 'bg-green-800 text-green-100' : 'bg-red-800 text-red-100',
          ].join(' ')}
        >
          {feedback.message}
        </div>
      )}

      {/* Add Category inline form */}
      {showAddCategory && (
        <div className="bg-zinc-800 border border-zinc-700 rounded-2xl p-5 flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-white">New Category</h2>
          <div className="flex flex-col gap-1">
            <label htmlFor="category-name" className="text-sm font-medium text-zinc-300">
              Category Name <span className="text-red-400">*</span>
            </label>
            <input
              id="category-name"
              type="text"
              value={categoryName}
              onChange={(e) => {
                setCategoryName(e.target.value)
                setCategoryNameError('')
              }}
              className="min-h-[48px] px-4 py-2 rounded-xl bg-zinc-900 text-white border border-zinc-600 focus:border-indigo-500 focus:outline-none text-base"
              placeholder="e.g. Starters"
            />
            {categoryNameError && (
              <span className="text-sm text-red-400">{categoryNameError}</span>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => { void handleAddCategory() }}
              disabled={submitting}
              className="min-h-[48px] px-5 py-2 rounded-xl bg-indigo-600 text-white text-base font-medium hover:bg-indigo-500 transition-colors disabled:opacity-50"
            >
              Save Category
            </button>
            <button
              onClick={() => {
                setShowAddCategory(false)
                setCategoryName('')
                setCategoryNameError('')
              }}
              className="min-h-[48px] px-5 py-2 rounded-xl bg-zinc-700 text-white text-base font-medium hover:bg-zinc-600 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Add / Edit Item inline form */}
      {isItemFormActive && (
        <div className="bg-zinc-800 border border-zinc-700 rounded-2xl p-5 flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-white">
            {editingItemId ? 'Edit Item' : 'New Item'}
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label htmlFor="item-name" className="text-sm font-medium text-zinc-300">
                Name <span className="text-red-400">*</span>
              </label>
              <input
                id="item-name"
                type="text"
                value={itemForm.name}
                onChange={(e) => setItemForm((f) => ({ ...f, name: e.target.value }))}
                className="min-h-[48px] px-4 py-2 rounded-xl bg-zinc-900 text-white border border-zinc-600 focus:border-indigo-500 focus:outline-none text-base"
                placeholder="e.g. Grilled Chicken"
              />
              {itemFormErrors.name && (
                <span className="text-sm text-red-400">{itemFormErrors.name}</span>
              )}
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="item-price" className="text-sm font-medium text-zinc-300">
                Price (£) <span className="text-red-400">*</span>
              </label>
              <input
                id="item-price"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={itemForm.price}
                onChange={(e) => setItemForm((f) => ({ ...f, price: e.target.value }))}
                className="min-h-[48px] px-4 py-2 rounded-xl bg-zinc-900 text-white border border-zinc-600 focus:border-indigo-500 focus:outline-none text-base"
                placeholder="0.00"
              />
              {itemFormErrors.price && (
                <span className="text-sm text-red-400">{itemFormErrors.price}</span>
              )}
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="item-category" className="text-sm font-medium text-zinc-300">
                Category <span className="text-red-400">*</span>
              </label>
              <select
                id="item-category"
                value={itemForm.menuId}
                onChange={(e) => setItemForm((f) => ({ ...f, menuId: e.target.value }))}
                className="min-h-[48px] px-4 py-2 rounded-xl bg-zinc-900 text-white border border-zinc-600 focus:border-indigo-500 focus:outline-none text-base"
              >
                <option value="">Select category…</option>
                {menus.map((menu) => (
                  <option key={menu.id} value={menu.id}>
                    {menu.name}
                  </option>
                ))}
              </select>
              {itemFormErrors.menuId && (
                <span className="text-sm text-red-400">{itemFormErrors.menuId}</span>
              )}
            </div>
          </div>

          {/* Modifiers section */}
          <div className="flex flex-col gap-3 border-t border-zinc-700 pt-4">
            <h3 className="text-base font-semibold text-zinc-200">
              Modifiers <span className="text-zinc-500 font-normal">(optional)</span>
            </h3>

            {itemForm.modifiers.length > 0 && (
              <ul className="flex flex-col gap-2">
                {itemForm.modifiers.map((mod) => (
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
                      className="min-h-[48px] min-w-[48px] px-3 py-1 rounded-xl bg-red-900 text-red-200 text-sm font-medium hover:bg-red-800 transition-colors shrink-0"
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
                    setModifierFormError('')
                  }}
                  className="min-h-[48px] px-4 py-2 rounded-xl bg-zinc-900 text-white border border-zinc-600 focus:border-indigo-500 focus:outline-none text-base"
                  placeholder="e.g. Extra sauce"
                />
                {modifierFormError && (
                  <span className="text-sm text-red-400">{modifierFormError}</span>
                )}
              </div>
              <div className="flex flex-col gap-1 w-32">
                <label htmlFor="modifier-price" className="text-sm font-medium text-zinc-400">
                  Add-on price (£)
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
                <span className="text-sm font-medium text-zinc-400 invisible" aria-hidden="true">
                  x
                </span>
                <button
                  onClick={handleAddModifier}
                  aria-label="Add modifier"
                  className="min-h-[48px] px-4 py-2 rounded-xl bg-zinc-600 text-white text-base font-medium hover:bg-zinc-500 transition-colors shrink-0"
                >
                  + Add
                </button>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => { void (editingItemId ? handleSaveEdit() : handleAddItem()) }}
              disabled={submitting}
              className="min-h-[48px] px-5 py-2 rounded-xl bg-indigo-600 text-white text-base font-medium hover:bg-indigo-500 transition-colors disabled:opacity-50"
            >
              {editingItemId ? 'Save Changes' : 'Add Item'}
            </button>
            <button
              onClick={handleCancelItemForm}
              className="min-h-[48px] px-5 py-2 rounded-xl bg-zinc-700 text-white text-base font-medium hover:bg-zinc-600 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Menu items grouped by category */}
      {menus.map((menu) => {
        const isEditingThisCategory = editingCategoryId === menu.id
        const isDeletingThisCategory = deletingCategoryId === menu.id

        return (
          <section key={menu.id}>
            {isEditingThisCategory ? (
              <div className="flex items-center gap-3 mb-3">
                <input
                  type="text"
                  value={editingCategoryName}
                  onChange={(e) => {
                    setEditingCategoryName(e.target.value)
                    setEditingCategoryNameError('')
                  }}
                  aria-label="Edit category name"
                  className="min-h-[48px] px-4 py-2 rounded-xl bg-zinc-900 text-white border border-zinc-600 focus:border-indigo-500 focus:outline-none text-base font-semibold uppercase tracking-wide flex-1"
                />
                {editingCategoryNameError && (
                  <span className="text-sm text-red-400">{editingCategoryNameError}</span>
                )}
                <button
                  onClick={() => { void handleSaveEditCategory() }}
                  disabled={submitting}
                  className="min-h-[48px] px-4 py-2 rounded-xl bg-indigo-600 text-white text-base font-medium hover:bg-indigo-500 transition-colors shrink-0 disabled:opacity-50"
                >
                  Save
                </button>
                <button
                  onClick={handleCancelEditCategory}
                  className="min-h-[48px] px-4 py-2 rounded-xl bg-zinc-700 text-white text-base font-medium hover:bg-zinc-600 transition-colors shrink-0"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3 mb-3">
                <h2 className="text-lg font-semibold text-zinc-300 uppercase tracking-wide flex-1">
                  {menu.name}
                </h2>
                {isDeletingThisCategory ? (
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm text-red-400">Delete category?</span>
                    <button
                      onClick={() => { void handleDeleteCategoryConfirm() }}
                      disabled={submitting}
                      aria-label={`Confirm delete category ${menu.name}`}
                      className="min-h-[48px] px-4 py-2 rounded-xl bg-red-700 text-white text-base font-medium hover:bg-red-600 transition-colors disabled:opacity-50"
                    >
                      Yes
                    </button>
                    <button
                      onClick={() => setDeletingCategoryId(null)}
                      aria-label="Cancel delete category"
                      className="min-h-[48px] px-4 py-2 rounded-xl bg-zinc-700 text-white text-base font-medium hover:bg-zinc-600 transition-colors"
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => handleStartEditCategory(menu)}
                      aria-label={`Edit category ${menu.name}`}
                      className="min-h-[48px] px-4 py-2 rounded-xl bg-zinc-700 text-white text-base font-medium hover:bg-zinc-600 transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => setDeletingCategoryId(menu.id)}
                      aria-label={`Delete category ${menu.name}`}
                      className="min-h-[48px] px-4 py-2 rounded-xl bg-red-900 text-red-200 text-base font-medium hover:bg-red-800 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            )}

            {menu.items.length === 0 ? (
              <p className="text-zinc-500 text-base px-2">No items in this category.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {menu.items.map((item) => (
                  <div
                    key={item.id}
                    className="bg-zinc-800 border border-zinc-700 rounded-2xl px-5 py-4 flex items-center gap-4"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-base font-semibold text-white truncate">{item.name}</div>
                      {item.modifiers.length > 0 && (
                        <div className="text-sm text-zinc-500 truncate">
                          {item.modifiers.length} modifier{item.modifiers.length !== 1 ? 's' : ''}
                        </div>
                      )}
                    </div>
                    <div className="text-lg font-bold text-indigo-300 shrink-0">
                      {formatCurrency(item.price_cents)}
                    </div>
                    <button
                      onClick={() => handleStartEdit(item, menu.id)}
                      aria-label={`Edit ${item.name}`}
                      className="min-h-[48px] min-w-[48px] px-4 py-2 rounded-xl bg-zinc-700 text-white text-base font-medium hover:bg-zinc-600 transition-colors shrink-0"
                    >
                      Edit
                    </button>
                    {deletingItemId === item.id ? (
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-sm text-red-400">Delete?</span>
                        <button
                          onClick={() => { void handleDeleteConfirm() }}
                          disabled={submitting}
                          aria-label={`Confirm delete ${item.name}`}
                          className="min-h-[48px] min-w-[48px] px-4 py-2 rounded-xl bg-red-700 text-white text-base font-medium hover:bg-red-600 transition-colors disabled:opacity-50"
                        >
                          Yes
                        </button>
                        <button
                          onClick={() => setDeletingItemId(null)}
                          aria-label="Cancel delete"
                          className="min-h-[48px] min-w-[48px] px-4 py-2 rounded-xl bg-zinc-700 text-white text-base font-medium hover:bg-zinc-600 transition-colors"
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeletingItemId(item.id)}
                        aria-label={`Delete ${item.name}`}
                        className="min-h-[48px] min-w-[48px] px-4 py-2 rounded-xl bg-red-900 text-red-200 text-base font-medium hover:bg-red-800 transition-colors shrink-0"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        )
      })}

      {menus.length === 0 && (
        <p className="text-zinc-500 text-base">No categories yet. Add a category to get started.</p>
      )}
    </div>
  )
}
