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
import { fetchTablePositions, saveTablePosition } from './floorPlanApi'
import type { TablePosition } from './floorPlanApi'
import { useUser } from '@/lib/user-context'

const GRID_COLS = 24
const GRID_ROWS = 16
const CELL_SIZE = 72

/** Draggable table block (on canvas or in sidebar) */
function DraggableTable({
  table,
  isDragging,
}: {
  table: TablePosition
  isDragging: boolean
}): JSX.Element {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: table.id,
  })

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
          : 'bg-zinc-700 border-zinc-500 hover:border-indigo-400',
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

/** Drag overlay (ghost following cursor) */
function TableDragOverlay({ table }: { table: TablePosition | null }): JSX.Element {
  if (!table) return <></>
  return (
    <div
      style={{ width: CELL_SIZE, height: CELL_SIZE }}
      className="flex flex-col items-center justify-center rounded-xl border-2 bg-zinc-700 border-indigo-400 opacity-80 select-none shadow-lg"
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

/** A single droppable grid cell */
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
      {table && (
        <DraggableTable
          table={table}
          isDragging={draggingId === table.id}
        />
      )}
    </div>
  )
}

/** Droppable sidebar for unplaced tables */
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
        'flex flex-col gap-2 p-3 rounded-xl border border-zinc-700 bg-zinc-800/50 transition-colors',
        isOver ? 'border-indigo-500 bg-indigo-900/10' : '',
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

export default function FloorPlanBuilder(): JSX.Element {
  const { accessToken } = useUser()
  const [tables, setTables] = useState<TablePosition[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [resetInProgress, setResetInProgress] = useState(false)

  const saveErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 4 },
    }),
  )

  useEffect(() => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    if (!supabaseUrl || !supabaseKey) {
      setError('API not configured')
      setLoading(false)
      return
    }
    fetchTablePositions(supabaseUrl, supabaseKey)
      .then((data) => setTables(data))
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load tables')
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    return () => {
      if (saveErrorTimerRef.current) clearTimeout(saveErrorTimerRef.current)
    }
  }, [])

  function showSaveError(msg: string): void {
    if (saveErrorTimerRef.current) clearTimeout(saveErrorTimerRef.current)
    setSaveError(msg)
    saveErrorTimerRef.current = setTimeout(() => setSaveError(null), 5000)
  }

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
        // Dropped on sidebar → unset position
        newX = null
        newY = null
      } else if (overId.startsWith('cell-')) {
        const parts = overId.split('-')
        newX = parseInt(parts[1], 10)
        newY = parseInt(parts[2], 10)
      } else {
        return
      }

      // Check if another table is already at this cell
      if (newX !== null && newY !== null) {
        const occupant = tables.find(
          (t) => t.id !== tableId && t.grid_x === newX && t.grid_y === newY,
        )
        if (occupant) return // cell is occupied
      }

      // Optimistic update
      const prevTables = tables
      setTables((prev) =>
        prev.map((t) => (t.id === tableId ? { ...t, grid_x: newX, grid_y: newY } : t)),
      )

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      if (!supabaseUrl || !accessToken) return

      setSavingId(tableId)
      saveTablePosition(supabaseUrl, accessToken, tableId, newX, newY)
        .catch((err: unknown) => {
          // Revert on failure
          setTables(prevTables)
          showSaveError(err instanceof Error ? err.message : 'Failed to save position')
        })
        .finally(() => setSavingId(null))
    },
    [tables, accessToken],
  )

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

  // Build a lookup: "col-row" → table
  const cellMap = new Map<string, TablePosition>()
  for (const t of tables) {
    if (t.grid_x !== null && t.grid_y !== null) {
      cellMap.set(`${t.grid_x}-${t.grid_y}`, t)
    }
  }

  const unplaced = tables.filter((t) => t.grid_x === null || t.grid_y === null)
  const draggingTable = draggingId ? (tables.find((t) => t.id === draggingId) ?? null) : null

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

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-bold text-white">Floor Plan</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-zinc-500">Positions auto-saved on drop</span>
          {savingId && (
            <span className="text-sm text-indigo-400 animate-pulse">Saving…</span>
          )}
          <button
            onClick={() => setShowResetConfirm(true)}
            disabled={resetInProgress}
            className="min-h-[40px] px-4 py-2 rounded-xl bg-zinc-700 text-zinc-300 text-sm font-medium hover:bg-zinc-600 transition-colors disabled:opacity-50"
          >
            Reset Layout
          </button>
        </div>
      </div>

      {/* Save error */}
      {saveError !== null && (
        <div className="px-4 py-3 rounded-xl bg-red-800 text-red-100 text-sm">
          {saveError}
        </div>
      )}

      {/* Reset confirm dialog */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="bg-zinc-900 rounded-2xl p-6 max-w-sm w-full mx-4 flex flex-col gap-4">
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

      {/* Main layout: sidebar + canvas */}
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex gap-4 items-start">
          {/* Unplaced sidebar */}
          <UnplacedSidebar tables={unplaced} draggingId={draggingId} />

          {/* Canvas */}
          <div className="overflow-auto flex-1">
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${GRID_COLS}, ${CELL_SIZE}px)`,
                gridTemplateRows: `repeat(${GRID_ROWS}, ${CELL_SIZE}px)`,
                width: GRID_COLS * CELL_SIZE,
              }}
            >
              {Array.from({ length: GRID_ROWS }, (_, row) =>
                Array.from({ length: GRID_COLS }, (_, col) => {
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
