'use client'

import { useState } from 'react'
import type { JSX } from 'react'
import { X } from 'lucide-react'

interface TableFormValues {
  label: string
  seatCount: string
}

interface TableFormErrors {
  label?: string
  seatCount?: string
}

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

interface TableDialogProps {
  mode: 'add' | 'edit'
  initialLabel?: string
  initialSeatCount?: number
  onSubmit: (label: string, seatCount: number) => Promise<void>
  onDelete?: () => Promise<void>
  onClose: () => void
  canDelete?: boolean
}

export default function TableDialog({
  mode,
  initialLabel = '',
  initialSeatCount,
  onSubmit,
  onDelete,
  onClose,
  canDelete = false,
}: TableDialogProps): JSX.Element {
  const [form, setForm] = useState<TableFormValues>({
    label: initialLabel,
    seatCount: initialSeatCount !== undefined ? String(initialSeatCount) : '',
  })
  const [errors, setErrors] = useState<TableFormErrors>({})
  const [submitting, setSubmitting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  async function handleSubmit(): Promise<void> {
    const formErrors = validateForm(form)
    if (Object.keys(formErrors).length > 0) {
      setErrors(formErrors)
      return
    }
    setSubmitting(true)
    try {
      await onSubmit(form.label.trim(), parseInt(form.seatCount, 10))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(): Promise<void> {
    if (!onDelete) return
    setSubmitting(true)
    try {
      await onDelete()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="bg-zinc-900 rounded-2xl p-6 max-w-sm w-full mx-4 flex flex-col gap-4 border border-zinc-700">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">
            {mode === 'add' ? 'Add Table' : 'Edit Table'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] text-zinc-400 hover:text-white flex items-center justify-center"
            aria-label="Close"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="table-dialog-label" className="text-sm font-medium text-zinc-300">
              Table Label <span className="text-red-400">*</span>
            </label>
            <input
              id="table-dialog-label"
              type="text"
              value={form.label}
              onChange={(e) => {
                setForm((f) => ({ ...f, label: e.target.value }))
                setErrors((err) => ({ ...err, label: undefined }))
              }}
              className="min-h-[48px] px-4 py-2 rounded-xl bg-zinc-800 text-white border border-zinc-600 focus:border-indigo-500 focus:outline-none text-base"
              placeholder="e.g. Table 9"
              autoFocus
            />
            {errors.label && <span className="text-sm text-red-400">{errors.label}</span>}
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="table-dialog-seats" className="text-sm font-medium text-zinc-300">
              Seat Count <span className="text-red-400">*</span>
            </label>
            <input
              id="table-dialog-seats"
              type="number"
              inputMode="numeric"
              min="1"
              step="1"
              value={form.seatCount}
              onChange={(e) => {
                setForm((f) => ({ ...f, seatCount: e.target.value }))
                setErrors((err) => ({ ...err, seatCount: undefined }))
              }}
              className="min-h-[48px] px-4 py-2 rounded-xl bg-zinc-800 text-white border border-zinc-600 focus:border-indigo-500 focus:outline-none text-base"
              placeholder="4"
            />
            {errors.seatCount && <span className="text-sm text-red-400">{errors.seatCount}</span>}
          </div>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => { void handleSubmit() }}
            disabled={submitting}
            className="flex-1 min-h-[44px] rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-500 transition-colors disabled:opacity-50"
          >
            {submitting ? 'Saving…' : mode === 'add' ? 'Add Table' : 'Save Changes'}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex-1 min-h-[44px] rounded-xl bg-zinc-700 text-white text-sm font-medium hover:bg-zinc-600 transition-colors"
          >
            Cancel
          </button>
        </div>

        {mode === 'edit' && canDelete && onDelete && (
          <div className="border-t border-zinc-700 pt-3">
            {showDeleteConfirm ? (
              <div className="flex items-center gap-3">
                <span className="text-sm text-red-400">Delete this table?</span>
                <button
                  type="button"
                  onClick={() => { void handleDelete() }}
                  disabled={submitting}
                  className="min-h-[44px] px-4 rounded-xl bg-red-700 text-white text-sm font-medium hover:bg-red-600 transition-colors disabled:opacity-50"
                >
                  Yes, Delete
                </button>
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  className="min-h-[44px] px-4 rounded-xl bg-zinc-700 text-white text-sm font-medium hover:bg-zinc-600 transition-colors"
                >
                  No
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={submitting}
                className="min-h-[44px] px-4 rounded-xl bg-red-900/50 text-red-300 text-sm font-medium hover:bg-red-900 transition-colors w-full"
              >
                Delete Table
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
