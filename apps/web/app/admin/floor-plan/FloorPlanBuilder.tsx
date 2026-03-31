'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import type { JSX } from 'react'
import {
  DndContext,
  useDraggable,
  useDroppable,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { fetchTablePositions, saveTablePosition, fetchRestaurantId } from './floorPlanApi'
import type { TablePosition } from './floorPlanApi'
import { fetchConfigValue } from '../pricing/pricingAdminData'
import { callUpsertConfig } from '../pricing/pricingAdminApi'
import { useUser } from '@/lib/user-context'

// ─── Grid constants ───────────────────────────────────────────────────────────
const CELL_SIZE = 72
const DEFAULT_COLS = 24
const DEFAULT_ROWS = 16
const MIN_COLS = 8
const MAX_COLS = 50
const MIN_ROWS = 4
const MAX_ROWS = 30

// ─── Draggable table block ────────────────────────────────────────────────────
function DraggableTable({
  table,
  isDragging,
}: {
  table: TablePosition
  isDragging: boolean
}): JSX.Element {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: table.id })

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    width: CELL_SIZE,
    height: CELL_SIZE,
    cursor: 'grab',
    touchAction: 'none',
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={[
        'flex flex-col items-center justify-center rounded-xl border-2 select-none',
        isDragging
          ? 'bg-zinc-700 border-indigo-400'
          : 'bg-zinc-700 border-zinc-500 hover:border-indigo-400 transition-colors',
      ].join(' ')}
    >
      <span className="text-white font-bold text-sm text-center leading-tight px-1 truncate max-w-full">
        {table.label}
      </span>
      <span className="text-zinc-400 text-xs mt-0.5">
        {table.seat_count} {table.seat_count === 1 ? 'seat' : 'seats'}
      </span>
    </div>
  )
}

// ─── Drag overlay ghost ───────────────────────────────────────────────────────
function TableDragOverlay({ table }: { table: TablePosition | null }): JSX.Element {
  if (!table) return <></>
  return (
    <div
      style={{ width: CELL_SIZE, height: CELL_SIZE }}
      className="flex flex-col items-center justify-center rounded-xl border-2 bg-zinc-700 border-indigo-400 opacity-80 select-none shadow-lg pointer-events-none"
    >
      <span className="text-white font-bold text-sm text-center leading-tight px-1 truncate max-w-full">
        {table.label}
      </span>
      <span className="text-zinc-400 text-xs mt-0.5">
        {table.seat_count} {table.seat_count === 1 ? 'seat' : 'seats'}
      </span>
    </div>
  )
}

// ─── Single droppable grid cell ───────────────────────────────────────────────
function GridCell({
  col,
  row,
  table,
  draggingId,
}: {
  col: number
  row: number
  table: TablePosition | null
  draggingId: string | null
}): JSX.Element {
  const id = `cell-${col}-${row}`
  const { isOver, setNodeRef } = useDroppable({ id })

  return (
    <div
      ref={setNodeRef}
      style={{ width: CELL_SIZE, height: CELL_SIZE }}
      className={[
        'relative border border-zinc-700/30',
        isOver && !table ? 'bg-indigo-900/30' : '',
        isOver && table ? 'bg-red-900/20' : '',
      ].join(' ')}
    >
      {table && <DraggableTable table={table} isDragging={draggingId === table.id} />}
    </div>
  )
}

