'use client'

import { useCallback, useMemo, useState } from 'react'
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
import type { UnifiedSection, UnifiedTable, StaffUser } from './unifiedFloorPlanData'
import { getSectionTint } from './SectionSidebar'

const CELL_SIZE = 72

// ─── Draggable table block ────────────────────────────────────────────────────
function DraggableTable({
  table,
  isDragging,
}: {
  table: UnifiedTable
  isDragging: boolean
}): JSX.Element {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: table.id })

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={[
        'flex flex-col items-center justify-center rounded-xl border-2 select-none',
        'w-[72px] h-[72px] cursor-grab touch-none',
        isDragging
          ? 'bg-zinc-700 border-indigo-400 opacity-50'
          : 'bg-zinc-700 border-zinc-500 hover:border-indigo-400 transition-colors opacity-100',
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
function TableDragOverlay({ table }: { table: UnifiedTable | null }): JSX.Element {
  if (!table) return <></>
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border-2 bg-zinc-700 border-indigo-400 opacity-80 select-none shadow-lg pointer-events-none w-[72px] h-[72px]">
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
  onCellClick,
  onTableClick,
}: {
  col: number
  row: number
  table: UnifiedTable | null
  draggingId: string | null
  onCellClick: (col: number, row: number) => void
  onTableClick: (table: UnifiedTable) => void
}): JSX.Element {
  const id = `cell-${col}-${row}`
  const { isOver, setNodeRef } = useDroppable({ id })

  function handleClick(): void {
    if (!table) {
      onCellClick(col, row)
    } else {
      onTableClick(table)
    }
  }

  return (
    <div
      ref={setNodeRef}
      data-testid={`cell-${col}-${row}`}
      onClick={handleClick}
      className={[
        'relative border border-zinc-700/30 w-[72px] h-[72px]',
        isOver && !table ? 'bg-indigo-900/30 cursor-copy' : '',
        isOver && table ? 'bg-red-900/20' : '',
        !table ? 'cursor-pointer hover:bg-zinc-800/60' : '',
      ].join(' ')}
    >
      {table && <DraggableTable table={table} isDragging={draggingId === table.id} />}
    </div>
  )
}

// ─── Unplaced sidebar within the grid area ────────────────────────────────────
function UnplacedSidebar({
  tables,
  draggingId,
}: {
  tables: UnifiedTable[]
  draggingId: string | null
}): JSX.Element {
  const { isOver, setNodeRef } = useDroppable({ id: 'sidebar' })

  return (
    <div
      ref={setNodeRef}
      className={[
        'flex-shrink-0 flex flex-col gap-2 p-3 rounded-xl border transition-colors w-[200px] min-h-[288px]',
        isOver ? 'border-indigo-500 bg-indigo-900/10' : 'border-zinc-700 bg-zinc-800/50',
      ].join(' ')}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="text-sm font-semibold text-zinc-300">Unplaced</span>
        {tables.length > 0 && (
          <span className="text-xs font-bold bg-zinc-700 text-zinc-300 rounded-full px-2 py-0.5">
            {tables.length}
          </span>
        )}
      </div>
      {tables.length === 0 ? (
        <p className="text-zinc-500 text-xs">All tables placed on grid</p>
      ) : (
        tables.map((t) => (
          <DraggableTable key={t.id} table={t} isDragging={draggingId === t.id} />
        ))
      )}
    </div>
  )
}

// ─── Section header bar ───────────────────────────────────────────────────────
interface SectionHeaderProps {
  section: UnifiedSection
  sectionIndex: number
  staffUsers: StaffUser[]
  onRename: (name: string) => void
  onChangeGridSize: (cols: number, rows: number) => void
  onAssignServer: (serverId: string | null) => void
}

function SectionHeader({
  section,
  sectionIndex,
  staffUsers,
  onRename,
  onChangeGridSize,
  onAssignServer,
}: SectionHeaderProps): JSX.Element {
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState(section.name)
  const tint = getSectionTint(sectionIndex)

  function handleNameSubmit(): void {
    if (nameInput.trim() && nameInput.trim() !== section.name) {
      onRename(nameInput.trim())
    }
    setEditingName(false)
  }

  return (
    <div className={`flex items-center gap-4 px-4 py-3 rounded-xl border flex-wrap ${tint}`}>
      {/* Section name — inline editable */}
      {editingName ? (
        <input
          type="text"
          value={nameInput}
          onChange={(e) => setNameInput(e.target.value)}
          onBlur={handleNameSubmit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleNameSubmit()
            if (e.key === 'Escape') { setEditingName(false); setNameInput(section.name) }
          }}
          className="min-h-[36px] px-2 rounded-lg bg-zinc-900 text-white text-sm font-semibold border border-indigo-500 focus:outline-none w-40"
          autoFocus
        />
      ) : (
        <button
          type="button"
          onClick={() => { setNameInput(section.name); setEditingName(true) }}
          className="text-white font-semibold text-sm hover:text-indigo-300 transition-colors"
          title="Click to rename"
        >
          {section.name}
        </button>
      )}

      {/* Grid size */}
      <div className="flex items-center gap-1.5">
        <label className="text-xs text-zinc-400">Grid</label>
        <input
          type="number"
          min={4}
          max={50}
          value={section.grid_cols}
          onChange={(e) => {
            const v = parseInt(e.target.value, 10)
            if (!isNaN(v) && v >= 4 && v <= 50) onChangeGridSize(v, section.grid_rows)
          }}
          className="w-14 h-7 px-1.5 rounded-lg bg-zinc-900 text-white text-xs border border-zinc-600 focus:border-indigo-500 focus:outline-none text-center"
        />
        <span className="text-zinc-500 text-xs">×</span>
        <input
          type="number"
          min={2}
          max={30}
          value={section.grid_rows}
          onChange={(e) => {
            const v = parseInt(e.target.value, 10)
            if (!isNaN(v) && v >= 2 && v <= 30) onChangeGridSize(section.grid_cols, v)
          }}
          className="w-14 h-7 px-1.5 rounded-lg bg-zinc-900 text-white text-xs border border-zinc-600 focus:border-indigo-500 focus:outline-none text-center"
        />
      </div>

      {/* Server assignment */}
      <select
        value={section.assigned_server_id ?? ''}
        onChange={(e) => onAssignServer(e.target.value || null)}
        className="min-h-[36px] px-2 rounded-lg bg-zinc-800 text-white border border-zinc-600 text-xs"
      >
        <option value="">No server</option>
        {staffUsers.map((u) => (
          <option key={u.id} value={u.id}>{u.name ?? u.email}</option>
        ))}
      </select>
    </div>
  )
}

