'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import type { JSX } from 'react'
import { useUser } from '@/lib/user-context'
import {
  fetchIngredients,
  createIngredient,
  updateIngredient,
  deleteIngredient,
  fetchAllRecipeItems,
  upsertRecipeItem,
  deleteRecipeItem,
  fetchStockAdjustments,
  createStockAdjustment,
  fetchMenuItems,
  type Ingredient,
  type RecipeItem,
  type StockAdjustment,
  type MenuItem,
} from './inventoryApi'

type Tab = 'ingredients' | 'recipes' | 'adjustments'

type FeedbackType = 'success' | 'error'
interface Feedback {
  type: FeedbackType
  message: string
}

const UNITS = ['g', 'kg', 'L', 'ml', 'pcs'] as const

// ── Helpers ───────────────────────────────────────────────────────────────────

function isLowStock(ing: Ingredient): boolean {
  return ing.current_stock <= ing.low_stock_threshold && ing.low_stock_threshold > 0
}

function formatQty(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/\.?0+$/, '')
}

// ── Main component ────────────────────────────────────────────────────────────

export default function InventoryManager(): JSX.Element {
  useUser() // ensures user context is initialized
  const [tab, setTab] = useState<Tab>('ingredients')
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const [restaurantId, setRestaurantId] = useState('')
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [recipeItems, setRecipeItems] = useState<RecipeItem[]>([])
  const [adjustments, setAdjustments] = useState<StockAdjustment[]>([])
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ''

  function showFeedback(type: FeedbackType, message: string): void {
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current)
    setFeedback({ type, message })
    feedbackTimerRef.current = setTimeout(() => setFeedback(null), 4000)
  }

  // ── Data loading ──────────────────────────────────────────────────────────

  const loadData = useCallback(
    async (restId: string) => {
      const [ings, recs, adjs, menus] = await Promise.all([
        fetchIngredients(supabaseUrl, supabaseKey, restId),
        fetchAllRecipeItems(supabaseUrl, supabaseKey),
        fetchStockAdjustments(supabaseUrl, supabaseKey, restId),
        fetchMenuItems(supabaseUrl, supabaseKey, restId),
      ])
      setIngredients(ings)
      setRecipeItems(recs)
      setAdjustments(adjs)
      setMenuItems(menus)
    },
    [supabaseUrl, supabaseKey],
  )

  useEffect(() => {
    if (!supabaseUrl || !supabaseKey) {
      setFetchError('API not configured')
      setLoading(false)
      return
    }
    // Fetch restaurant id first
    fetch(`${supabaseUrl}/rest/v1/restaurants?select=id&limit=1`, {
      headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
    })
      .then((r) => r.json() as Promise<Array<{ id: string }>>)
      .then(async (rows) => {
        if (!rows || rows.length === 0) throw new Error('No restaurant found')
        const restId = rows[0].id
        setRestaurantId(restId)
        await loadData(restId)
      })
      .catch((err: unknown) => {
        setFetchError(err instanceof Error ? err.message : 'Failed to load inventory data')
      })
      .finally(() => setLoading(false))

    return () => {
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current)
    }
  }, [supabaseUrl, supabaseKey, loadData])

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-bold text-white">Inventory</h1>
        <p className="text-zinc-400">Loading…</p>
      </div>
    )
  }

  if (fetchError) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-bold text-white">Inventory</h1>
        <p className="text-red-400">{fetchError}</p>
      </div>
    )
  }

  const lowStockCount = ingredients.filter(isLowStock).length

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-white">Inventory</h1>
          {lowStockCount > 0 && (
            <span className="text-xs font-bold bg-red-700 text-red-100 px-2 py-1 rounded-full">
              {lowStockCount} low stock
            </span>
          )}
        </div>
      </div>

      {/* Feedback */}
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

      {/* Tabs */}
      <div className="flex gap-1 bg-zinc-800 p-1 rounded-xl w-fit">
        {(
          [
            { id: 'ingredients', label: '🥩 Ingredients' },
            { id: 'recipes', label: '📋 Recipes' },
            { id: 'adjustments', label: '📦 Adjustments' },
          ] as { id: Tab; label: string }[]
        ).map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={[
              'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              tab === id
                ? 'bg-indigo-600 text-white'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-700',
            ].join(' ')}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'ingredients' && (
        <IngredientsTab
          ingredients={ingredients}
          restaurantId={restaurantId}
          supabaseUrl={supabaseUrl}
          supabaseKey={supabaseKey}
          submitting={submitting}
          setSubmitting={setSubmitting}
          showFeedback={showFeedback}
          onRefresh={() => { void loadData(restaurantId) }}
        />
      )}

      {tab === 'recipes' && (
        <RecipesTab
          ingredients={ingredients}
          menuItems={menuItems}
          recipeItems={recipeItems}
          supabaseUrl={supabaseUrl}
          supabaseKey={supabaseKey}
          submitting={submitting}
          setSubmitting={setSubmitting}
          showFeedback={showFeedback}
          onRefresh={() => { void loadData(restaurantId) }}
        />
      )}

      {tab === 'adjustments' && (
        <AdjustmentsTab
          ingredients={ingredients}
          adjustments={adjustments}
          restaurantId={restaurantId}
          supabaseUrl={supabaseUrl}
          supabaseKey={supabaseKey}
          submitting={submitting}
          setSubmitting={setSubmitting}
          showFeedback={showFeedback}
          onRefresh={() => { void loadData(restaurantId) }}
        />
      )}
    </div>
  )
}

