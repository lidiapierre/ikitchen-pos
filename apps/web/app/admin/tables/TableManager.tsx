'use client'

import { useState, useEffect, useRef } from 'react'
import type { JSX } from 'react'
import { fetchAdminTables, fetchRestaurantId } from './tableAdminData'
import type { AdminTable } from './tableAdminData'
import { callCreateTable, callUpdateTable, callDeleteTable } from './tableAdminApi'
import { useUser } from '@/lib/user-context'

interface TableFormValues {
  label: string
  seatCount: string
}

interface TableFormErrors {
  label?: string
  seatCount?: string
}

type FeedbackType = 'success' | 'error'

interface Feedback {
  type: FeedbackType
  message: string
}

const EMPTY_FORM: TableFormValues = { label: '', seatCount: '' }

function validateForm(form: TableFormValues): TableFormErrors {
  const errors: TableFormErrors = {}
  if (!form.label.trim()) errors.label = 'Table label is required'
  if (!form.seatCount.trim()) {
    errors.seatCount = 'Seat count is required'
  } else {
    const n = parseInt(form.seatCount, 10)
    if (isNaN(n) || n < 1 || !Number.isInteger(n)) {
      errors.seatCount = 'Enter a valid seat count (1 or more)'
    }
  }
  return errors
}

