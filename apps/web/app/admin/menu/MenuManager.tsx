'use client'

import { useState } from 'react'
import type { JSX } from 'react'

interface Modifier {
  id: string
  name: string
  price: number
}

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
  modifiers: Modifier[]
}

interface ItemFormValues {
  name: string
  price: string
  categoryId: string
  description: string
  modifiers: Modifier[]
}

interface ItemFormErrors {
  name?: string
  price?: string
  categoryId?: string
  description?: string
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

const INITIAL_CATEGORIES: Category[] = [
  { id: 'cat-1', name: 'Starters' },
  { id: 'cat-2', name: 'Mains' },
  { id: 'cat-3', name: 'Desserts' },
  { id: 'cat-4', name: 'Drinks' },
]

const INITIAL_ITEMS: MenuItem[] = [
  { id: 'item-1', name: 'Soup of the Day', description: 'Ask your server', price: 6.50, categoryId: 'cat-1', modifiers: [] },
  { id: 'item-2', name: 'Garlic Bread', description: 'Toasted with herb butter', price: 4.00, categoryId: 'cat-1', modifiers: [] },
  {
    id: 'item-3', name: 'Grilled Chicken', description: 'With seasonal vegetables', price: 14.50, categoryId: 'cat-2',
    modifiers: [{ id: 'mod-1', name: 'Extra sauce', price: 0.50 }],
  },
  { id: 'item-4', name: 'Pasta Carbonara', description: 'Creamy bacon and egg sauce', price: 12.00, categoryId: 'cat-2', modifiers: [] },
  { id: 'item-5', name: 'Chocolate Fondant', description: 'Served with vanilla ice cream', price: 7.50, categoryId: 'cat-3', modifiers: [] },
  {
    id: 'item-6', name: 'Espresso', description: '', price: 2.50, categoryId: 'cat-4',
    modifiers: [{ id: 'mod-2', name: 'Double shot', price: 0.70 }],
  },
  { id: 'item-7', name: 'Orange Juice', description: 'Freshly squeezed', price: 3.50, categoryId: 'cat-4', modifiers: [] },
]

const EMPTY_ITEM_FORM: ItemFormValues = {
  name: '',
  price: '',
  categoryId: '',
  description: '',
  modifiers: [],
}

const EMPTY_MODIFIER_FORM: ModifierFormValues = {
  name: '',
  price: '',
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(amount)
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
  if (!form.categoryId) errors.categoryId = 'Category is required'
  return errors
}

export default function MenuManager(): JSX.Element {
  const [categories, setCategories] = useState<Category[]>(INITIAL_CATEGORIES)
  const [items, setItems] = useState<MenuItem[]>(INITIAL_ITEMS)

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

  function showFeedback(type: FeedbackType, message: string): void {
    setFeedback({ type, message })
    setTimeout(() => setFeedback(null), 3000)
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
    const newModifier: Modifier = {
      id: generateId(),
      name: modifierForm.name.trim(),
      price: parseFloat(price.toFixed(2)),
    }
    setItemForm(f => ({ ...f, modifiers: [...f.modifiers, newModifier] }))
    setModifierForm(EMPTY_MODIFIER_FORM)
    setModifierFormError('')
  }

  function handleRemoveModifier(modifierId: string): void {
    setItemForm(f => ({ ...f, modifiers: f.modifiers.filter(m => m.id !== modifierId) }))
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
      modifiers: itemForm.modifiers,
    }
    setItems(prev => [...prev, newItem])
    setItemForm(EMPTY_ITEM_FORM)
    setItemFormErrors({})
    setModifierForm(EMPTY_MODIFIER_FORM)
    setModifierFormError('')
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
      modifiers: item.modifiers,
    })
    setItemFormErrors({})
    setModifierForm(EMPTY_MODIFIER_FORM)
    setModifierFormError('')
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
              modifiers: itemForm.modifiers,
            }
          : item
      )
    )
    const savedName = itemForm.name.trim()
    setEditingItemId(null)
    setItemForm(EMPTY_ITEM_FORM)
    setItemFormErrors({})
    setModifierForm(EMPTY_MODIFIER_FORM)
    setModifierFormError('')
    showFeedback('success', `"${savedName}" updated successfully.`)
  }

  function handleCancelItemForm(): void {
    setShowAddItem(false)
    setEditingItemId(null)
    setItemForm(EMPTY_ITEM_FORM)
    setItemFormErrors({})
    setModifierForm(EMPTY_MODIFIER_FORM)
    setModifierFormError('')
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

  function handleStartEditCategory(category: Category): void {
    setEditingCategoryId(category.id)
    setEditingCategoryName(category.name)
    setEditingCategoryNameError('')
    setDeletingCategoryId(null)
  }

  function handleSaveEditCategory(): void {
    if (!editingCategoryName.trim()) {
      setEditingCategoryNameError('Category name is required')
      return
    }
    const newName = editingCategoryName.trim()
    setCategories(prev =>
      prev.map(cat => (cat.id === editingCategoryId ? { ...cat, name: newName } : cat))
    )
    setEditingCategoryId(null)
    setEditingCategoryName('')
    setEditingCategoryNameError('')
    showFeedback('success', `Category renamed to "${newName}".`)
  }

  function handleCancelEditCategory(): void {
    setEditingCategoryId(null)
    setEditingCategoryName('')
    setEditingCategoryNameError('')
  }

  function handleDeleteCategoryConfirm(): void {
    if (!deletingCategoryId) return
    const categoryItems = items.filter(i => i.categoryId === deletingCategoryId)
    if (categoryItems.length > 0) {
      showFeedback('error', 'Remove all items in this category before deleting it.')
      setDeletingCategoryId(null)
      return
    }
    const category = categories.find(c => c.id === deletingCategoryId)
    setCategories(prev => prev.filter(c => c.id !== deletingCategoryId))
    setDeletingCategoryId(null)
    showFeedback('success', category ? `Category "${category.name}" deleted.` : 'Category deleted.')
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
              setModifierForm(EMPTY_MODIFIER_FORM)
              setModifierFormError('')
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

          {/* Modifiers section */}
          <div className="flex flex-col gap-3 border-t border-zinc-700 pt-4">
            <h3 className="text-base font-semibold text-zinc-200">
              Modifiers <span className="text-zinc-500 font-normal">(optional)</span>
            </h3>

            {itemForm.modifiers.length > 0 && (
              <ul className="flex flex-col gap-2">
                {itemForm.modifiers.map(mod => (
                  <li key={mod.id} className="flex items-center gap-3 bg-zinc-900 rounded-xl px-4 py-2">
                    <span className="flex-1 text-base text-white">{mod.name}</span>
                    <span className="text-base text-indigo-300 shrink-0">
                      {mod.price > 0 ? `+${formatCurrency(mod.price)}` : 'Free'}
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
                  onChange={e => {
                    setModifierForm(f => ({ ...f, name: e.target.value }))
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
                  onChange={e => setModifierForm(f => ({ ...f, price: e.target.value }))}
                  className="min-h-[48px] px-4 py-2 rounded-xl bg-zinc-900 text-white border border-zinc-600 focus:border-indigo-500 focus:outline-none text-base"
                  placeholder="0.00"
                />
              </div>
              <div className="flex flex-col gap-1 justify-end">
                <span className="text-sm font-medium text-zinc-400 invisible" aria-hidden="true">x</span>
                <button
                  onClick={handleAddModifier}
                  className="min-h-[48px] px-4 py-2 rounded-xl bg-zinc-600 text-white text-base font-medium hover:bg-zinc-500 transition-colors shrink-0"
                >
                  + Add
                </button>
              </div>
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
        const isEditingThisCategory = editingCategoryId === category.id
        const isDeletingThisCategory = deletingCategoryId === category.id

        return (
          <section key={category.id}>
            {isEditingThisCategory ? (
              <div className="flex items-center gap-3 mb-3">
                <input
                  type="text"
                  value={editingCategoryName}
                  onChange={e => {
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
                  onClick={handleSaveEditCategory}
                  className="min-h-[48px] px-4 py-2 rounded-xl bg-indigo-600 text-white text-base font-medium hover:bg-indigo-500 transition-colors shrink-0"
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
                  {category.name}
                </h2>
                {isDeletingThisCategory ? (
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm text-red-400">Delete category?</span>
                    <button
                      onClick={handleDeleteCategoryConfirm}
                      aria-label={`Confirm delete category ${category.name}`}
                      className="min-h-[48px] px-4 py-2 rounded-xl bg-red-700 text-white text-base font-medium hover:bg-red-600 transition-colors"
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
                      onClick={() => handleStartEditCategory(category)}
                      aria-label={`Edit category ${category.name}`}
                      className="min-h-[48px] px-4 py-2 rounded-xl bg-zinc-700 text-white text-base font-medium hover:bg-zinc-600 transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => setDeletingCategoryId(category.id)}
                      aria-label={`Delete category ${category.name}`}
                      className="min-h-[48px] px-4 py-2 rounded-xl bg-red-900 text-red-200 text-base font-medium hover:bg-red-800 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            )}

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
                      {item.modifiers.length > 0 && (
                        <div className="text-sm text-zinc-500 truncate">
                          {item.modifiers.length} modifier{item.modifiers.length !== 1 ? 's' : ''}
                        </div>
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
