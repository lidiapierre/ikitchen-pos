'use client'

import { useState, useEffect, useRef } from 'react'
import type { JSX } from 'react'
import Link from 'next/link'
import { fetchMenuAdminData } from './menuAdminData'
import type { AdminMenu, AdminMenuItem } from './menuAdminData'
import {
  callCreateMenu,
  callUpdateMenu,
  callDeleteMenu,
  callDeleteMenuItem,
  callUpdateMenuPrinterType,
} from './menuAdminApi'
import { formatPrice, DEFAULT_CURRENCY_SYMBOL } from '@/lib/formatPrice'
import { useUser } from '@/lib/user-context'
import { invalidateMenuCache } from '@/lib/menuCache'

type FeedbackType = 'success' | 'error'

interface Feedback {
  type: FeedbackType
  message: string
}

export const formatCurrency = (cents: number): string => formatPrice(cents, DEFAULT_CURRENCY_SYMBOL)

export function generateId(): string {
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}


export default function MenuManager(): JSX.Element {
  const { accessToken: _at } = useUser(); const accessToken = _at ?? ''
  const [menus, setMenus] = useState<AdminMenu[]>([])
  const [restaurantId, setRestaurantId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const supabaseConfig = useRef<{ url: string; key: string } | null>(null)

  const [showAddCategory, setShowAddCategory] = useState(false)
  const [categoryName, setCategoryName] = useState('')
  const [categoryNameError, setCategoryNameError] = useState('')

  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null)
  const [editingCategoryName, setEditingCategoryName] = useState('')
  const [editingCategoryNameError, setEditingCategoryNameError] = useState('')
  const [deletingCategoryId, setDeletingCategoryId] = useState<string | null>(null)

  const [deletingItemId, setDeletingItemId] = useState<string | null>(null)

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
    if (!accessToken) return
    supabaseConfig.current = { url: supabaseUrl, key: supabaseKey }

    fetchMenuAdminData(supabaseUrl, supabaseKey, accessToken)
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
  }, [accessToken])

  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken])

  function showFeedback(type: FeedbackType, message: string): void {
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current)
    setFeedback({ type, message })
    feedbackTimerRef.current = setTimeout(() => setFeedback(null), 3000)
  }

  async function handleDeleteConfirm(): Promise<void> {
    if (!deletingItemId) return
    const config = supabaseConfig.current
    if (!config) return
    const itemName = menus.flatMap((m) => m.items).find((i) => i.id === deletingItemId)?.name
    setSubmitting(true)
    try {
      await callDeleteMenuItem(config.url, accessToken ?? '', deletingItemId)
      invalidateMenuCache(restaurantId !== '' ? restaurantId : undefined)
      setMenus((prev) =>
        prev.map((menu) => ({
          ...menu,
          items: menu.items.filter((item) => item.id !== deletingItemId),
        })),
      )
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
      invalidateMenuCache(restaurantId !== '' ? restaurantId : undefined)
      const newMenu: AdminMenu = {
        id: menuId,
        name: categoryName.trim(),
        restaurant_id: restaurantId,
        printer_type: 'kitchen',
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
      invalidateMenuCache(restaurantId !== '' ? restaurantId : undefined)
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
      invalidateMenuCache(restaurantId !== '' ? restaurantId : undefined)
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
        <p className="text-red-300 text-sm font-mono">{fetchError}</p>
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
            }}
            disabled={submitting}
            className="min-h-[48px] px-5 py-2 rounded-xl text-base font-medium bg-zinc-700 text-white hover:bg-zinc-600 transition-colors disabled:opacity-50"
          >
            + Add Category
          </button>
          <Link
            href="/admin/menu/import"
            className="min-h-[48px] px-5 py-2 rounded-xl text-base font-medium bg-amber-600 text-white hover:bg-amber-500 transition-colors flex items-center"
          >
            ↑ Import Menu
          </Link>
          <Link
            href="/admin/menu/new"
            className="min-h-[48px] px-5 py-2 rounded-xl text-base font-medium bg-indigo-600 text-white hover:bg-indigo-500 transition-colors flex items-center"
          >
            + New Item
          </Link>
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
                <div className="flex items-center gap-2 flex-1 flex-wrap">
                  <h2 className="text-lg font-semibold text-zinc-300 uppercase tracking-wide">
                    {menu.name}
                  </h2>
                  {/* Printer type selector for this category */}
                  <div className="flex gap-1">
                    {(['kitchen', 'cashier', 'bar'] as const).map((pt) => (
                      <button
                        key={pt}
                        type="button"
                        disabled={submitting}
                        onClick={() => {
                          const config = supabaseConfig.current
                          if (!config) return
                          setSubmitting(true)
                          void callUpdateMenuPrinterType(config.url, config.key, menu.id, pt)
                            .then(() => {
                              setMenus((prev) =>
                                prev.map((m) => m.id === menu.id ? { ...m, printer_type: pt } : m),
                              )
                            })
                            .catch((err: unknown) => {
                              showFeedback('error', err instanceof Error ? err.message : 'Failed to update printer type')
                            })
                            .finally(() => { setSubmitting(false) })
                        }}
                        className={[
                          'text-xs px-2 py-0.5 rounded-full border font-medium transition-colors',
                          menu.printer_type === pt
                            ? 'bg-indigo-700 border-indigo-500 text-indigo-100'
                            : 'bg-zinc-800 border-zinc-600 text-zinc-400 hover:border-zinc-400',
                        ].join(' ')}
                        title={`Route KOT for this menu to the ${pt} printer`}
                      >
                        {pt}
                      </button>
                    ))}
                  </div>
                </div>
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
                {menu.items.map((item: AdminMenuItem) => (
                  <div
                    key={item.id}
                    className="bg-zinc-800 border border-zinc-700 rounded-2xl px-5 py-4 flex items-center gap-4"
                  >
                    {item.image_url && (
                      <img
                        src={item.image_url}
                        alt={item.name}
                        className="h-12 w-12 rounded-xl object-cover shrink-0"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-base font-semibold text-white truncate">{item.name}</div>
                      {item.description && (
                        <div className="text-sm text-zinc-400 truncate">{item.description}</div>
                      )}
                      {item.modifiers.length > 0 && (
                        <div className="text-sm text-zinc-500 truncate">
                          {item.modifiers.length} modifier{item.modifiers.length !== 1 ? 's' : ''}
                        </div>
                      )}
                    </div>
                    <div className="text-lg font-bold text-indigo-300 shrink-0">
                      {formatPrice(item.price_cents, DEFAULT_CURRENCY_SYMBOL)}
                    </div>
                    <Link
                      href={`/admin/menu/${item.id}/edit`}
                      aria-label={`Edit ${item.name}`}
                      className="min-h-[48px] min-w-[48px] px-4 py-2 rounded-xl bg-zinc-700 text-white text-base font-medium hover:bg-zinc-600 transition-colors shrink-0 flex items-center justify-center"
                    >
                      Edit
                    </Link>
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
