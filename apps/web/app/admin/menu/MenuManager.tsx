'use client'

import { useState } from 'react'
import type { JSX } from 'react'

interface Category {
  id: string
  name: string
}

interface MenuItem {
  id: string
  name: string
  description: string
  price: number
  categoryId: string
}

interface ItemFormValues {
  name: string
  price: string
  categoryId: string
  description: string
}

type FeedbackType = 'success' | 'error'

interface Feedback {
  type: FeedbackType
  message: string
}

const INITIAL_CATEGORIES: Category[] = [
  { id: 'cat-1', name: 'Starters' },
  { id: 'cat-2', name: 'Mains' },
  { id: 'cat-3', name: 'Desserts' },
  { id: 'cat-4', name: 'Drinks' },
]

const INITIAL_ITEMS: MenuItem[] = [
  { id: 'item-1', name: 'Soup of the Day', description: 'Ask your server', price: 6.50, categoryId: 'cat-1' },
  { id: 'item-2', name: 'Garlic Bread', description: 'Toasted with herb butter', price: 4.00, categoryId: 'cat-1' },
  { id: 'item-3', name: 'Grilled Chicken', description: 'With seasonal vegetables', price: 14.50, categoryId: 'cat-2' },
  { id: 'item-4', name: 'Pasta Carbonara', description: 'Creamy bacon and egg sauce', price: 12.00, categoryId: 'cat-2' },
  { id: 'item-5', name: 'Chocolate Fondant', description: 'Served with vanilla ice cream', price: 7.50, categoryId: 'cat-3' },
  { id: 'item-6', name: 'Espresso', description: '', price: 2.50, categoryId: 'cat-4' },
  { id: 'item-7', name: 'Orange Juice', description: 'Freshly squeezed', price: 3.50, categoryId: 'cat-4' },
]

const EMPTY_ITEM_FORM: ItemFormValues = {
  name: '',
  price: '',
  categoryId: '',
  description: '',
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(amount)
}