// ─── Main SectionGrid component ───────────────────────────────────────────────
interface SectionGridProps {
  section: UnifiedSection
  sectionIndex: number
  allSectionTables: UnifiedTable[]
  staffUsers: StaffUser[]
  onMoveTable: (tableId: string, gridX: number | null, gridY: number | null) => Promise<void>
  onCellClick: (col: number, row: number) => void
  onTableClick: (table: UnifiedTable) => void
  onRenameSection: (name: string) => void
  onChangeGridSize: (cols: number, rows: number) => void
  onAssignServer: (serverId: string | null) => void
}

export default function SectionGrid({
  section,
  sectionIndex,
  allSectionTables,
  staffUsers,
  onMoveTable,
  onCellClick,
  onTableClick,
  onRenameSection,
  onChangeGridSize,
  onAssignServer,
}: SectionGridProps): JSX.Element {
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  )

  const cellMap = useMemo(() => {
    const map = new Map<string, UnifiedTable>()
    for (const t of allSectionTables) {
      if (t.grid_x !== null && t.grid_y !== null) {
        map.set(`${t.grid_x}-${t.grid_y}`, t)
      }
    }
    return map
  }, [allSectionTables])

  const unplaced = useMemo(
    () => allSectionTables.filter((t) => t.grid_x === null || t.grid_y === null),
    [allSectionTables],
  )
  const draggingTable = draggingId ? (allSectionTables.find((t) => t.id === draggingId) ?? null) : null

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
        const occupant = allSectionTables.find(
          (t) => t.id !== tableId && t.grid_x === newX && t.grid_y === newY,
        )
        if (occupant) return
      }

      setSavingId(tableId)
      void onMoveTable(tableId, newX, newY)
        .catch((err: unknown) => {
          setSaveError(err instanceof Error ? err.message : 'Failed to save position')
          setTimeout(() => setSaveError(null), 5000)
        })
        .finally(() => setSavingId(null))
    },
    [allSectionTables, onMoveTable],
  )

  return (
    <div className="flex flex-col gap-3 flex-1 min-w-0">
      <SectionHeader
        section={section}
        sectionIndex={sectionIndex}
        staffUsers={staffUsers}
        onRename={onRenameSection}
        onChangeGridSize={onChangeGridSize}
        onAssignServer={onAssignServer}
      />

      {saveError && (
        <div className="px-4 py-2 rounded-xl bg-red-800 text-red-100 text-sm">{saveError}</div>
      )}

      {savingId && <span className="text-sm text-indigo-400 animate-pulse">Saving…</span>}

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex gap-4 items-start">
          <UnplacedSidebar tables={unplaced} draggingId={draggingId} />

          <div className="overflow-auto flex-1">
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${section.grid_cols}, ${CELL_SIZE}px)`,
                gridTemplateRows: `repeat(${section.grid_rows}, ${CELL_SIZE}px)`,
                width: section.grid_cols * CELL_SIZE,
              }}
            >
              {Array.from({ length: section.grid_rows }, (_, row) =>
                Array.from({ length: section.grid_cols }, (_, col) => {
                  const key = `${col}-${row}`
                  const table = cellMap.get(key) ?? null
                  return (
                    <GridCell
                      key={key}
                      col={col}
                      row={row}
                      table={table}
                      draggingId={draggingId}
                      onCellClick={onCellClick}
                      onTableClick={onTableClick}
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