export default function TableManager(): JSX.Element {
  const { accessToken: _at } = useUser(); const accessToken = _at ?? ''
  const [tables, setTables] = useState<AdminTable[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const supabaseConfig = useRef<{ url: string } | null>(null)
  const restaurantIdRef = useRef<string>('')

  const [showAddForm, setShowAddForm] = useState(false)
  const [addForm, setAddForm] = useState<TableFormValues>(EMPTY_FORM)
  const [addFormErrors, setAddFormErrors] = useState<TableFormErrors>({})

  const [editingTableId, setEditingTableId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<TableFormValues>(EMPTY_FORM)
  const [editFormErrors, setEditFormErrors] = useState<TableFormErrors>({})

  const [deletingTableId, setDeletingTableId] = useState<string | null>(null)

  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!supabaseUrl || !accessToken) {
      setFetchError('API not configured')
      setLoading(false)
      return
    }
    supabaseConfig.current = { url: supabaseUrl }

    Promise.all([
      fetchRestaurantId(supabaseUrl, accessToken),
      fetchAdminTables(supabaseUrl, accessToken),
    ])
      .then(([restaurantId, data]) => {
        restaurantIdRef.current = restaurantId
        setTables(data)
      })
      .catch((err: unknown) => {
        setFetchError(err instanceof Error ? err.message : 'Failed to load tables')
      })
      .finally(() => {
        setLoading(false)
      })
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
    feedbackTimerRef.current = setTimeout(() => setFeedback(null), 3000)
  }

  async function handleAddTable(): Promise<void> {
    const errors = validateForm(addForm)
    if (Object.keys(errors).length > 0) {
      setAddFormErrors(errors)
      return
    }
    const config = supabaseConfig.current
    if (!config) return
    setSubmitting(true)
    try {
      const seatCount = parseInt(addForm.seatCount, 10)
      const tableId = await callCreateTable(
        config.url,
        accessToken ?? '',
        restaurantIdRef.current,
        addForm.label.trim(),
        seatCount,
      )
      const newTable: AdminTable = {
        id: tableId,
        label: addForm.label.trim(),
        seat_count: seatCount,
        open_order_id: null,
      }
      const addedLabel = addForm.label.trim()
      setTables((prev) => [...prev, newTable])
      setAddForm(EMPTY_FORM)
      setAddFormErrors({})
      setShowAddForm(false)
      showFeedback('success', `Table "${addedLabel}" added.`)
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : 'Failed to add table.')
    } finally {
      setSubmitting(false)
    }
  }

  function handleStartEdit(table: AdminTable): void {
    setEditingTableId(table.id)
    setEditForm({ label: table.label, seatCount: String(table.seat_count) })
    setEditFormErrors({})
    setShowAddForm(false)
    setDeletingTableId(null)
  }

  async function handleSaveEdit(): Promise<void> {
    if (!editingTableId) return
    const errors = validateForm(editForm)
    if (Object.keys(errors).length > 0) {
      setEditFormErrors(errors)
      return
    }
    const config = supabaseConfig.current
    if (!config) return
    setSubmitting(true)
    try {
      const seatCount = parseInt(editForm.seatCount, 10)
      await callUpdateTable(config.url, accessToken ?? '', editingTableId, editForm.label.trim(), seatCount)
      const updatedLabel = editForm.label.trim()
      setTables((prev) =>
        prev.map((t) =>
          t.id === editingTableId ? { ...t, label: updatedLabel, seat_count: seatCount } : t,
        ),
      )
      setEditingTableId(null)
      setEditForm(EMPTY_FORM)
      setEditFormErrors({})
      showFeedback('success', `Table "${updatedLabel}" updated.`)
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : 'Failed to update table.')
    } finally {
      setSubmitting(false)
    }
  }

  function handleCancelEdit(): void {
    setEditingTableId(null)
    setEditForm(EMPTY_FORM)
    setEditFormErrors({})
  }

  async function handleDeleteConfirm(): Promise<void> {
    if (!deletingTableId) return
    const config = supabaseConfig.current
    if (!config) return
    const tableLabel = tables.find((t) => t.id === deletingTableId)?.label
    setSubmitting(true)
    try {
      await callDeleteTable(config.url, accessToken ?? '', deletingTableId)
      setTables((prev) => prev.filter((t) => t.id !== deletingTableId))
      setDeletingTableId(null)
      showFeedback('success', tableLabel ? `Table "${tableLabel}" deleted.` : 'Table deleted.')
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : 'Failed to delete table.')
      setDeletingTableId(null)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-bold text-white">Tables</h1>
        <p className="text-zinc-400 text-base">Loading tables…</p>
      </div>
    )
  }

  if (fetchError !== null) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-bold text-white">Tables</h1>
        <p className="text-red-400 text-base">Unable to load table data. Please try again.</p>
        <p className="text-red-300 text-sm font-mono">{fetchError}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Page header */}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-white">Tables</h1>
        <button
          onClick={() => {
            setShowAddForm((v) => !v)
            setEditingTableId(null)
            setEditForm(EMPTY_FORM)
            setEditFormErrors({})
            setDeletingTableId(null)
          }}
          disabled={submitting}
          className="min-h-[48px] px-5 py-2 rounded-xl text-base font-medium bg-indigo-600 text-white hover:bg-indigo-500 transition-colors disabled:opacity-50"
        >
          + Add Table
        </button>
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

      {/* Add Table inline form */}
      {showAddForm && (
        <div className="bg-zinc-800 border border-zinc-700 rounded-2xl p-5 flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-white">New Table</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label htmlFor="add-table-label" className="text-sm font-medium text-zinc-300">
                Table Label <span className="text-red-400">*</span>
              </label>
              <input
                id="add-table-label"
                type="text"
                value={addForm.label}
                onChange={(e) => {
                  setAddForm((f) => ({ ...f, label: e.target.value }))
                  setAddFormErrors((err) => ({ ...err, label: undefined }))
                }}
                className="min-h-[48px] px-4 py-2 rounded-xl bg-zinc-900 text-white border border-zinc-600 focus:border-indigo-500 focus:outline-none text-base"
                placeholder="e.g. Table 9"
              />
              {addFormErrors.label && (
                <span className="text-sm text-red-400">{addFormErrors.label}</span>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="add-seat-count" className="text-sm font-medium text-zinc-300">
                Seat Count <span className="text-red-400">*</span>
              </label>
              <input
                id="add-seat-count"
                type="number"
                inputMode="numeric"
                min="1"
                step="1"
                value={addForm.seatCount}
                onChange={(e) => {
                  setAddForm((f) => ({ ...f, seatCount: e.target.value }))
                  setAddFormErrors((err) => ({ ...err, seatCount: undefined }))
                }}
                className="min-h-[48px] px-4 py-2 rounded-xl bg-zinc-900 text-white border border-zinc-600 focus:border-indigo-500 focus:outline-none text-base"
                placeholder="4"
              />
              {addFormErrors.seatCount && (
                <span className="text-sm text-red-400">{addFormErrors.seatCount}</span>
              )}
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => { void handleAddTable() }}
              disabled={submitting}
              className="min-h-[48px] px-5 py-2 rounded-xl bg-indigo-600 text-white text-base font-medium hover:bg-indigo-500 transition-colors disabled:opacity-50"
            >
              Add Table
            </button>
            <button
              onClick={() => {
                setShowAddForm(false)
                setAddForm(EMPTY_FORM)
                setAddFormErrors({})
              }}
              className="min-h-[48px] px-5 py-2 rounded-xl bg-zinc-700 text-white text-base font-medium hover:bg-zinc-600 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Table list */}
      {tables.length === 0 ? (
        <p className="text-zinc-500 text-base">No tables yet. Add a table to get started.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {/* Column header */}
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-4 px-5 py-2 text-sm font-medium text-zinc-400 uppercase tracking-wide">
            <span>Table</span>
            <span className="text-right w-20">Seats</span>
            <span className="text-right w-24">Status</span>
            <span className="w-36" />
          </div>

          {tables.map((table) => {
            const isEditing = editingTableId === table.id
            const isDeleting = deletingTableId === table.id
            const hasOpenOrder = table.open_order_id !== null

            if (isEditing) {
              return (
                <div
                  key={table.id}
                  className="bg-zinc-800 border border-indigo-600 rounded-2xl px-5 py-4 flex flex-col gap-4"
                >
                  <h2 className="text-base font-semibold text-white">Edit Table</h2>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1">
                      <label
                        htmlFor={`edit-label-${table.id}`}
                        className="text-sm font-medium text-zinc-300"
                      >
                        Table Label <span className="text-red-400">*</span>
                      </label>
                      <input
                        id={`edit-label-${table.id}`}
                        type="text"
                        value={editForm.label}
                        onChange={(e) => {
                          setEditForm((f) => ({ ...f, label: e.target.value }))
                          setEditFormErrors((err) => ({ ...err, label: undefined }))
                        }}
                        className="min-h-[48px] px-4 py-2 rounded-xl bg-zinc-900 text-white border border-zinc-600 focus:border-indigo-500 focus:outline-none text-base"
                      />
                      {editFormErrors.label && (
                        <span className="text-sm text-red-400">{editFormErrors.label}</span>
                      )}
                    </div>
                    <div className="flex flex-col gap-1">
                      <label
                        htmlFor={`edit-seats-${table.id}`}
                        className="text-sm font-medium text-zinc-300"
                      >
                        Seat Count <span className="text-red-400">*</span>
                      </label>
                      <input
                        id={`edit-seats-${table.id}`}
                        type="number"
                        inputMode="numeric"
                        min="1"
                        step="1"
                        value={editForm.seatCount}
                        onChange={(e) => {
                          setEditForm((f) => ({ ...f, seatCount: e.target.value }))
                          setEditFormErrors((err) => ({ ...err, seatCount: undefined }))
                        }}
                        className="min-h-[48px] px-4 py-2 rounded-xl bg-zinc-900 text-white border border-zinc-600 focus:border-indigo-500 focus:outline-none text-base"
                      />
                      {editFormErrors.seatCount && (
                        <span className="text-sm text-red-400">{editFormErrors.seatCount}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => { void handleSaveEdit() }}
                      disabled={submitting}
                      className="min-h-[48px] px-5 py-2 rounded-xl bg-indigo-600 text-white text-base font-medium hover:bg-indigo-500 transition-colors disabled:opacity-50"
                    >
                      Save Changes
                    </button>
                    <button
                      onClick={handleCancelEdit}
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
                key={table.id}
                className="bg-zinc-800 border border-zinc-700 rounded-2xl px-5 py-4 grid grid-cols-[1fr_auto_auto_auto] gap-4 items-center"
              >
                <span className="text-base font-semibold text-white">{table.label}</span>
                <span className="text-base text-zinc-300 w-20 text-right">
                  {table.seat_count} {table.seat_count === 1 ? 'seat' : 'seats'}
                </span>
                <span className="w-24 text-right">
                  {hasOpenOrder ? (
                    <span className="inline-block px-2 py-1 rounded-lg text-sm font-medium bg-amber-900 text-amber-200">
                      Occupied
                    </span>
                  ) : (
                    <span className="inline-block px-2 py-1 rounded-lg text-sm font-medium bg-green-900 text-green-200">
                      Available
                    </span>
                  )}
                </span>
                <div className="flex items-center gap-2 w-36 justify-end">
                  <button
                    onClick={() => handleStartEdit(table)}
                    aria-label={`Edit ${table.label}`}
                    disabled={submitting}
                    className="min-h-[48px] min-w-[48px] px-4 py-2 rounded-xl bg-zinc-700 text-white text-base font-medium hover:bg-zinc-600 transition-colors shrink-0 disabled:opacity-50"
                  >
                    Edit
                  </button>
                  {isDeleting ? (
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-sm text-red-400">Delete?</span>
                      <button
                        onClick={() => { void handleDeleteConfirm() }}
                        disabled={submitting}
                        aria-label={`Confirm delete ${table.label}`}
                        className="min-h-[48px] min-w-[48px] px-4 py-2 rounded-xl bg-red-700 text-white text-base font-medium hover:bg-red-600 transition-colors disabled:opacity-50"
                      >
                        Yes
                      </button>
                      <button
                        onClick={() => setDeletingTableId(null)}
                        aria-label="Cancel delete"
                        className="min-h-[48px] min-w-[48px] px-4 py-2 rounded-xl bg-zinc-700 text-white text-base font-medium hover:bg-zinc-600 transition-colors"
                      >
                        No
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDeletingTableId(table.id)}
                      aria-label={`Delete ${table.label}`}
                      disabled={hasOpenOrder || submitting}
                      title={hasOpenOrder ? 'Cannot delete a table with an open order' : undefined}
                      className="min-h-[48px] min-w-[48px] px-4 py-2 rounded-xl bg-red-900 text-red-200 text-base font-medium hover:bg-red-800 transition-colors shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