function generateId(): string {
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function validateItemForm(form: ItemFormValues): Partial<ItemFormValues> {
  const errors: Partial<ItemFormValues> = {}
  if (!form.name.trim()) errors.name = 'Name is required'
  if (!form.price.trim()) {
    errors.price = 'Price is required'
  } else if (isNaN(parseFloat(form.price)) || parseFloat(form.price) < 0) {
    errors.price = 'Enter a valid price'
  }
  if (!form.categoryId) errors.categoryId = 'Category is required'
  return errors
}

export default function MenuManager(): JSX.Element {
  const [categories, setCategories] = useState<Category[]>(INITIAL_CATEGORIES)
  const [items, setItems] = useState<MenuItem[]>(INITIAL_ITEMS)

  const [showAddItem, setShowAddItem] = useState(false)
  const [itemForm, setItemForm] = useState<ItemFormValues>(EMPTY_ITEM_FORM)
  const [itemFormErrors, setItemFormErrors] = useState<Partial<ItemFormValues>>({})

  const [showAddCategory, setShowAddCategory] = useState(false)
  const [categoryName, setCategoryName] = useState('')
  const [categoryNameError, setCategoryNameError] = useState('')

  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null)

  const [feedback, setFeedback] = useState<Feedback | null>(null)

  function showFeedback(type: FeedbackType, message: string): void {
    setFeedback({ type, message })
    setTimeout(() => setFeedback(null), 3000)
  }

  function handleAddItem(): void {
    const errors = validateItemForm(itemForm)
    if (Object.keys(errors).length > 0) {
      setItemFormErrors(errors)
      return
    }
    const newItem: MenuItem = {
      id: generateId(),
      name: itemForm.name.trim(),
      description: itemForm.description.trim(),
      price: parseFloat(parseFloat(itemForm.price).toFixed(2)),
      categoryId: itemForm.categoryId,
    }
    setItems(prev => [...prev, newItem])
    setItemForm(EMPTY_ITEM_FORM)
    setItemFormErrors({})
    setShowAddItem(false)
    showFeedback('success', `"${newItem.name}" added successfully.`)
  }

  function handleStartEdit(item: MenuItem): void {
    setEditingItemId(item.id)
    setItemForm({
      name: item.name,
      price: item.price.toFixed(2),
      categoryId: item.categoryId,
      description: item.description,
    })
    setItemFormErrors({})
    setShowAddItem(false)
    setShowAddCategory(false)
  }

  function handleSaveEdit(): void {
    if (!editingItemId) return
    const errors = validateItemForm(itemForm)
    if (Object.keys(errors).length > 0) {
      setItemFormErrors(errors)
      return
    }
    setItems(prev =>
      prev.map(item =>
        item.id === editingItemId
          ? {
              ...item,
              name: itemForm.name.trim(),
              description: itemForm.description.trim(),
              price: parseFloat(parseFloat(itemForm.price).toFixed(2)),
              categoryId: itemForm.categoryId,
            }
          : item
      )
    )
    const savedName = itemForm.name.trim()
    setEditingItemId(null)
    setItemForm(EMPTY_ITEM_FORM)
    setItemFormErrors({})
    showFeedback('success', `"${savedName}" updated successfully.`)
  }

  function handleCancelItemForm(): void {
    setShowAddItem(false)
    setEditingItemId(null)
    setItemForm(EMPTY_ITEM_FORM)
    setItemFormErrors({})
  }

  function handleDeleteConfirm(): void {
    if (!deletingItemId) return
    const item = items.find(i => i.id === deletingItemId)
    setItems(prev => prev.filter(i => i.id !== deletingItemId))
    if (editingItemId === deletingItemId) {
      setEditingItemId(null)
      setItemForm(EMPTY_ITEM_FORM)
    }
    setDeletingItemId(null)
    showFeedback('success', item ? `"${item.name}" deleted.` : 'Item deleted.')
  }

  function handleAddCategory(): void {
    if (!categoryName.trim()) {
      setCategoryNameError('Category name is required')
      return
    }
    const newCategory: Category = {
      id: generateId(),
      name: categoryName.trim(),
    }
    setCategories(prev => [...prev, newCategory])
    setCategoryName('')
    setCategoryNameError('')
    setShowAddCategory(false)
    showFeedback('success', `Category "${newCategory.name}" added.`)
  }

  const isItemFormActive = showAddItem || editingItemId !== null

  return (
    <div className="flex flex-col gap-6">
      {/* Page header */}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-white">Menu</h1>
        <div className="flex gap-3">
          <button
            onClick={() => {
              setShowAddCategory(v => !v)
              setShowAddItem(false)
              setEditingItemId(null)
              setItemForm(EMPTY_ITEM_FORM)
              setItemFormErrors({})
            }}
            className="min-h-[48px] px-5 py-2 rounded-xl text-base font-medium bg-zinc-700 text-white hover:bg-zinc-600 transition-colors"
          >
            + Add Category
          </button>
          <button
            onClick={() => {
              setShowAddItem(v => !v)
              setEditingItemId(null)
              setItemForm(EMPTY_ITEM_FORM)
              setItemFormErrors({})
              setShowAddCategory(false)
            }}
            className="min-h-[48px] px-5 py-2 rounded-xl text-base font-medium bg-indigo-600 text-white hover:bg-indigo-500 transition-colors"
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
              onChange={e => {
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
              onClick={handleAddCategory}
              className="min-h-[48px] px-5 py-2 rounded-xl bg-indigo-600 text-white text-base font-medium hover:bg-indigo-500 transition-colors"
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
                onChange={e => setItemForm(f => ({ ...f, name: e.target.value }))}
                className="min-h-[48px] px-4 py-2 rounded-xl bg-zinc-900 text-white border border-zinc-600 focus:border-indigo-500 focus:outline-none text-base"
                placeholder="e.g. Grilled Chicken"
              />
              {itemFormErrors.name && (
                <span className="text-sm text-red-400">{itemFormErrors.name}</span>
              )}
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="item-price" className="text-sm font-medium text-zinc-300">
                Price <span className="text-red-400">*</span>
              </label>
              <input
                id="item-price"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={itemForm.price}
                onChange={e => setItemForm(f => ({ ...f, price: e.target.value }))}
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
                value={itemForm.categoryId}
                onChange={e => setItemForm(f => ({ ...f, categoryId: e.target.value }))}
                className="min-h-[48px] px-4 py-2 rounded-xl bg-zinc-900 text-white border border-zinc-600 focus:border-indigo-500 focus:outline-none text-base"
              >
                <option value="">Select category…</option>
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
              {itemFormErrors.categoryId && (
                <span className="text-sm text-red-400">{itemFormErrors.categoryId}</span>
              )}
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="item-description" className="text-sm font-medium text-zinc-300">
                Description <span className="text-zinc-500">(optional)</span>
              </label>
              <input
                id="item-description"
                type="text"
                value={itemForm.description}
                onChange={e => setItemForm(f => ({ ...f, description: e.target.value }))}
                className="min-h-[48px] px-4 py-2 rounded-xl bg-zinc-900 text-white border border-zinc-600 focus:border-indigo-500 focus:outline-none text-base"
                placeholder="Optional description"
              />
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={editingItemId ? handleSaveEdit : handleAddItem}
              className="min-h-[48px] px-5 py-2 rounded-xl bg-indigo-600 text-white text-base font-medium hover:bg-indigo-500 transition-colors"
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
      {categories.map(category => {
        const categoryItems = items.filter(item => item.categoryId === category.id)
        return (
          <section key={category.id}>
            <h2 className="text-lg font-semibold text-zinc-300 uppercase tracking-wide mb-3">
              {category.name}
            </h2>
            {categoryItems.length === 0 ? (
              <p className="text-zinc-500 text-base px-2">No items in this category.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {categoryItems.map(item => (
                  <div
                    key={item.id}
                    className="bg-zinc-800 border border-zinc-700 rounded-2xl px-5 py-4 flex items-center gap-4"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-base font-semibold text-white truncate">{item.name}</div>
                      {item.description && (
                        <div className="text-sm text-zinc-400 truncate">{item.description}</div>
                      )}
                    </div>
                    <div className="text-lg font-bold text-indigo-300 shrink-0">
                      {formatCurrency(item.price)}
                    </div>
                    <button
                      onClick={() => handleStartEdit(item)}
                      aria-label={`Edit ${item.name}`}
                      className="min-h-[48px] min-w-[48px] px-4 py-2 rounded-xl bg-zinc-700 text-white text-base font-medium hover:bg-zinc-600 transition-colors shrink-0"
                    >
                      Edit
                    </button>
                    {deletingItemId === item.id ? (
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-sm text-red-400">Delete?</span>
                        <button
                          onClick={handleDeleteConfirm}
                          aria-label={`Confirm delete ${item.name}`}
                          className="min-h-[48px] min-w-[48px] px-4 py-2 rounded-xl bg-red-700 text-white text-base font-medium hover:bg-red-600 transition-colors"
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

      {categories.length === 0 && (
        <p className="text-zinc-500 text-base">No categories yet. Add a category to get started.</p>
      )}
    </div>
  )
}
