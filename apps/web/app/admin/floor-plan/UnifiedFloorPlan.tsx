'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { JSX } from 'react'
import { useUser } from '@/lib/user-context'
import { fetchUnifiedFloorPlanData } from './unifiedFloorPlanData'
import type { UnifiedSection, UnifiedTable, StaffUser } from './unifiedFloorPlanData'
import { callCreateSection, callUpdateSection, callDeleteSection, callAssignTableSection } from '../sections/sectionsApi'
import { callCreateTable, callUpdateTable, callDeleteTable } from '../tables/tableAdminApi'
import { saveTablePosition, invalidateTablePositionsCache } from './floorPlanApi'
import SectionSidebar from './SectionSidebar'
import SectionGrid from './SectionGrid'
import TableDialog from './TableDialog'

type FeedbackType = 'success' | 'error'
interface Feedback { type: FeedbackType; message: string }

interface PendingTableAdd {
  col: number
  row: number
  sectionId: string
}

interface PendingTableEdit {
  table: UnifiedTable
}

export default function UnifiedFloorPlan(): JSX.Element {
  const { accessToken: _at } = useUser()
  const accessToken = _at ?? ''

  const [sections, setSections] = useState<UnifiedSection[]>([])
  const [tables, setTables] = useState<UnifiedTable[]>([])
  const [staffUsers, setStaffUsers] = useState<StaffUser[]>([])
  const [restaurantId, setRestaurantId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<Feedback | null>(null)

  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null)
  const [pendingAdd, setPendingAdd] = useState<PendingTableAdd | null>(null)
  const [pendingEdit, setPendingEdit] = useState<PendingTableEdit | null>(null)

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function showFeedback(type: FeedbackType, message: string): void {
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current)
    setFeedback({ type, message })
    feedbackTimer.current = setTimeout(() => setFeedback(null), 3000)
  }

  const loadData = useCallback(async (): Promise<void> => {
    if (!accessToken) return
    setError(null)
    setRefreshing(true)
    try {
      const data = await fetchUnifiedFloorPlanData()
      setSections(data.sections)
      setTables(data.tables)
      setStaffUsers(data.staffUsers)
      setRestaurantId(data.restaurantId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load floor plan')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [accessToken])

  useEffect(() => {
    void loadData()
  }, [loadData])

  useEffect(() => {
    return () => {
      if (feedbackTimer.current) clearTimeout(feedbackTimer.current)
    }
  }, [])

  // ── Section CRUD ────────────────────────────────────────────────────────────
  async function handleCreateSection(name: string): Promise<void> {
    if (!accessToken || !restaurantId) return
    try {
      await callCreateSection(supabaseUrl, accessToken, restaurantId, name)
      showFeedback('success', `Section "${name}" created`)
      await loadData()
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : 'Failed to create section')
    }
  }

  async function handleDeleteSection(sectionId: string): Promise<void> {
    if (!accessToken) return
    try {
      await callDeleteSection(supabaseUrl, accessToken, sectionId)
      if (selectedSectionId === sectionId) setSelectedSectionId(null)
      showFeedback('success', 'Section deleted')
      await loadData()
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : 'Failed to delete section')
    }
  }

  async function handleRenameSection(sectionId: string, name: string): Promise<void> {
    if (!accessToken) return
    try {
      await callUpdateSection(supabaseUrl, accessToken, sectionId, { name })
      showFeedback('success', `Section renamed to "${name}"`)
      await loadData()
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : 'Failed to rename section')
    }
  }

  async function handleChangeSectionGridSize(sectionId: string, cols: number, rows: number): Promise<void> {
    if (!accessToken) return
    // Optimistic update
    setSections((prev) =>
      prev.map((s) => (s.id === sectionId ? { ...s, grid_cols: cols, grid_rows: rows } : s)),
    )
    try {
      await callUpdateSection(supabaseUrl, accessToken, sectionId, {
        grid_cols: cols,
        grid_rows: rows,
      })
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : 'Failed to update grid size')
      await loadData()
    }
  }

  async function handleAssignServer(sectionId: string, serverId: string | null): Promise<void> {
    if (!accessToken) return
    try {
      await callUpdateSection(supabaseUrl, accessToken, sectionId, { assigned_server_id: serverId })
      showFeedback('success', serverId ? 'Server assigned' : 'Server unassigned')
      await loadData()
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : 'Failed to assign server')
    }
  }

  // ── Table position ──────────────────────────────────────────────────────────
  async function handleMoveTable(tableId: string, gridX: number | null, gridY: number | null): Promise<void> {
    if (!accessToken) return
    // Optimistic update
    setTables((prev) =>
      prev.map((t) => (t.id === tableId ? { ...t, grid_x: gridX, grid_y: gridY } : t)),
    )
    try {
      await saveTablePosition(supabaseUrl, accessToken, tableId, gridX, gridY)
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : 'Failed to save position')
      await loadData()
    }
  }

  // ── Table CRUD via dialog ───────────────────────────────────────────────────
  function handleCellClick(col: number, row: number): void {
    if (!selectedSectionId) return
    setPendingAdd({ col, row, sectionId: selectedSectionId })
  }

  async function handleAddTable(label: string, seatCount: number): Promise<void> {
    if (!accessToken || !pendingAdd) return
    try {
      const tableId = await callCreateTable(supabaseUrl, accessToken, restaurantId, label, seatCount)
      // Assign to section and place on grid
      await callAssignTableSection(supabaseUrl, accessToken, tableId, pendingAdd.sectionId)
      await saveTablePosition(supabaseUrl, accessToken, tableId, pendingAdd.col, pendingAdd.row)
      invalidateTablePositionsCache(supabaseUrl)
      showFeedback('success', `Table "${label}" added`)
      setPendingAdd(null)
      await loadData()
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : 'Failed to add table')
    }
  }

  async function handleEditTable(label: string, seatCount: number): Promise<void> {
    if (!accessToken || !pendingEdit) return
    try {
      await callUpdateTable(supabaseUrl, accessToken, pendingEdit.table.id, label, seatCount)
      showFeedback('success', `Table "${label}" updated`)
      setPendingEdit(null)
      await loadData()
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : 'Failed to update table')
    }
  }

  async function handleDeleteTable(): Promise<void> {
    if (!accessToken || !pendingEdit) return
    try {
      await callDeleteTable(supabaseUrl, accessToken, pendingEdit.table.id)
      showFeedback('success', 'Table deleted')
      setPendingEdit(null)
      await loadData()
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : 'Failed to delete table')
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold text-white">Floor Plan</h1>
        <p className="text-zinc-400">Loading floor plan…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold text-white">Floor Plan</h1>
        <p className="text-red-400">{error}</p>
      </div>
    )
  }

  const selectedSection = selectedSectionId
    ? sections.find((s) => s.id === selectedSectionId) ?? null
    : null
  const selectedSectionIndex = selectedSection
    ? sections.findIndex((s) => s.id === selectedSection.id)
    : -1
  const sectionTables = selectedSectionId
    ? tables.filter((t) => t.section_id === selectedSectionId)
    : []

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-white">Floor Plan</h1>
          {refreshing && (
            <span className="text-xs text-zinc-500 animate-pulse">Refreshing…</span>
          )}
        </div>
        <span className="text-sm text-zinc-500">Drag tables to arrange • Click empty cell to add</span>
      </div>

      {feedback && (
        <div
          role="status"
          className={[
            'px-4 py-2 rounded-xl text-sm font-medium',
            feedback.type === 'success' ? 'bg-green-800 text-green-100' : 'bg-red-800 text-red-100',
          ].join(' ')}
        >
          {feedback.message}
        </div>
      )}

      {/* Section tabs bar — horizontally scrollable on mobile */}
      {sections.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
          {sections.map((section) => {
            const isActive = selectedSectionId === section.id
            const count = tables.filter((t) => t.section_id === section.id).length
            return (
              <button
                key={section.id}
                type="button"
                onClick={() => setSelectedSectionId(isActive ? null : section.id)}
                className={[
                  'flex-shrink-0 min-h-[40px] px-4 rounded-xl text-sm font-medium transition-colors border',
                  isActive
                    ? 'bg-indigo-600 text-white border-indigo-500'
                    : 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700 hover:border-zinc-500',
                ].join(' ')}
              >
                {section.name}
                <span className="ml-1.5 text-xs opacity-70">({count})</span>
              </button>
            )
          })}
        </div>
      )}

      <div className="flex gap-4 items-start">
        {/* Left sidebar */}
        <SectionSidebar
          sections={sections}
          tables={tables}
          staffUsers={staffUsers}
          selectedSectionId={selectedSectionId}
          onSelectSection={setSelectedSectionId}
          onCreateSection={handleCreateSection}
          onDeleteSection={handleDeleteSection}
        />

        {/* Main area */}
        {selectedSection ? (
          <SectionGrid
            section={selectedSection}
            sectionIndex={selectedSectionIndex}
            allSectionTables={sectionTables}
            staffUsers={staffUsers}
            onMoveTable={handleMoveTable}
            onCellClick={handleCellClick}
            onTableClick={(table) => setPendingEdit({ table })}
            onRenameSection={(name) => { void handleRenameSection(selectedSection.id, name) }}
            onChangeGridSize={(cols, rows) => { void handleChangeSectionGridSize(selectedSection.id, cols, rows) }}
            onAssignServer={(serverId) => { void handleAssignServer(selectedSection.id, serverId) }}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center min-h-[400px] rounded-2xl border-2 border-dashed border-zinc-700">
            <div className="text-center">
              {sections.length === 0 ? (
                <>
                  <p className="text-zinc-400 text-lg font-medium mb-2">Welcome to Floor Plan</p>
                  <p className="text-zinc-600 text-sm max-w-xs">
                    Create your first section in the sidebar to start building your restaurant layout.
                    Sections represent rooms or zones like &quot;Main Hall&quot;, &quot;Patio&quot;, or &quot;VIP&quot;.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-zinc-400 text-lg font-medium mb-2">Select a section</p>
                  <p className="text-zinc-600 text-sm">
                    Click a section in the sidebar or tabs above to view and edit its grid.
                  </p>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Add Table dialog */}
      {pendingAdd && (
        <TableDialog
          mode="add"
          onSubmit={handleAddTable}
          onClose={() => setPendingAdd(null)}
        />
      )}

      {/* Edit Table dialog */}
      {pendingEdit && (
        <TableDialog
          mode="edit"
          initialLabel={pendingEdit.table.label}
          initialSeatCount={pendingEdit.table.seat_count}
          onSubmit={handleEditTable}
          onDelete={handleDeleteTable}
          onClose={() => setPendingEdit(null)}
          canDelete={pendingEdit.table.open_order_id === null}
        />
      )}
    </div>
  )
}