// ── Ingredients Tab ───────────────────────────────────────────────────────────

interface IngredientsTabProps {
  ingredients: Ingredient[]
  restaurantId: string
  supabaseUrl: string
  supabaseKey: string
  submitting: boolean
  setSubmitting: (v: boolean) => void
  showFeedback: (type: FeedbackType, msg: string) => void
  onRefresh: () => void
}

function IngredientsTab({
  ingredients,
  restaurantId,
  supabaseUrl,
  supabaseKey,
  submitting,
  setSubmitting,
  showFeedback,
  onRefresh,
}: IngredientsTabProps): JSX.Element {
  const [showAdd, setShowAdd] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Form state for add/edit
  const emptyForm: IngredientFormState = { name: '', unit: 'pcs', current_stock: '', low_stock_threshold: '' }
  const [form, setForm] = useState<IngredientFormState>(emptyForm)
  const [formError, setFormError] = useState('')

  function validateForm(): boolean {
    if (!form.name.trim()) { setFormError('Name is required'); return false }
    if (isNaN(Number(form.current_stock))) { setFormError('Current stock must be a number'); return false }
    if (isNaN(Number(form.low_stock_threshold))) { setFormError('Threshold must be a number'); return false }
    setFormError('')
    return true
  }

  async function handleAdd(): Promise<void> {
    if (!validateForm()) return
    setSubmitting(true)
    try {
      await createIngredient(supabaseUrl, supabaseKey, {
        restaurant_id: restaurantId,
        name: form.name.trim(),
        unit: form.unit,
        current_stock: Number(form.current_stock),
        low_stock_threshold: Number(form.low_stock_threshold),
      })
      setForm(emptyForm)
      setShowAdd(false)
      showFeedback('success', `"${form.name.trim()}" added.`)
      onRefresh()
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : 'Failed to add ingredient')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleUpdate(): Promise<void> {
    if (!editingId || !validateForm()) return
    setSubmitting(true)
    try {
      await updateIngredient(supabaseUrl, supabaseKey, editingId, {
        name: form.name.trim(),
        unit: form.unit,
        current_stock: Number(form.current_stock),
        low_stock_threshold: Number(form.low_stock_threshold),
      })
      setEditingId(null)
      showFeedback('success', 'Ingredient updated.')
      onRefresh()
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : 'Failed to update ingredient')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(): Promise<void> {
    if (!deletingId) return
    setSubmitting(true)
    try {
      await deleteIngredient(supabaseUrl, supabaseKey, deletingId)
      setDeletingId(null)
      showFeedback('success', 'Ingredient deleted.')
      onRefresh()
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : 'Failed to delete ingredient')
      setDeletingId(null)
    } finally {
      setSubmitting(false)
    }
  }

  function startEdit(ing: Ingredient): void {
    setEditingId(ing.id)
    setForm({
      name: ing.name,
      unit: ing.unit,
      current_stock: String(ing.current_stock),
      low_stock_threshold: String(ing.low_stock_threshold),
    })
    setFormError('')
    setShowAdd(false)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <button
          onClick={() => { setShowAdd((v) => !v); setEditingId(null); setForm(emptyForm); setFormError('') }}
          className="min-h-[48px] px-5 py-2 rounded-xl bg-indigo-600 text-white font-medium hover:bg-indigo-500 transition-colors"
        >
          + Add Ingredient
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <IngredientForm
          form={form}
          setForm={setForm}
          formError={formError}
          submitting={submitting}
          onSave={() => { void handleAdd() }}
          onCancel={() => { setShowAdd(false); setForm(emptyForm); setFormError('') }}
          title="New Ingredient"
          saveLabel="Add"
        />
      )}

      {/* Table header */}
      <div className="hidden sm:grid grid-cols-[1fr_80px_100px_120px_140px] gap-4 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        <span>Name</span>
        <span>Unit</span>
        <span className="text-right">Stock</span>
        <span className="text-right">Threshold</span>
        <span />
      </div>

      {ingredients.length === 0 && (
        <p className="text-zinc-500 px-2">No ingredients yet. Add one above.</p>
      )}

      {ingredients.map((ing) => {
        const low = isLowStock(ing)
        const isEditing = editingId === ing.id
        const isDeleting = deletingId === ing.id

        return (
          <div
            key={ing.id}
            className={[
              'bg-zinc-800 border rounded-2xl px-5 py-4 flex flex-col gap-3',
              low ? 'border-red-600' : 'border-zinc-700',
            ].join(' ')}
          >
            {isEditing ? (
              <IngredientForm
                form={form}
                setForm={setForm}
                formError={formError}
                submitting={submitting}
                onSave={() => { void handleUpdate() }}
                onCancel={() => { setEditingId(null); setForm(emptyForm); setFormError('') }}
                title={`Edit: ${ing.name}`}
                saveLabel="Save"
              />
            ) : (
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-base font-semibold text-white">{ing.name}</span>
                    {low && (
                      <span className="text-xs font-bold bg-red-700 text-red-100 px-2 py-0.5 rounded-full">
                        ⚠ Low Stock
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-zinc-400 mt-0.5">
                    Stock: <span className={low ? 'text-red-400 font-semibold' : 'text-zinc-300'}>{formatQty(ing.current_stock)} {ing.unit}</span>
                    {' · '}
                    Threshold: {formatQty(ing.low_stock_threshold)} {ing.unit}
                  </div>
                </div>

                {isDeleting ? (
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm text-red-400">Delete?</span>
                    <button onClick={() => { void handleDelete() }} disabled={submitting} className="min-h-[44px] px-4 py-2 rounded-xl bg-red-700 text-white font-medium hover:bg-red-600 disabled:opacity-50 transition-colors">Yes</button>
                    <button onClick={() => setDeletingId(null)} className="min-h-[44px] px-4 py-2 rounded-xl bg-zinc-700 text-white font-medium hover:bg-zinc-600 transition-colors">No</button>
                  </div>
                ) : (
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => startEdit(ing)} className="min-h-[44px] px-4 py-2 rounded-xl bg-zinc-700 text-white font-medium hover:bg-zinc-600 transition-colors">Edit</button>
                    <button onClick={() => setDeletingId(ing.id)} className="min-h-[44px] px-4 py-2 rounded-xl bg-red-900 text-red-200 font-medium hover:bg-red-800 transition-colors">Delete</button>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

interface IngredientFormState {
  name: string
  unit: 'g' | 'kg' | 'L' | 'ml' | 'pcs'
  current_stock: string
  low_stock_threshold: string
}

interface IngredientFormProps {
  form: IngredientFormState
  setForm: React.Dispatch<React.SetStateAction<IngredientFormState>>
  formError: string
  submitting: boolean
  onSave: () => void
  onCancel: () => void
  title: string
  saveLabel: string
}

function IngredientForm({ form, setForm, formError, submitting, onSave, onCancel, title, saveLabel }: IngredientFormProps): JSX.Element {
  return (
    <div className="bg-zinc-900 border border-zinc-600 rounded-2xl p-5 flex flex-col gap-4">
      <h3 className="text-base font-semibold text-white">{title}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-zinc-300">Name <span className="text-red-400">*</span></label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className="min-h-[48px] px-4 py-2 rounded-xl bg-zinc-800 text-white border border-zinc-600 focus:border-indigo-500 focus:outline-none"
            placeholder="e.g. Chicken Breast"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-zinc-300">Unit <span className="text-red-400">*</span></label>
          <select
            value={form.unit}
            onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value as typeof form.unit }))}
            className="min-h-[48px] px-4 py-2 rounded-xl bg-zinc-800 text-white border border-zinc-600 focus:border-indigo-500 focus:outline-none"
          >
            {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-zinc-300">Current Stock</label>
          <input
            type="number"
            value={form.current_stock}
            onChange={(e) => setForm((f) => ({ ...f, current_stock: e.target.value }))}
            min="0"
            step="any"
            className="min-h-[48px] px-4 py-2 rounded-xl bg-zinc-800 text-white border border-zinc-600 focus:border-indigo-500 focus:outline-none"
            placeholder="0"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-zinc-300">Low Stock Threshold</label>
          <input
            type="number"
            value={form.low_stock_threshold}
            onChange={(e) => setForm((f) => ({ ...f, low_stock_threshold: e.target.value }))}
            min="0"
            step="any"
            className="min-h-[48px] px-4 py-2 rounded-xl bg-zinc-800 text-white border border-zinc-600 focus:border-indigo-500 focus:outline-none"
            placeholder="0"
          />
        </div>
      </div>
      {formError && <p className="text-sm text-red-400">{formError}</p>}
      <div className="flex gap-3">
        <button onClick={onSave} disabled={submitting} className="min-h-[48px] px-5 py-2 rounded-xl bg-indigo-600 text-white font-medium hover:bg-indigo-500 disabled:opacity-50 transition-colors">{saveLabel}</button>
        <button onClick={onCancel} className="min-h-[48px] px-5 py-2 rounded-xl bg-zinc-700 text-white font-medium hover:bg-zinc-600 transition-colors">Cancel</button>
      </div>
    </div>
  )
}

// ── Recipes Tab ───────────────────────────────────────────────────────────────

interface RecipesTabProps {
  ingredients: Ingredient[]
  menuItems: MenuItem[]
  recipeItems: RecipeItem[]
  supabaseUrl: string
  supabaseKey: string
  submitting: boolean
  setSubmitting: (v: boolean) => void
  showFeedback: (type: FeedbackType, msg: string) => void
  onRefresh: () => void
}

function RecipesTab({
  ingredients,
  menuItems,
  recipeItems,
  supabaseUrl,
  supabaseKey,
  submitting,
  setSubmitting,
  showFeedback,
  onRefresh,
}: RecipesTabProps): JSX.Element {
  const [selectedMenuItemId, setSelectedMenuItemId] = useState<string>('')
  const [addIngredientId, setAddIngredientId] = useState('')
  const [addQty, setAddQty] = useState('')
  const [addError, setAddError] = useState('')

  const selectedRecipes = recipeItems.filter((r) => r.menu_item_id === selectedMenuItemId)

  async function handleAddRecipeItem(): Promise<void> {
    if (!selectedMenuItemId) { setAddError('Select a menu item first'); return }
    if (!addIngredientId) { setAddError('Select an ingredient'); return }
    const qty = Number(addQty)
    if (isNaN(qty) || qty <= 0) { setAddError('Quantity must be > 0'); return }
    setAddError('')
    setSubmitting(true)
    try {
      await upsertRecipeItem(supabaseUrl, supabaseKey, {
        menu_item_id: selectedMenuItemId,
        ingredient_id: addIngredientId,
        quantity_used: qty,
      })
      setAddIngredientId('')
      setAddQty('')
      showFeedback('success', 'Recipe item saved.')
      onRefresh()
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : 'Failed to save recipe item')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleRemove(id: string): Promise<void> {
    setSubmitting(true)
    try {
      await deleteRecipeItem(supabaseUrl, supabaseKey, id)
      showFeedback('success', 'Recipe item removed.')
      onRefresh()
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : 'Failed to remove recipe item')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Menu item selector */}
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-zinc-300">Select Menu Item</label>
        <select
          value={selectedMenuItemId}
          onChange={(e) => setSelectedMenuItemId(e.target.value)}
          className="min-h-[48px] px-4 py-2 rounded-xl bg-zinc-800 text-white border border-zinc-600 focus:border-indigo-500 focus:outline-none max-w-sm"
        >
          <option value="">— choose a menu item —</option>
          {menuItems.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      </div>

      {selectedMenuItemId && (
        <div className="flex flex-col gap-4">
          <h2 className="text-base font-semibold text-zinc-300">
            Recipe for: <span className="text-white">{menuItems.find((m) => m.id === selectedMenuItemId)?.name}</span>
          </h2>

          {/* Existing recipe items */}
          {selectedRecipes.length === 0 ? (
            <p className="text-zinc-500 text-sm">No ingredients in recipe yet.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {selectedRecipes.map((r) => (
                <div key={r.id} className="bg-zinc-800 border border-zinc-700 rounded-xl px-5 py-3 flex items-center gap-4">
                  <span className="flex-1 text-white font-medium">{r.ingredient_name ?? r.ingredient_id}</span>
                  <span className="text-zinc-300 text-sm">{formatQty(r.quantity_used)} {r.ingredient_unit ?? ''}</span>
                  <button
                    onClick={() => { void handleRemove(r.id) }}
                    disabled={submitting}
                    className="min-h-[40px] px-4 py-1.5 rounded-lg bg-red-900 text-red-200 text-sm font-medium hover:bg-red-800 disabled:opacity-50 transition-colors"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add ingredient to recipe */}
          <div className="bg-zinc-800 border border-zinc-700 rounded-2xl p-4 flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-zinc-300">Add Ingredient</h3>
            <div className="flex flex-wrap gap-3 items-end">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-zinc-400">Ingredient</label>
                <select
                  value={addIngredientId}
                  onChange={(e) => setAddIngredientId(e.target.value)}
                  className="min-h-[44px] px-3 py-2 rounded-xl bg-zinc-900 text-white border border-zinc-600 focus:border-indigo-500 focus:outline-none text-sm"
                >
                  <option value="">— select —</option>
                  {ingredients.map((i) => (
                    <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-zinc-400">Qty per portion</label>
                <input
                  type="number"
                  value={addQty}
                  onChange={(e) => setAddQty(e.target.value)}
                  min="0.001"
                  step="any"
                  placeholder="0"
                  className="min-h-[44px] w-28 px-3 py-2 rounded-xl bg-zinc-900 text-white border border-zinc-600 focus:border-indigo-500 focus:outline-none text-sm"
                />
              </div>
              <button
                onClick={() => { void handleAddRecipeItem() }}
                disabled={submitting}
                className="min-h-[44px] px-5 py-2 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-500 disabled:opacity-50 transition-colors"
              >
                Add
              </button>
            </div>
            {addError && <p className="text-sm text-red-400">{addError}</p>}
          </div>
        </div>
      )}

      {menuItems.length === 0 && (
        <p className="text-zinc-500 text-sm">No menu items found. Add menu items first.</p>
      )}
    </div>
  )
}

// ── Adjustments Tab ───────────────────────────────────────────────────────────

interface AdjustmentsTabProps {
  ingredients: Ingredient[]
  adjustments: StockAdjustment[]
  restaurantId: string
  supabaseUrl: string
  supabaseKey: string
  submitting: boolean
  setSubmitting: (v: boolean) => void
  showFeedback: (type: FeedbackType, msg: string) => void
  onRefresh: () => void
}

function AdjustmentsTab({
  ingredients,
  adjustments,
  restaurantId,
  supabaseUrl,
  supabaseKey,
  submitting,
  setSubmitting,
  showFeedback,
  onRefresh,
}: AdjustmentsTabProps): JSX.Element {
  const [form, setForm] = useState({
    ingredient_id: '',
    quantity_delta: '',
    reason: 'delivery' as 'delivery' | 'wastage' | 'manual',
  })
  const [formError, setFormError] = useState('')

  async function handleSubmit(): Promise<void> {
    if (!form.ingredient_id) { setFormError('Select an ingredient'); return }
    const delta = Number(form.quantity_delta)
    if (isNaN(delta) || delta === 0) { setFormError('Enter a non-zero quantity'); return }
    setFormError('')
    setSubmitting(true)
    try {
      await createStockAdjustment(supabaseUrl, supabaseKey, {
        restaurant_id: restaurantId,
        ingredient_id: form.ingredient_id,
        quantity_delta: delta,
        reason: form.reason,
        created_by: null, // service key call — no user JWT in this context
      })
      setForm({ ingredient_id: '', quantity_delta: '', reason: 'delivery' })
      const ingName = ingredients.find((i) => i.id === form.ingredient_id)?.name ?? ''
      showFeedback('success', `Adjustment recorded for ${ingName}.`)
      onRefresh()
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : 'Failed to record adjustment')
    } finally {
      setSubmitting(false)
    }
  }

  const REASON_LABELS: Record<string, string> = {
    sale: '🛒 Sale',
    delivery: '🚚 Delivery',
    wastage: '🗑 Wastage',
    manual: '✏️ Manual',
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Log adjustment form */}
      <div className="bg-zinc-800 border border-zinc-700 rounded-2xl p-5 flex flex-col gap-4">
        <h2 className="text-base font-semibold text-white">Log Adjustment</h2>
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-zinc-300">Ingredient</label>
            <select
              value={form.ingredient_id}
              onChange={(e) => setForm((f) => ({ ...f, ingredient_id: e.target.value }))}
              className="min-h-[48px] px-4 py-2 rounded-xl bg-zinc-900 text-white border border-zinc-600 focus:border-indigo-500 focus:outline-none"
            >
              <option value="">— select —</option>
              {ingredients.map((i) => (
                <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-zinc-300">Qty (+ add / − deduct)</label>
            <input
              type="number"
              value={form.quantity_delta}
              onChange={(e) => setForm((f) => ({ ...f, quantity_delta: e.target.value }))}
              step="any"
              placeholder="e.g. 5 or -2"
              className="min-h-[48px] w-36 px-4 py-2 rounded-xl bg-zinc-900 text-white border border-zinc-600 focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-zinc-300">Reason</label>
            <select
              value={form.reason}
              onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value as typeof form.reason }))}
              className="min-h-[48px] px-4 py-2 rounded-xl bg-zinc-900 text-white border border-zinc-600 focus:border-indigo-500 focus:outline-none"
            >
              <option value="delivery">Delivery</option>
              <option value="wastage">Wastage</option>
              <option value="manual">Manual</option>
            </select>
          </div>
          <button
            onClick={() => { void handleSubmit() }}
            disabled={submitting}
            className="min-h-[48px] px-6 py-2 rounded-xl bg-indigo-600 text-white font-medium hover:bg-indigo-500 disabled:opacity-50 transition-colors"
          >
            Record
          </button>
        </div>
        {formError && <p className="text-sm text-red-400">{formError}</p>}
      </div>

      {/* Adjustments log */}
      <div className="flex flex-col gap-2">
        <h2 className="text-base font-semibold text-zinc-300">Recent Adjustments</h2>
        {adjustments.length === 0 ? (
          <p className="text-zinc-500 text-sm">No adjustments recorded yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {adjustments.map((adj) => (
              <div
                key={adj.id}
                className="bg-zinc-800 border border-zinc-700 rounded-xl px-5 py-3 flex items-center gap-4 flex-wrap"
              >
                <div className="flex-1 min-w-0">
                  <span className="font-semibold text-white">{adj.ingredient_name ?? adj.ingredient_id}</span>
                  <span className="text-xs text-zinc-500 ml-2">
                    {new Date(adj.created_at).toLocaleString()}
                  </span>
                </div>
                <span className={[
                  'text-sm font-bold shrink-0',
                  adj.quantity_delta > 0 ? 'text-green-400' : 'text-red-400',
                ].join(' ')}>
                  {adj.quantity_delta > 0 ? '+' : ''}{formatQty(adj.quantity_delta)}
                </span>
                <span className="text-xs bg-zinc-700 text-zinc-300 px-2 py-1 rounded-full shrink-0">
                  {REASON_LABELS[adj.reason] ?? adj.reason}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
