'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import type { JSX, ChangeEvent, DragEvent } from 'react'
import Link from 'next/link'
import { useUser } from '@/lib/user-context'
import { fetchMenuAdminData } from '../menuAdminData'
import type { AdminMenu } from '../menuAdminData'
import { callCreateMenu, callCreateMenuItem } from '../menuAdminApi'
import { callExtractMenuBulk } from './extractMenuBulkApi'
import type { ExtractedMenuItemDraft } from './extractMenuBulkApi'
import { fileToBase64 } from '../extractMenuItemApi'

type Step = 'upload' | 'review' | 'importing' | 'done'

interface DraftRow extends ExtractedMenuItemDraft {
  rowId: string
  selected: boolean
}

interface ImportResult {
  success: number
  failed: Array<{ name: string; error: string }>
}

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
const MAX_FILES = 5

function PdfIcon(): JSX.Element {
  return (
    <div className="flex items-center justify-center w-16 h-16 rounded-xl bg-zinc-700 text-zinc-300 text-xs font-bold">
      PDF
    </div>
  )
}

export default function ImportMenuClient(): JSX.Element {
  const { accessToken } = useUser()
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ''

  const [step, setStep] = useState<Step>('upload')
  const [files, setFiles] = useState<File[]>([])
  const [filePreviews, setFilePreviews] = useState<Array<string | null>>([])
  const [dragOver, setDragOver] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [extractError, setExtractError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [menus, setMenus] = useState<AdminMenu[]>([])
  const [restaurantId, setRestaurantId] = useState<string>('')
  const [rows, setRows] = useState<DraftRow[]>([])

  const [importProgress, setImportProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 })
  const [importResult, setImportResult] = useState<ImportResult | null>(null)

  // Load menu categories for suggestions
  useEffect(() => {
    if (!supabaseUrl || !supabaseKey) return
    fetchMenuAdminData(supabaseUrl, supabaseKey)
      .then((data) => {
        setMenus(data.menus)
        setRestaurantId(data.restaurantId)
      })
      .catch(() => {/* ignore, suggestions just won't appear */})
  }, [supabaseUrl, supabaseKey])

  const addFiles = useCallback((incoming: File[]) => {
    setFiles((prev) => {
      const combined = [...prev]
      const previews: Array<string | null> = [...filePreviews]
      for (const file of incoming) {
        if (combined.length >= MAX_FILES) break
        if (!ACCEPTED_TYPES.includes(file.type)) continue
        combined.push(file)
        previews.push(file.type.startsWith('image/') ? URL.createObjectURL(file) : null)
      }
      setFilePreviews(previews)
      return combined
    })
    setExtractError(null)
  }, [filePreviews])

  function handleDrop(e: DragEvent<HTMLDivElement>): void {
    e.preventDefault()
    setDragOver(false)
    const dropped = Array.from(e.dataTransfer.files)
    addFiles(dropped)
  }

  function handleFileInput(e: ChangeEvent<HTMLInputElement>): void {
    const selected = Array.from(e.target.files ?? [])
    addFiles(selected)
    // Reset so same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function removeFile(index: number): void {
    setFiles((prev) => prev.filter((_, i) => i !== index))
    setFilePreviews((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleExtract(): Promise<void> {
    if (files.length === 0) return
    setExtracting(true)
    setExtractError(null)
    try {
      const filePayloads = await Promise.all(
        files.map(async (file) => ({
          data: await fileToBase64(file),
          media_type: file.type,
        }))
      )
      const items = await callExtractMenuBulk(supabaseUrl, accessToken ?? null, filePayloads)
      const draftRows: DraftRow[] = items.map((item, i) => ({
        ...item,
        rowId: `row-${i}-${Date.now()}`,
        selected: true,
      }))
      setRows(draftRows)
      setStep('review')
    } catch (err) {
      setExtractError(err instanceof Error ? err.message : 'Extraction failed. Please try again.')
    } finally {
      setExtracting(false)
    }
  }

  function updateRow(rowId: string, patch: Partial<DraftRow>): void {
    setRows((prev) => prev.map((r) => r.rowId === rowId ? { ...r, ...patch } : r))
  }

  function removeRow(rowId: string): void {
    setRows((prev) => prev.filter((r) => r.rowId !== rowId))
  }

  async function handleImport(): Promise<void> {
    const selected = rows.filter((r) => r.selected)
    if (selected.length === 0) return

    setStep('importing')
    setImportProgress({ current: 0, total: selected.length })

    // Build a mutable copy of menus (may grow as we create new ones)
    const menusCopy: AdminMenu[] = [...menus]
    const createdMenuIds: Record<string, string> = {}

    const failed: Array<{ name: string; error: string }> = []
    let successCount = 0

    for (let i = 0; i < selected.length; i++) {
      const item = selected[i]
      setImportProgress({ current: i + 1, total: selected.length })

      try {
        // Resolve menuId
        let menuId: string | null = null
        const categoryName = item.category?.trim() ?? ''

        if (categoryName) {
          // Try existing menus first (case-insensitive)
          const existing = menusCopy.find(
            (m) => m.name.toLowerCase() === categoryName.toLowerCase()
          )
          if (existing) {
            menuId = existing.id
          } else if (createdMenuIds[categoryName.toLowerCase()]) {
            menuId = createdMenuIds[categoryName.toLowerCase()]
          } else {
            // Create a new menu/category
            const newMenuId = await callCreateMenu(supabaseUrl, supabaseKey, restaurantId, categoryName)
            createdMenuIds[categoryName.toLowerCase()] = newMenuId
            menusCopy.push({ id: newMenuId, name: categoryName, restaurant_id: restaurantId, printer_type: 'kitchen', items: [] })
            menuId = newMenuId
          }
        }

        if (!menuId) {
          // Fall back to first existing menu or create a default
          if (menusCopy.length > 0) {
            menuId = menusCopy[0].id
          } else {
            const newMenuId = await callCreateMenu(supabaseUrl, supabaseKey, restaurantId, 'Menu')
            menusCopy.push({ id: newMenuId, name: 'Menu', restaurant_id: restaurantId, printer_type: 'kitchen', items: [] })
            menuId = newMenuId
          }
        }

        const priceCents = item.price !== undefined ? Math.round(item.price * 100) : 0

        await callCreateMenuItem(
          supabaseUrl,
          accessToken ?? null,
          menuId,
          item.name,
          priceCents,
          [],
          item.description,
        )
        successCount++
      } catch (err) {
        failed.push({
          name: item.name,
          error: err instanceof Error ? err.message : 'Unknown error',
        })
      }
    }

    setImportResult({ success: successCount, failed })
    setStep('done')
  }

  const selectedCount = rows.filter((r) => r.selected).length
  const categoryNames = menus.map((m) => m.name)

  // ─── Step: Upload ───────────────────────────────────────────────────────────
  if (step === 'upload') {
    return (
      <div className="flex flex-col gap-6 max-w-2xl">
        <div className="flex items-center gap-4">
          <Link
            href="/admin/menu"
            className="min-h-[48px] min-w-[48px] flex items-center justify-center rounded-xl bg-zinc-700 text-zinc-300 hover:bg-zinc-600 transition-colors"
            aria-label="Back to menu"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="text-2xl font-bold text-white">Import Menu</h1>
        </div>

        <p className="text-zinc-400 text-base">
          Upload up to {MAX_FILES} menu images or a PDF. AI will extract all items automatically.
        </p>

        {/* Drop zone */}
        <div
          role="button"
          tabIndex={0}
          aria-label="Upload files — click or drag and drop"
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click() }}
          className={[
            'flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-10 cursor-pointer transition-colors',
            dragOver
              ? 'border-amber-500 bg-amber-900/20'
              : 'border-zinc-600 bg-zinc-800 hover:border-zinc-500',
          ].join(' ')}
        >
          <svg className="h-10 w-10 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          <span className="text-zinc-300 text-base font-medium">
            Click or drag &amp; drop files here
          </span>
          <span className="text-zinc-500 text-sm">
            JPEG, PNG, WebP or PDF · up to {MAX_FILES} files · 10 MB each
          </span>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_TYPES.join(',')}
          multiple
          className="hidden"
          onChange={handleFileInput}
          aria-hidden="true"
        />

        {/* File previews */}
        {files.length > 0 && (
          <div className="flex flex-wrap gap-3">
            {files.map((file, i) => (
              <div key={i} className="relative">
                {filePreviews[i] ? (
                  <img
                    src={filePreviews[i]!}
                    alt={file.name}
                    className="h-20 w-20 rounded-xl object-cover"
                  />
                ) : (
                  <PdfIcon />
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); removeFile(i) }}
                  aria-label={`Remove ${file.name}`}
                  className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-red-600 text-white text-xs flex items-center justify-center hover:bg-red-500 transition-colors"
                >
                  ×
                </button>
                <span className="block text-xs text-zinc-500 mt-1 max-w-[80px] truncate">{file.name}</span>
              </div>
            ))}
          </div>
        )}

        {extractError && (
          <p role="alert" className="text-sm text-red-400 px-1">{extractError}</p>
        )}

        <button
          onClick={() => { void handleExtract() }}
          disabled={files.length === 0 || extracting}
          className="min-h-[48px] px-6 py-2 rounded-xl bg-amber-600 text-white text-base font-medium hover:bg-amber-500 transition-colors disabled:opacity-50 self-start"
        >
          {extracting ? 'AI is reading your menu…' : 'Extract Menu'}
        </button>
      </div>
    )
  }

  // ─── Step: Review ───────────────────────────────────────────────────────────
  if (step === 'review') {
    return (
      <div className="flex flex-col gap-6 max-w-3xl">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setStep('upload')}
            className="min-h-[48px] min-w-[48px] flex items-center justify-center rounded-xl bg-zinc-700 text-zinc-300 hover:bg-zinc-600 transition-colors"
            aria-label="Back to upload"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-2xl font-bold text-white">Review Extracted Items</h1>
        </div>

        <div className="flex items-center justify-between gap-4 flex-wrap">
          <p className="text-zinc-400 text-base">
            {rows.length} item{rows.length !== 1 ? 's' : ''} found — select which to import
          </p>
          <button
            onClick={() => { void handleImport() }}
            disabled={selectedCount === 0}
            className="min-h-[48px] px-6 py-2 rounded-xl bg-amber-600 text-white text-base font-medium hover:bg-amber-500 transition-colors disabled:opacity-50"
          >
            Import Selected ({selectedCount})
          </button>
        </div>

        {rows.length === 0 ? (
          <p className="text-zinc-500 text-base">No items were extracted. Try uploading a clearer image.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {/* Header row */}
            <div className="grid grid-cols-[auto_1fr_1fr_auto_auto] gap-2 px-4 py-2 text-sm font-medium text-zinc-400">
              <span>✓</span>
              <span>Name</span>
              <span>Category</span>
              <span>Price</span>
              <span className="w-8" />
            </div>
            {rows.map((row) => (
              <div
                key={row.rowId}
                className="grid grid-cols-[auto_1fr_1fr_auto_auto] gap-2 items-center bg-zinc-800 border border-zinc-700 rounded-2xl px-4 py-3"
              >
                {/* Checkbox */}
                <input
                  type="checkbox"
                  checked={row.selected}
                  onChange={(e) => updateRow(row.rowId, { selected: e.target.checked })}
                  aria-label={`Select ${row.name}`}
                  className="h-5 w-5 rounded accent-amber-500 cursor-pointer"
                />
                {/* Name */}
                <input
                  type="text"
                  value={row.name}
                  onChange={(e) => updateRow(row.rowId, { name: e.target.value })}
                  aria-label="Item name"
                  list={`category-suggestions-${row.rowId}`}
                  className="min-h-[40px] px-3 py-1 rounded-xl bg-zinc-900 text-white border border-zinc-600 focus:border-amber-500 focus:outline-none text-sm w-full"
                />
                {/* Category */}
                <div className="relative">
                  <input
                    type="text"
                    value={row.category ?? ''}
                    onChange={(e) => updateRow(row.rowId, { category: e.target.value })}
                    aria-label="Category"
                    list={`category-datalist-${row.rowId}`}
                    className="min-h-[40px] px-3 py-1 rounded-xl bg-zinc-900 text-white border border-zinc-600 focus:border-amber-500 focus:outline-none text-sm w-full"
                    placeholder="Category…"
                  />
                  <datalist id={`category-datalist-${row.rowId}`}>
                    {categoryNames.map((name) => (
                      <option key={name} value={name} />
                    ))}
                  </datalist>
                </div>
                {/* Price */}
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={row.price ?? ''}
                  onChange={(e) => updateRow(row.rowId, { price: e.target.value === '' ? undefined : parseFloat(e.target.value) })}
                  aria-label="Price"
                  className="min-h-[40px] px-3 py-1 rounded-xl bg-zinc-900 text-white border border-zinc-600 focus:border-amber-500 focus:outline-none text-sm w-24"
                  placeholder="0.00"
                />
                {/* Remove */}
                <button
                  onClick={() => removeRow(row.rowId)}
                  aria-label={`Remove ${row.name}`}
                  className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl bg-red-900 text-red-200 hover:bg-red-800 transition-colors text-lg font-bold"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={() => { void handleImport() }}
          disabled={selectedCount === 0}
          className="min-h-[48px] px-6 py-2 rounded-xl bg-amber-600 text-white text-base font-medium hover:bg-amber-500 transition-colors disabled:opacity-50 self-start"
        >
          Import Selected ({selectedCount})
        </button>
      </div>
    )
  }

  // ─── Step: Importing ─────────────────────────────────────────────────────────
  if (step === 'importing') {
    return (
      <div className="flex flex-col gap-6 max-w-2xl">
        <h1 className="text-2xl font-bold text-white">Importing…</h1>
        <p className="text-zinc-300 text-base">
          Importing item {importProgress.current} of {importProgress.total}…
        </p>
        <div className="w-full bg-zinc-700 rounded-full h-3 overflow-hidden">
          <div
            className="h-3 bg-amber-500 rounded-full transition-all duration-300"
            style={{ width: `${importProgress.total > 0 ? (importProgress.current / importProgress.total) * 100 : 0}%` }}
          />
        </div>
      </div>
    )
  }

  // ─── Step: Done ──────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <h1 className="text-2xl font-bold text-white">Import Complete</h1>

      {importResult && (
        <>
          {importResult.success > 0 && (
            <p className="text-green-400 text-base font-medium">
              ✓ {importResult.success} item{importResult.success !== 1 ? 's' : ''} imported successfully
            </p>
          )}
          {importResult.failed.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-red-400 text-base font-medium">
                {importResult.failed.length} item{importResult.failed.length !== 1 ? 's' : ''} failed:
              </p>
              <ul className="flex flex-col gap-1">
                {importResult.failed.map((f, i) => (
                  <li key={i} className="text-sm text-red-300 bg-red-900/30 rounded-xl px-4 py-2">
                    <span className="font-medium">{f.name}</span>: {f.error}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      <Link
        href="/admin/menu"
        className="min-h-[48px] px-6 py-2 rounded-xl bg-zinc-700 text-white text-base font-medium hover:bg-zinc-600 transition-colors self-start flex items-center"
      >
        ← Go to Menu
      </Link>
    </div>
  )
}
