'use client'

import { useState } from 'react'
import type { JSX } from 'react'
import { Plus, Trash2, GripVertical } from 'lucide-react'
import type { UnifiedSection, UnifiedTable, StaffUser } from './unifiedFloorPlanData'

/** Section tint colors for visual distinction */
const SECTION_TINTS = [
  'bg-indigo-900/20 border-indigo-800/40',
  'bg-emerald-900/20 border-emerald-800/40',
  'bg-amber-900/20 border-amber-800/40',
  'bg-rose-900/20 border-rose-800/40',
  'bg-cyan-900/20 border-cyan-800/40',
  'bg-purple-900/20 border-purple-800/40',
  'bg-orange-900/20 border-orange-800/40',
  'bg-teal-900/20 border-teal-800/40',
]

export function getSectionTint(index: number): string {
  return SECTION_TINTS[index % SECTION_TINTS.length]
}

interface SectionSidebarProps {
  sections: UnifiedSection[]
  tables: UnifiedTable[]
  staffUsers: StaffUser[]
  selectedSectionId: string | null
  onSelectSection: (id: string | null) => void
  onCreateSection: (name: string) => Promise<void>
  onDeleteSection: (id: string) => Promise<void>
}

export default function SectionSidebar({
  sections,
  tables,
  staffUsers,
  selectedSectionId,
  onSelectSection,
  onCreateSection,
  onDeleteSection,
}: SectionSidebarProps): JSX.Element {
  const [newSectionName, setNewSectionName] = useState('')
  const [creating, setCreating] = useState(false)
  const [deletingSectionId, setDeletingSectionId] = useState<string | null>(null)

  const unassignedTables = tables.filter((t) => t.section_id === null)

  async function handleCreate(): Promise<void> {
    if (!newSectionName.trim()) return
    setCreating(true)
    try {
      await onCreateSection(newSectionName.trim())
      setNewSectionName('')
    } finally {
      setCreating(false)
    }
  }

  async function handleDelete(sectionId: string): Promise<void> {
    try {
      await onDeleteSection(sectionId)
    } finally {
      setDeletingSectionId(null)
    }
  }

  return (
    <div className="flex-shrink-0 w-[260px] flex flex-col gap-3 overflow-y-auto max-h-[calc(100vh-200px)]">
      {/* Add Section */}
      <div className="flex gap-2">
        <input
          type="text"
          value={newSectionName}
          onChange={(e) => setNewSectionName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void handleCreate() }}
          placeholder="New section name"
          className="flex-1 min-h-[44px] px-3 rounded-xl text-sm bg-zinc-800 text-white border border-zinc-600 focus:border-indigo-500 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => { void handleCreate() }}
          disabled={creating || !newSectionName.trim()}
          className="min-h-[44px] min-w-[44px] rounded-xl bg-indigo-600 text-white hover:bg-indigo-500 transition-colors disabled:opacity-50 flex items-center justify-center"
          aria-label="Add section"
        >
          <Plus size={18} aria-hidden="true" />
        </button>
      </div>

      {/* Section list */}
      {sections.length === 0 ? (
        <div className="text-center py-8 px-4">
          <p className="text-zinc-400 text-sm font-medium mb-1">No sections yet</p>
          <p className="text-zinc-600 text-xs">
            Create a section above to organize your floor plan into rooms or zones.
          </p>
        </div>
      ) : (
        sections.map((section, idx) => {
          const sectionTables = tables.filter((t) => t.section_id === section.id)
          const assignedServer = staffUsers.find((u) => u.id === section.assigned_server_id)
          const isSelected = selectedSectionId === section.id
          const tint = getSectionTint(idx)

          return (
            <div
              key={section.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelectSection(isSelected ? null : section.id)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectSection(isSelected ? null : section.id) } }}
              className={[
                'flex flex-col gap-1.5 p-3 rounded-xl border text-left transition-all cursor-pointer',
                isSelected
                  ? 'border-indigo-500 bg-indigo-900/30 ring-1 ring-indigo-500/50'
                  : tint + ' hover:border-zinc-500',
              ].join(' ')}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <GripVertical size={14} className="text-zinc-600" aria-hidden="true" />
                  <span className="text-white font-semibold text-sm">{section.name}</span>
                </div>
                {deletingSectionId === section.id ? (
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); void handleDelete(section.id) }}
                      className="text-xs text-red-400 hover:text-red-300 px-1.5 py-0.5 rounded bg-red-900/30"
                    >
                      Yes
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setDeletingSectionId(null) }}
                      className="text-xs text-zinc-400 hover:text-zinc-300 px-1.5 py-0.5 rounded bg-zinc-700"
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setDeletingSectionId(section.id) }}
                    className="text-zinc-600 hover:text-red-400 transition-colors p-1"
                    aria-label={`Delete ${section.name}`}
                  >
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs text-zinc-400">
                <span>{sectionTables.length} table{sectionTables.length !== 1 ? 's' : ''}</span>
                <span className="text-zinc-600">•</span>
                <span>{section.grid_cols}×{section.grid_rows}</span>
              </div>
              {assignedServer && (
                <span className="text-xs bg-indigo-600/30 text-indigo-300 border border-indigo-700 rounded-full px-2 py-0.5 self-start">
                  {assignedServer.name ?? assignedServer.email}
                </span>
              )}
            </div>
          )
        })
      )}

      {/* Unassigned tables */}
      <div className="mt-2 border-t border-zinc-700 pt-3">
        <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">
          Unassigned Tables
          {unassignedTables.length > 0 && (
            <span className="ml-1.5 text-xs font-bold bg-zinc-700 text-zinc-300 rounded-full px-2 py-0.5 normal-case">
              {unassignedTables.length}
            </span>
          )}
        </p>
        {unassignedTables.length === 0 ? (
          <p className="text-zinc-600 text-xs">All tables assigned</p>
        ) : (
          <div className="flex flex-col gap-1">
            {unassignedTables.map((table) => (
              <div
                key={table.id}
                className="flex items-center justify-between px-3 py-2 rounded-lg bg-zinc-800/60 border border-zinc-700/50 text-sm"
              >
                <span className="text-white font-medium">{table.label}</span>
                <span className="text-zinc-500 text-xs">{table.seat_count} seats</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