// ─── Unplaced sidebar ─────────────────────────────────────────────────────────
function UnplacedSidebar({
  tables,
  draggingId,
}: {
  tables: TablePosition[]
  draggingId: string | null
}): JSX.Element {
  const { isOver, setNodeRef } = useDroppable({ id: 'sidebar' })

  return (
    <div
      ref={setNodeRef}
      style={{ width: 200, minHeight: CELL_SIZE * 4 }}
      className={[
        'flex-shrink-0 flex flex-col gap-2 p-3 rounded-xl border transition-colors',
        isOver ? 'border-indigo-500 bg-indigo-900/10' : 'border-zinc-700 bg-zinc-800/50',
      ].join(' ')}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="text-sm font-semibold text-zinc-300">Unplaced Tables</span>
        {tables.length > 0 && (
          <span className="text-xs font-bold bg-zinc-700 text-zinc-300 rounded-full px-2 py-0.5">
            {tables.length}
          </span>
        )}
      </div>
      {tables.length === 0 ? (
        <p className="text-zinc-500 text-xs">All tables placed</p>
      ) : (
        tables.map((t) => (
          <DraggableTable key={t.id} table={t} isDragging={draggingId === t.id} />
        ))
      )}
    </div>
  )
}

// ─── Grid size settings bar ───────────────────────────────────────────────────
function GridSizeBar({
  colsInput,
  rowsInput,
  saving,
  onColsChange,
  onRowsChange,
  onSave,
}: {
  colsInput: string
  rowsInput: string
  saving: boolean
  onColsChange: (v: string) => void
  onRowsChange: (v: string) => void
  onSave: () => void
}): JSX.Element {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-zinc-800/60 border border-zinc-700 flex-wrap">
      <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wide shrink-0">
        Grid size
      </span>

      <div className="flex items-center gap-1.5">
        <label htmlFor="grid-cols-input" className="text-xs text-zinc-400 shrink-0">Cols</label>
        <input
          id="grid-cols-input"
          type="number"
          min={MIN_COLS}
          max={MAX_COLS}
          step={1}
          value={colsInput}
          onChange={(e) => onColsChange(e.target.value)}
          disabled={saving}
          className="w-16 h-8 px-2 rounded-lg bg-zinc-900 text-white text-sm border border-zinc-600 focus:border-indigo-500 focus:outline-none disabled:opacity-50 text-center"
        />
        <span className="text-xs text-zinc-500">({MIN_COLS}–{MAX_COLS})</span>
      </div>

      <div className="flex items-center gap-1.5">
        <label htmlFor="grid-rows-input" className="text-xs text-zinc-400 shrink-0">Rows</label>
        <input
          id="grid-rows-input"
          type="number"
          min={MIN_ROWS}
          max={MAX_ROWS}
          step={1}
          value={rowsInput}
          onChange={(e) => onRowsChange(e.target.value)}
          disabled={saving}
          className="w-16 h-8 px-2 rounded-lg bg-zinc-900 text-white text-sm border border-zinc-600 focus:border-indigo-500 focus:outline-none disabled:opacity-50 text-center"
        />
        <span className="text-xs text-zinc-500">({MIN_ROWS}–{MAX_ROWS})</span>
      </div>

      <button
        onClick={onSave}
        disabled={saving}
        className="h-8 px-3 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-500 transition-colors disabled:opacity-50 shrink-0"
      >
        {saving ? 'Saving…' : 'Save layout size'}
      </button>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function FloorPlanBuilder(): JSX.Element {
  const { accessToken } = useUser()

  const [tables, setTables] = useState<TablePosition[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [restaurantId, setRestaurantId] = useState<string>('')
  const supabaseConfig = useRef<{ url: string; key: string } | null>(null)

  // Grid dimensions — committed (used to render canvas)
  const [gridCols, setGridCols] = useState(DEFAULT_COLS)
  const [gridRows, setGridRows] = useState(DEFAULT_ROWS)
  // Input strings (live, before save)
  const [colsInput, setColsInput] = useState(String(DEFAULT_COLS))
  const [rowsInput, setRowsInput] = useState(String(DEFAULT_ROWS))
  const [savingGridSize, setSavingGridSize] = useState(false)
  const [gridSizeError, setGridSizeError] = useState<string | null>(null)

  // DnD state
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [resetInProgress, setResetInProgress] = useState(false)

  const saveErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const gridSizeErrTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  )

  // ── Load tables + config on mount ──────────────────────────────────────────
  useEffect(() => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    if (!supabaseUrl || !supabaseKey) {
      setError('API not configured')
      setLoading(false)
      return
    }
    supabaseConfig.current = { url: supabaseUrl, key: supabaseKey }

    Promise.all([
      fetchTablePositions(supabaseUrl, supabaseKey),
      fetchRestaurantId(supabaseUrl, supabaseKey),
    ])
      .then(async ([tableData, rid]) => {
        setTables(tableData)
        setRestaurantId(rid)
        // Load grid size config
        const [cols, rows] = await Promise.all([
          fetchConfigValue(supabaseUrl, supabaseKey, rid, 'floor_plan_cols', String(DEFAULT_COLS)),
          fetchConfigValue(supabaseUrl, supabaseKey, rid, 'floor_plan_rows', String(DEFAULT_ROWS)),
        ])
        const parsedCols = clampInt(parseInt(cols, 10), MIN_COLS, MAX_COLS, DEFAULT_COLS)
        const parsedRows = clampInt(parseInt(rows, 10), MIN_ROWS, MAX_ROWS, DEFAULT_ROWS)
        setGridCols(parsedCols)
        setGridRows(parsedRows)
        setColsInput(String(parsedCols))
        setRowsInput(String(parsedRows))
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load floor plan')
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    return () => {
      if (saveErrorTimerRef.current) clearTimeout(saveErrorTimerRef.current)
      if (gridSizeErrTimerRef.current) clearTimeout(gridSizeErrTimerRef.current)
    }
  }, [])

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function clampInt(val: number, min: number, max: number, fallback: number): number {
    if (isNaN(val) || !Number.isInteger(val)) return fallback
    return Math.min(max, Math.max(min, val))
  }

  function showSaveError(msg: string): void {
    if (saveErrorTimerRef.current) clearTimeout(saveErrorTimerRef.current)
    setSaveError(msg)
    saveErrorTimerRef.current = setTimeout(() => setSaveError(null), 5000)
  }

  function showGridSizeError(msg: string): void {
    if (gridSizeErrTimerRef.current) clearTimeout(gridSizeErrTimerRef.current)
    setGridSizeError(msg)
    gridSizeErrTimerRef.current = setTimeout(() => setGridSizeError(null), 5000)
  }

  // ── Apply new grid dims locally — unplace out-of-bounds tables ──────────────
  function applyGridDims(newCols: number, newRows: number): void {
    setGridCols(newCols)
    setGridRows(newRows)
    // Unposition any tables that are now outside the new bounds
    setTables((prev) =>
      prev.map((t) => {
        if (
          t.grid_x !== null &&
          t.grid_y !== null &&
          (t.grid_x >= newCols || t.grid_y >= newRows)
        ) {
          return { ...t, grid_x: null, grid_y: null }
        }
        return t
      }),
    )
  }

  // When cols input changes: parse, clamp, update canvas live
  function handleColsChange(raw: string): void {
    setColsInput(raw)
    const parsed = parseInt(raw, 10)
    if (!isNaN(parsed) && Number.isInteger(parsed)) {
      const clamped = Math.min(MAX_COLS, Math.max(MIN_COLS, parsed))
      applyGridDims(clamped, gridRows)
    }
  }

  // When rows input changes: parse, clamp, update canvas live
  function handleRowsChange(raw: string): void {
    setRowsInput(raw)
    const parsed = parseInt(raw, 10)
    if (!isNaN(parsed) && Number.isInteger(parsed)) {
      const clamped = Math.min(MAX_ROWS, Math.max(MIN_ROWS, parsed))
      applyGridDims(gridCols, clamped)
    }
  }

  // ── Save grid size to config ─────────────────────────────────────────────────
  async function handleSaveGridSize(): Promise<void> {
    const config = supabaseConfig.current
    if (!config || !restaurantId || !accessToken) return

    const parsedCols = parseInt(colsInput, 10)
    const parsedRows = parseInt(rowsInput, 10)

    if (
      isNaN(parsedCols) || parsedCols < MIN_COLS || parsedCols > MAX_COLS ||
      isNaN(parsedRows) || parsedRows < MIN_ROWS || parsedRows > MAX_ROWS
    ) {
      showGridSizeError(
        `Columns must be ${MIN_COLS}–${MAX_COLS}, rows must be ${MIN_ROWS}–${MAX_ROWS}.`,
      )
      return
    }

    setSavingGridSize(true)
    try {
      await Promise.all([
        callUpsertConfig(config.url, config.key, restaurantId, 'floor_plan_cols', String(parsedCols)),
        callUpsertConfig(config.url, config.key, restaurantId, 'floor_plan_rows', String(parsedRows)),
      ])
      // Persist any out-of-bounds unpositionings to the server
      const outOfBounds = tables.filter(
        (t) =>
          t.grid_x !== null &&
          t.grid_y !== null &&
          (t.grid_x >= parsedCols || t.grid_y >= parsedRows),
      )
      if (outOfBounds.length > 0) {
        await Promise.all(
          outOfBounds.map((t) =>
            saveTablePosition(config.url, accessToken, t.id, null, null).catch(() => {
              /* non-fatal — table state already updated locally */
            }),
          ),
        )
      }
    } catch (err) {
      showGridSizeError(err instanceof Error ? err.message : 'Failed to save grid size')
    } finally {
      setSavingGridSize(false)
    }
  }

  // ── DnD handlers ────────────────────────────────────────────────────────────
  function handleDragStart(event: DragStartEvent): void {
    setDraggingId(event.active.id as string)
  }

  const handleDragEnd = useCallback(
    (event: DragEndEvent): void => {
      setDraggingId(null)
      const tableId = event.active.id as string
      const overId = event.over?.id as string | undefined
      if (!overId) return

      let newX: number | null = null
      let newY: number | null = null

      if (overId === 'sidebar') {
        newX = null
        newY = null
      } else if (overId.startsWith('cell-')) {
        const parts = overId.split('-')
        newX = parseInt(parts[1], 10)
        newY = parseInt(parts[2], 10)
      } else {
        return
      }

      // Block if another table occupies the target cell
      if (newX !== null && newY !== null) {
        const occupant = tables.find(
          (t) => t.id !== tableId && t.grid_x === newX && t.grid_y === newY,
        )
        if (occupant) return
      }

      const prevTables = tables
      setTables((prev) =>
        prev.map((t) => (t.id === tableId ? { ...t, grid_x: newX, grid_y: newY } : t)),
      )

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      if (!supabaseUrl || !accessToken) return

      setSavingId(tableId)
      saveTablePosition(supabaseUrl, accessToken, tableId, newX, newY)
        .catch((err: unknown) => {
          setTables(prevTables)
          showSaveError(err instanceof Error ? err.message : 'Failed to save position')
        })
        .finally(() => setSavingId(null))
    },
    [tables, accessToken],
  )

  // ── Reset layout ─────────────────────────────────────────────────────────────
  async function handleResetLayout(): Promise<void> {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!supabaseUrl || !accessToken) return
    setResetInProgress(true)
    const positioned = tables.filter((t) => t.grid_x !== null || t.grid_y !== null)
    try {
      await Promise.all(
        positioned.map((t) => saveTablePosition(supabaseUrl, accessToken, t.id, null, null)),
      )
      setTables((prev) => prev.map((t) => ({ ...t, grid_x: null, grid_y: null })))
    } catch (err) {
      showSaveError(err instanceof Error ? err.message : 'Failed to reset layout')
    } finally {
      setResetInProgress(false)
      setShowResetConfirm(false)
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold text-white">Floor Plan</h1>
        <p className="text-zinc-400">Loading tables…</p>
      </div>
    )
  }

  if (error !== null) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold text-white">Floor Plan</h1>
        <p className="text-red-400">{error}</p>
      </div>
    )
  }

  // Build col-row → table lookup
  const cellMap = new Map<string, TablePosition>()
  for (const t of tables) {
    if (t.grid_x !== null && t.grid_y !== null) {
      cellMap.set(`${t.grid_x}-${t.grid_y}`, t)
    }
  }

  const unplaced = tables.filter((t) => t.grid_x === null || t.grid_y === null)
  const draggingTable = draggingId ? (tables.find((t) => t.id === draggingId) ?? null) : null

  return (
    <div className="flex flex-col gap-4">
      {/* ── Page header ── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-bold text-white">Floor Plan</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-zinc-500">Positions auto-saved on drop</span>
          {savingId && <span className="text-sm text-indigo-400 animate-pulse">Saving…</span>}
          <button
            onClick={() => setShowResetConfirm(true)}
            disabled={resetInProgress}
            className="min-h-[40px] px-4 py-2 rounded-xl bg-zinc-700 text-zinc-300 text-sm font-medium hover:bg-zinc-600 transition-colors disabled:opacity-50"
          >
            Reset Layout
          </button>
        </div>
      </div>

      {/* ── Grid size settings bar ── */}
      <GridSizeBar
        colsInput={colsInput}
        rowsInput={rowsInput}
        saving={savingGridSize}
        onColsChange={handleColsChange}
        onRowsChange={handleRowsChange}
        onSave={() => { void handleSaveGridSize() }}
      />

      {/* ── Error banners ── */}
      {gridSizeError !== null && (
        <div className="px-4 py-3 rounded-xl bg-red-800 text-red-100 text-sm">
          {gridSizeError}
        </div>
      )}
      {saveError !== null && (
        <div className="px-4 py-3 rounded-xl bg-red-800 text-red-100 text-sm">
          {saveError}
        </div>
      )}

      {/* ── Reset confirm dialog ── */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="bg-zinc-900 rounded-2xl p-6 max-w-sm w-full mx-4 flex flex-col gap-4 border border-zinc-700">
            <h2 className="text-lg font-semibold text-white">Reset Floor Plan?</h2>
            <p className="text-zinc-400 text-sm">
              This will clear all table positions. Tables will return to the unplaced sidebar.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowResetConfirm(false)}
                disabled={resetInProgress}
                className="flex-1 min-h-[44px] rounded-xl bg-zinc-700 text-white text-sm font-medium hover:bg-zinc-600 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => { void handleResetLayout() }}
                disabled={resetInProgress}
                className="flex-1 min-h-[44px] rounded-xl bg-red-700 text-white text-sm font-medium hover:bg-red-600 transition-colors disabled:opacity-50"
              >
                {resetInProgress ? 'Resetting…' : 'Reset'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Main layout: sidebar + canvas ── */}
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex gap-4 items-start">
          {/* Unplaced sidebar */}
          <UnplacedSidebar tables={unplaced} draggingId={draggingId} />

          {/* Scrollable canvas */}
          <div className="overflow-auto flex-1">
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${gridCols}, ${CELL_SIZE}px)`,
                gridTemplateRows: `repeat(${gridRows}, ${CELL_SIZE}px)`,
                width: gridCols * CELL_SIZE,
              }}
            >
              {Array.from({ length: gridRows }, (_, row) =>
                Array.from({ length: gridCols }, (_, col) => {
                  const key = `${col}-${row}`
                  const table = cellMap.get(key) ?? null
                  return (
                    <GridCell
                      key={key}
                      col={col}
                      row={row}
                      table={table}
                      draggingId={draggingId}
                    />
                  )
                }),
              )}
            </div>
          </div>
        </div>

        <DragOverlay>
          <TableDragOverlay table={draggingTable} />
        </DragOverlay>
      </DndContext>
    </div>
  )
}
