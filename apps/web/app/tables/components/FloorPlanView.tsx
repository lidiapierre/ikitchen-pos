'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { JSX } from 'react'
import { useRouter } from 'next/navigation'
import { useUser } from '@/lib/user-context'
import { supabase } from '@/lib/supabase'
import type { TableRow } from '../tablesData'
import { getTableStatus, STATUS_CONFIG } from '../tableStatus'
import { callCreateOrder } from './createOrderApi'

interface Props {
  tables: TableRow[]        // all dine-in tables (placed + unplaced)
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

  // Fetch grid dimensions on mount
  const fetchConfig = useCallback(async (signal: AbortSignal): Promise<void> => {
    try {
      // Step 1: get restaurant id
      const { data: restRows } = await supabase
        .from('restaurants')
        .select('id')
        .limit(1)
        .abortSignal(signal)
      const restId = restRows?.[0]?.id ?? ''

      if (!restId || signal.aborted) return

      // Step 2: fetch both config keys in a single query
      const { data: configRows } = await supabase
        .from('config')
        .select('key,value')
        .eq('restaurant_id', restId)
        .in('key', ['floor_plan_cols', 'floor_plan_rows'])
        .abortSignal(signal)

      if (signal.aborted) return

      for (const row of configRows ?? []) {
        const parsed = parseInt(row.value, 10)
        if (isNaN(parsed)) continue
        if (row.key === 'floor_plan_cols') setCols(clamp(parsed, 8, 50))
        if (row.key === 'floor_plan_rows') setRows(clamp(parsed, 4, 30))
      }
    } catch {
      // use defaults on any error (includes AbortError)
    } finally {
      if (!signal.aborted) setConfigLoading(false)
    }
  }, [])  // no deps — supabase client is a module-level singleton

  useEffect(() => {
    const controller = new AbortController()
    void fetchConfig(controller.signal)
    return () => { controller.abort() }
  }, [fetchConfig])

  // Build a lookup map: "x-y" → TableRow
  const tableMap = useMemo(() => {
    const map = new Map<string, TableRow>()
    for (const table of tables) {
      if (table.grid_x !== null && table.grid_y !== null) {
        map.set(`${table.grid_x}-${table.grid_y}`, table)
      }
    }
    return map
  }, [tables])

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
      <div className="flex items-center justify-center py-12 text-zinc-400 text-base">
        Loading floor plan…
      </div>
    )
  }

  const cells: JSX.Element[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const table = tableMap.get(`${c}-${r}`)
      if (!table) {
        cells.push(
          <div
            key={`empty-${c}-${r}`}
            className="border border-zinc-800/40 aspect-square min-w-12"
          />,
        )
      } else {
        const status = getTableStatus(table)
        const { label: statusLabel, cardClass } = STATUS_CONFIG[status]
        const isLoading = tappingTableId === table.id

        cells.push(
          // Wrapper gives the cell its square dimensions; button fills it with inset padding
          <div key={table.id} className="aspect-square p-[3px] min-w-12">
            <button
              type="button"
              disabled={isLoading}
              onClick={() => { void handleTableTap(table) }}
              className={[
                'rounded-xl border-2 w-full h-full',
                'flex flex-col items-center justify-center',
                'transition-colors select-none',
                isLoading ? 'opacity-60 cursor-wait' : '',
                cardClass,
              ].join(' ')}
            >
              <span className="text-white font-bold text-sm leading-tight">
                {table.label}
              </span>
              <span className="text-white text-xs mt-0.5 opacity-80">
                {isLoading ? '…' : statusLabel}
              </span>
            </button>
          </div>,
        )
      }
    }
  }

  return (
    <div>
      {tapError !== null && (
        <p className="text-red-400 text-sm mb-3">{tapError}</p>
      )}
      {/* overflow-x-auto: if cols×min-cell-width (cols×48px) exceeds the container,
          the grid scrolls horizontally rather than shrinking cells below 48px touch targets.
          gridTemplateColumns inline style is required — Tailwind cannot generate arbitrary
          repeat() values at runtime. */}
      <div className="overflow-x-auto">
        <div
          className="grid"
          style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
        >
          {cells}
        </div>
      </div>
    </div>
  )
}
