'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { JSX } from 'react'
import { useRouter } from 'next/navigation'
import { useUser } from '@/lib/user-context'
import { supabase } from '@/lib/supabase'
import type { TableRow } from '../tablesData'
import { getTableStatus, STATUS_CONFIG } from '../tableStatus'
import { callCreateOrder } from './createOrderApi'

interface SectionInfo {
  id: string
  name: string
  grid_cols: number
  grid_rows: number
  sort_order: number
  assigned_server_id: string | null
  assigned_server_name: string | null
}

interface Props {
  tables: TableRow[]
}

const DEFAULT_COLS = 24
const DEFAULT_ROWS = 16

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export default function FloorPlanView({ tables }: Props): JSX.Element {
  const router = useRouter()
  const { accessToken: _at } = useUser(); const accessToken = _at ?? ''

  const [cols, setCols] = useState<number>(DEFAULT_COLS)
  const [rows, setRows] = useState<number>(DEFAULT_ROWS)
  const [configLoading, setConfigLoading] = useState(true)
  const [tappingTableId, setTappingTableId] = useState<string | null>(null)
  const [tapError, setTapError] = useState<string | null>(null)

  const [sections, setSections] = useState<SectionInfo[]>([])
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null)
  const [myTablesOnly, setMyTablesOnly] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  // Fetch grid dimensions and sections on mount
  const fetchConfig = useCallback(async (signal: AbortSignal): Promise<void> => {
    try {
      const { data: restRows } = await supabase
        .from('restaurants')
        .select('id')
        .limit(1)
        .abortSignal(signal)
      const restId = restRows?.[0]?.id ?? ''
      if (!restId || signal.aborted) return

      // Fetch grid config, sections, and current user in parallel
      const [configResult, sectionsResult, { data: authData }] = await Promise.all([
        supabase
          .from('config')
          .select('key,value')
          .eq('restaurant_id', restId)
          .in('key', ['floor_plan_cols', 'floor_plan_rows'])
          .abortSignal(signal),
        supabase
          .from('sections')
          .select('id,name,grid_cols,grid_rows,sort_order,assigned_server_id')
          .order('sort_order', { ascending: true })
          .order('name', { ascending: true })
          .abortSignal(signal),
        supabase.auth.getUser(),
      ])

      if (signal.aborted) return

      for (const row of configResult.data ?? []) {
        const parsed = parseInt(row.value, 10)
        if (isNaN(parsed)) continue
        if (row.key === 'floor_plan_cols') setCols(clamp(parsed, 8, 50))
        if (row.key === 'floor_plan_rows') setRows(clamp(parsed, 4, 30))
      }

      // Resolve server names for sections
      const rawSections = sectionsResult.data ?? []
      const serverIds = [...new Set(rawSections.map((s: { assigned_server_id: string | null }) => s.assigned_server_id).filter(Boolean))] as string[]
      const serverNameMap = new Map<string, string>()

      if (serverIds.length > 0) {
        const { data: users } = await supabase
          .from('users')
          .select('id,name,email')
          .in('id', serverIds)
          .abortSignal(signal)
        if (!signal.aborted) {
          for (const u of users ?? []) {
            serverNameMap.set(u.id, u.name ?? u.email)
          }
        }
      }

      if (!signal.aborted) {
        setSections(rawSections.map((s: { id: string; name: string; grid_cols: number; grid_rows: number; sort_order: number; assigned_server_id: string | null }) => ({
          id: s.id,
          name: s.name,
          grid_cols: s.grid_cols,
          grid_rows: s.grid_rows,
          sort_order: s.sort_order,
          assigned_server_id: s.assigned_server_id,
          assigned_server_name: s.assigned_server_id ? serverNameMap.get(s.assigned_server_id) ?? null : null,
        })))
        setCurrentUserId(authData?.user?.id ?? null)
      }
    } catch {
      // use defaults on any error
    } finally {
      if (!signal.aborted) setConfigLoading(false)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void fetchConfig(controller.signal)
    return () => { controller.abort() }
  }, [fetchConfig])

  // Determine which tables and grid dims to show
  const activeSection = selectedSectionId ? sections.find((s) => s.id === selectedSectionId) ?? null : null
  const displayCols = activeSection ? activeSection.grid_cols : cols
  const displayRows = activeSection ? activeSection.grid_rows : rows

  const filteredTables = useMemo(() => {
    let result = tables
    if (selectedSectionId) {
      result = result.filter((t) => t.section_id === selectedSectionId)
    }
    if (myTablesOnly && currentUserId) {
      const mySectionIds = new Set(
        sections.filter((s) => s.assigned_server_id === currentUserId).map((s) => s.id),
      )
      result = result.filter((t) => t.section_id !== null && mySectionIds.has(t.section_id))
    }
    return result
  }, [tables, selectedSectionId, myTablesOnly, sections, currentUserId])

  // Build a lookup map: "x-y" → TableRow
  const tableMap = useMemo(() => {
    const map = new Map<string, TableRow>()
    for (const table of filteredTables) {
      if (table.grid_x !== null && table.grid_y !== null) {
        map.set(`${table.grid_x}-${table.grid_y}`, table)
      }
    }
    return map
  }, [filteredTables])

  async function handleTableTap(table: TableRow): Promise<void> {
    setTapError(null)
    setTappingTableId(table.id)
    try {
      if (table.open_order_id !== null) {
        setTappingTableId(null)
        router.push(`/tables/${table.id}/order/${table.open_order_id}`)
        return
      }
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL
      if (!url || !accessToken) throw new Error('Not authenticated')
      const result = await callCreateOrder(url, accessToken, table.id)
      setTappingTableId(null)
      router.push(`/tables/${table.id}/order/${result.order_id}`)
    } catch (err) {
      setTapError(err instanceof Error ? err.message : 'Failed to open table')
      setTappingTableId(null)
    }
  }

  if (configLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-brand-blue text-base">
        Loading floor plan…
      </div>
    )
  }

  // Section tabs bar
  const sectionTabs = sections.length > 0 ? (
    <div className="flex gap-2 overflow-x-auto pb-2 mb-3 scrollbar-thin">
      <button
        type="button"
        onClick={() => setSelectedSectionId(null)}
        className={[
          'flex-shrink-0 min-h-[40px] px-4 rounded-xl text-sm font-medium transition-colors border',
          selectedSectionId === null
            ? 'bg-brand-navy text-white border-brand-navy'
            : 'bg-white text-brand-navy border-brand-grey hover:border-brand-blue hover:bg-brand-offwhite',
        ].join(' ')}
      >
        All
      </button>
      {sections.map((section) => {
        const isActive = selectedSectionId === section.id
        return (
          <button
            key={section.id}
            type="button"
            onClick={() => setSelectedSectionId(isActive ? null : section.id)}
            className={[
              'flex-shrink-0 min-h-[40px] px-4 rounded-xl text-sm font-medium transition-colors border',
              isActive
                ? 'bg-brand-navy text-white border-brand-navy'
                : 'bg-white text-brand-navy border-brand-grey hover:border-brand-blue hover:bg-brand-offwhite',
            ].join(' ')}
          >
            {section.name}
            {section.assigned_server_name && (
              <span className="ml-1.5 text-xs opacity-70">• {section.assigned_server_name}</span>
            )}
          </button>
        )
      })}
      <button
        type="button"
        onClick={() => setMyTablesOnly(!myTablesOnly)}
        className={[
          'flex-shrink-0 min-h-[40px] px-4 rounded-xl text-sm font-medium transition-colors border ml-auto',
          myTablesOnly
            ? 'bg-brand-gold text-brand-navy border-brand-gold'
            : 'bg-white text-brand-navy border-brand-grey hover:border-brand-gold hover:bg-brand-offwhite',
        ].join(' ')}
      >
        My Tables
      </button>
    </div>
  ) : null

  // Grid cells
  const cells: JSX.Element[] = []
  for (let r = 0; r < displayRows; r++) {
    for (let c = 0; c < displayCols; c++) {
      const table = tableMap.get(`${c}-${r}`)
      if (!table) {
        cells.push(
          <div
            key={`empty-${c}-${r}`}
            className="aspect-square min-w-12 rounded-xl border border-brand-grey/70 bg-white/60"
          />,
        )
      } else {
        const status = getTableStatus(table)
        const { label: statusLabel, cardClass, labelClass, badgeClass } = STATUS_CONFIG[status]
        const isLoading = tappingTableId === table.id

        cells.push(
          <div key={table.id} className="aspect-square p-[3px] min-w-12">
            <button
              type="button"
              disabled={isLoading}
              onClick={() => { void handleTableTap(table) }}
              className={[
                'rounded-xl border-2 w-full h-full px-1 py-1.5',
                'flex flex-col items-center justify-center',
                'transition-colors select-none shadow-sm',
                isLoading ? 'opacity-60 cursor-wait' : '',
                cardClass,
              ].join(' ')}
            >
              <span className={["font-bold text-sm leading-tight", labelClass].join(' ')}>
                {table.label}
              </span>
              <span className={[
                'mt-1 rounded-full px-2 py-0.5 text-[11px] font-semibold border',
                badgeClass,
              ].join(' ')}>
                {isLoading ? 'Loading' : statusLabel}
              </span>
            </button>
          </div>,
        )
      }
    }
  }

  return (
    <div>
      {sectionTabs}

      {/* Section header when filtered */}
      {activeSection && (
        <div className="flex items-center gap-3 mb-3">
          <h2 className="text-lg font-bold text-brand-navy">{activeSection.name}</h2>
          {activeSection.assigned_server_name && (
            <span className="text-sm bg-brand-blue/15 text-brand-navy border border-brand-blue rounded-full px-2.5 py-0.5">
              {activeSection.assigned_server_name}
            </span>
          )}
          <span className="text-xs text-brand-grey">{activeSection.grid_cols}×{activeSection.grid_rows}</span>
        </div>
      )}

      {tapError !== null && (
        <p className="text-red-400 text-sm mb-3">{tapError}</p>
      )}

      <div className="overflow-x-auto rounded-3xl border border-brand-grey/80 bg-brand-offwhite/80 p-3 shadow-inner">
        <div
          className="grid gap-1"
          style={{ gridTemplateColumns: `repeat(${displayCols}, minmax(3rem, 1fr))` }}
        >
          {cells}
        </div>
      </div>
    </div>
  )
}
