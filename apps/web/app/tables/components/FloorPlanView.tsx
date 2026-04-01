'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { JSX } from 'react'
import { useRouter } from 'next/navigation'
import { useUser } from '@/lib/user-context'
import type { TableRow } from '../tablesData'
import { getTableStatus, STATUS_CONFIG } from '../tableStatus'
import { callCreateOrder } from './createOrderApi'

interface Props {
  tables: TableRow[]        // all dine-in tables (placed + unplaced)
  supabaseUrl: string
  supabaseKey: string       // NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
}

const DEFAULT_COLS = 24
const DEFAULT_ROWS = 16
const CELL_SIZE = 72

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export default function FloorPlanView({ tables, supabaseUrl, supabaseKey }: Props): JSX.Element {
  const router = useRouter()
  const { accessToken } = useUser()

  const [cols, setCols] = useState<number>(DEFAULT_COLS)
  const [rows, setRows] = useState<number>(DEFAULT_ROWS)
  const [configLoading, setConfigLoading] = useState(true)
  const [tappingTableId, setTappingTableId] = useState<string | null>(null)
  const [tapError, setTapError] = useState<string | null>(null)

  // Fetch grid dimensions on mount
  const fetchConfig = useCallback(async (): Promise<void> => {
    try {
      const headers: Record<string, string> = {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      }

      // Step 1: fetch restaurant id
      let restId = ''
      try {
        const restRes = await fetch(
          `${supabaseUrl}/rest/v1/restaurants?select=id&limit=1`,
          { headers },
        )
        if (restRes.ok) {
          const restRows = (await restRes.json()) as Array<{ id: string }>
          restId = restRows[0]?.id ?? ''
        }
      } catch {
        // fall through with empty restId
      }

      // Step 2 & 3: fetch cols and rows in parallel
      const [colsRes, rowsRes] = await Promise.all([
        fetch(
          `${supabaseUrl}/rest/v1/config?select=key,value&restaurant_id=eq.${restId}&key=eq.floor_plan_cols&limit=1`,
          { headers },
        ),
        fetch(
          `${supabaseUrl}/rest/v1/config?select=key,value&restaurant_id=eq.${restId}&key=eq.floor_plan_rows&limit=1`,
          { headers },
        ),
      ])

      if (colsRes.ok) {
        const colsData = (await colsRes.json()) as Array<{ key: string; value: string }>
        const parsedCols = parseInt(colsData[0]?.value ?? '', 10)
        if (!isNaN(parsedCols)) {
          setCols(clamp(parsedCols, 8, 50))
        }
      }

      if (rowsRes.ok) {
        const rowsData = (await rowsRes.json()) as Array<{ key: string; value: string }>
        const parsedRows = parseInt(rowsData[0]?.value ?? '', 10)
        if (!isNaN(parsedRows)) {
          setRows(clamp(parsedRows, 4, 30))
        }
      }
    } catch {
      // use defaults
    } finally {
      setConfigLoading(false)
    }
  }, [supabaseUrl, supabaseKey])

  useEffect(() => {
    void fetchConfig()
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
        router.push(`/tables/${table.id}/order/${table.open_order_id}`)
        return
      }
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL
      if (!url || !accessToken) throw new Error('Not authenticated')
      const result = await callCreateOrder(url, accessToken, table.id)
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
            className="border border-zinc-800/40 w-[72px] h-[72px]"
          />,
        )
      } else {
        const status = getTableStatus(table)
        const { label: statusLabel, cardClass } = STATUS_CONFIG[status]
        const isLoading = tappingTableId === table.id

        cells.push(
          <button
            key={table.id}
            type="button"
            disabled={isLoading}
            onClick={() => { void handleTableTap(table) }}
            className={[
              'rounded-xl border-2 w-[66px] h-[66px] m-[3px]',
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
          </button>,
        )
      }
    }
  }

  return (
    <div>
      {tapError !== null && (
        <p className="text-red-400 text-sm mb-3">{tapError}</p>
      )}
      <div className="overflow-auto">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${cols}, ${CELL_SIZE}px)`,
            gridTemplateRows: `repeat(${rows}, ${CELL_SIZE}px)`,
            width: cols * CELL_SIZE,
          }}
        >
          {cells}
        </div>
      </div>
    </div>
  )
}
