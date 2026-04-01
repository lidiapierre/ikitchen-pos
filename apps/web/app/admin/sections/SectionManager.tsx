'use client'

import { useState, useEffect, useCallback } from 'react'
import type { JSX } from 'react'
import { useUser } from '@/lib/user-context'
import {
  fetchSections,
  fetchSectionTables,
  fetchStaffUsers,
  fetchRestaurantId,
} from './sectionsData'
import type { Section, SectionTable, StaffUser } from './sectionsData'
import {
  callCreateSection,
  callUpdateSection,
  callDeleteSection,
  callAssignTableSection,
} from './sectionsApi'
import { Plus, Trash2, X, ChevronDown, ChevronUp } from 'lucide-react'

type FeedbackType = 'success' | 'error'
interface Feedback {
  type: FeedbackType
  message: string
}

export default function SectionManager(): JSX.Element {
  const { accessToken: _at } = useUser(); const accessToken = _at ?? ''

  const [sections, setSections] = useState<Section[]>([])
  const [tables, setTables] = useState<SectionTable[]>([])
  const [staffUsers, setStaffUsers] = useState<StaffUser[]>([])
  const [restaurantId, setRestaurantId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<Feedback | null>(null)

  // Create section state
  const [newSectionName, setNewSectionName] = useState('')
  const [creating, setCreating] = useState(false)

  // Expanded section for table assignment
  const [expandedSectionId, setExpandedSectionId] = useState<string | null>(null)

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''

  const loadData = useCallback(async () => {
    if (!accessToken) return
    setError(null)
    try {
      const [secs, tbls, staff, rid] = await Promise.all([
        fetchSections(supabaseUrl, accessToken),
        fetchSectionTables(supabaseUrl, accessToken),
        fetchStaffUsers(supabaseUrl, accessToken),
        fetchRestaurantId(supabaseUrl, accessToken),
      ])
      setSections(secs)
      setTables(tbls)
      setStaffUsers(staff)
      setRestaurantId(rid)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [accessToken, supabaseUrl])

  useEffect(() => {
    void loadData()
  }, [loadData])

  async function handleCreateSection(): Promise<void> {
    if (!newSectionName.trim() || !accessToken || !restaurantId) return
    setCreating(true)
    setFeedback(null)
    try {
      await callCreateSection(supabaseUrl, accessToken, restaurantId, newSectionName.trim())
      setNewSectionName('')
      setFeedback({ type: 'success', message: 'Section created' })
      await loadData()
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Failed to create section' })
    } finally {
      setCreating(false)
    }
  }

  async function handleDeleteSection(sectionId: string): Promise<void> {
    if (!accessToken) return
    setFeedback(null)
    try {
      await callDeleteSection(supabaseUrl, accessToken, sectionId)
      setFeedback({ type: 'success', message: 'Section deleted' })
      if (expandedSectionId === sectionId) setExpandedSectionId(null)
      await loadData()
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Failed to delete section' })
    }
  }

  async function handleAssignServer(sectionId: string, serverId: string | null): Promise<void> {
    if (!accessToken) return
    setFeedback(null)
    try {
      await callUpdateSection(supabaseUrl, accessToken, sectionId, {
        assigned_server_id: serverId,
      })
      setFeedback({ type: 'success', message: serverId ? 'Server assigned' : 'Server unassigned' })
      await loadData()
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Failed to assign server' })
    }
  }

  async function handleAssignTable(tableId: string, sectionId: string | null): Promise<void> {
    if (!accessToken) return
    setFeedback(null)
    try {
      await callAssignTableSection(supabaseUrl, accessToken, tableId, sectionId)
      setFeedback({ type: 'success', message: sectionId ? 'Table assigned to section' : 'Table removed from section' })
      await loadData()
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Failed to assign table' })
    }
  }

  if (loading) {
    return <p className="text-zinc-400 text-lg p-6">Loading sections…</p>
  }

  if (error) {
    return <p className="text-red-400 text-lg p-6">{error}</p>
  }

  const unassignedTables = tables.filter(t => t.section_id === null)

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Sections</h1>
      <p className="text-zinc-400 text-base">
        Group tables into sections and assign servers to each section.
      </p>

      {feedback && (
        <p className={feedback.type === 'success' ? 'text-green-400 text-sm' : 'text-red-400 text-sm'}>
          {feedback.message}
        </p>
      )}

      {/* Create section */}
      <div className="flex gap-3 items-end">
        <div className="flex-1">
          <label htmlFor="new-section-name" className="block text-zinc-400 text-sm mb-1">
            New Section Name
          </label>
          <input
            id="new-section-name"
            type="text"
            value={newSectionName}
            onChange={e => setNewSectionName(e.target.value)}
            placeholder="e.g. Patio, Main Hall, Upstairs"
            className="w-full min-h-[48px] px-4 rounded-xl text-base bg-zinc-800 text-white border-2 border-zinc-600 focus:border-indigo-400 focus:outline-none"
            onKeyDown={e => { if (e.key === 'Enter') void handleCreateSection() }}
          />
        </div>
        <button
          type="button"
          onClick={() => { void handleCreateSection() }}
          disabled={creating || !newSectionName.trim()}
          className={[
            'min-h-[48px] px-6 rounded-xl text-base font-semibold transition-colors flex items-center gap-2',
            creating || !newSectionName.trim()
              ? 'bg-zinc-700 text-zinc-400 cursor-not-allowed'
              : 'bg-indigo-600 hover:bg-indigo-500 text-white',
          ].join(' ')}
        >
          <Plus size={18} aria-hidden="true" />
          {creating ? 'Creating…' : 'Add'}
        </button>
      </div>

      {/* Section list */}
      {sections.length === 0 ? (
        <p className="text-zinc-500 text-base">No sections yet. Create one above.</p>
      ) : (
        <div className="space-y-4">
          {sections.map(section => {
            const sectionTables = tables.filter(t => t.section_id === section.id)
            const assignedServer = staffUsers.find(u => u.id === section.assigned_server_id)
            const isExpanded = expandedSectionId === section.id

            return (
              <div key={section.id} className="bg-zinc-800 rounded-xl border border-zinc-700 overflow-hidden">
                {/* Section header */}
                <div className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3 flex-1">
                    <button
                      type="button"
                      onClick={() => setExpandedSectionId(isExpanded ? null : section.id)}
                      className="text-zinc-400 hover:text-white min-h-[44px] min-w-[44px] flex items-center justify-center"
                      aria-label={isExpanded ? 'Collapse' : 'Expand'}
                    >
                      {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </button>
                    <div>
                      <h3 className="text-white font-semibold text-lg">{section.name}</h3>
                      <p className="text-zinc-500 text-sm">
                        {sectionTables.length} table{sectionTables.length !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>

                  {/* Server assignment */}
                  <div className="flex items-center gap-3">
                    <select
                      value={section.assigned_server_id ?? ''}
                      onChange={e => {
                        void handleAssignServer(section.id, e.target.value || null)
                      }}
                      className="min-h-[44px] px-3 rounded-lg bg-zinc-700 text-white border border-zinc-600 text-sm"
                    >
                      <option value="">No server assigned</option>
                      {staffUsers.map(u => (
                        <option key={u.id} value={u.id}>
                          {u.name ?? u.email}
                        </option>
                      ))}
                    </select>

                    {assignedServer && (
                      <span className="text-sm bg-indigo-600/30 text-indigo-300 border border-indigo-700 rounded-full px-2.5 py-0.5">
                        {assignedServer.name ?? assignedServer.email}
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={() => { void handleDeleteSection(section.id) }}
                      className="text-zinc-500 hover:text-red-400 min-h-[44px] min-w-[44px] flex items-center justify-center transition-colors"
                      aria-label="Delete section"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>

                {/* Expanded: table assignment */}
                {isExpanded && (
                  <div className="border-t border-zinc-700 p-4 space-y-3">
                    <p className="text-zinc-400 text-sm font-medium">Tables in this section:</p>
                    {sectionTables.length === 0 ? (
                      <p className="text-zinc-600 text-sm">No tables assigned to this section yet.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {sectionTables.map(t => (
                          <span
                            key={t.id}
                            className="inline-flex items-center gap-1 bg-zinc-700 text-white rounded-lg px-3 py-1.5 text-sm"
                          >
                            {t.label}
                            <button
                              type="button"
                              onClick={() => { void handleAssignTable(t.id, null) }}
                              className="text-zinc-400 hover:text-red-400 ml-1"
                              aria-label={`Remove ${t.label} from section`}
                            >
                              <X size={14} />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Add unassigned tables */}
                    {unassignedTables.length > 0 && (
                      <div>
                        <p className="text-zinc-400 text-sm font-medium mt-3 mb-2">Add tables:</p>
                        <div className="flex flex-wrap gap-2">
                          {unassignedTables.map(t => (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => { void handleAssignTable(t.id, section.id) }}
                              className="inline-flex items-center gap-1 bg-zinc-900 text-zinc-300 hover:text-white hover:bg-zinc-700 border border-zinc-600 hover:border-indigo-500 rounded-lg px-3 py-1.5 text-sm transition-colors"
                            >
                              <Plus size={14} />
                              {t.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Unassigned tables */}
      {unassignedTables.length > 0 && (
        <div className="bg-zinc-800/50 rounded-xl border border-zinc-700/50 p-4">
          <h3 className="text-zinc-400 font-semibold text-base mb-2">
            Unassigned Tables ({unassignedTables.length})
          </h3>
          <div className="flex flex-wrap gap-2">
            {unassignedTables.map(t => (
              <span
                key={t.id}
                className="bg-zinc-700/50 text-zinc-400 rounded-lg px-3 py-1.5 text-sm"
              >
                {t.label}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
