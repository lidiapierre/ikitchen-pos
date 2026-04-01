'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import TableCard from './components/TableCard'
import FloorPlanView from './components/FloorPlanView'
import { fetchTables, fetchTakeawayDeliveryQueue } from './tablesData'
import type { TableRow, TakeawayDeliveryOrder } from './tablesData'
import { getTablesCache, setTablesCache } from '@/lib/tablesCache'
import type { TableStatus } from './tableStatus'
import { callCreateOrder } from './components/createOrderApi'
import { useUser } from '@/lib/user-context'
import { ShoppingBag, Bike, X } from 'lucide-react'

/** Auto-refresh interval in milliseconds (30 seconds) */
const REFRESH_INTERVAL_MS = 30_000

const STATUS_LEGEND: { status: TableStatus; label: string; dotClass: string }[] = [
  { status: 'available', label: 'Empty', dotClass: 'bg-zinc-500' },
  { status: 'seated', label: 'Seated', dotClass: 'bg-blue-500' },
  { status: 'ordered', label: 'Ordered', dotClass: 'bg-green-500' },
  { status: 'overdue', label: 'Overdue (>2h)', dotClass: 'bg-red-500' },
]

/** Returns a human-readable order age string from an ISO timestamp. */
function orderAge(createdAt: string): string {
  const diffMs = Date.now() - new Date(createdAt).getTime()
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 1) return '<1m'
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  const rem = mins % 60
  return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`
}

export default function TablesPage(): JSX.Element {
  const router = useRouter()
  const { accessToken: _at } = useUser(); const accessToken = _at ?? ''

  const [tables, setTables] = useState<TableRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [queue, setQueue] = useState<TakeawayDeliveryOrder[]>([])

  // Delivery modal state
  const [showDeliveryModal, setShowDeliveryModal] = useState(false)
  const [deliveryCustomerName, setDeliveryCustomerName] = useState('')
  const [deliveryNote, setDeliveryNote] = useState('')
  const [creatingOrder, setCreatingOrder] = useState(false)
  const [createOrderError, setCreateOrderError] = useState<string | null>(null)

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadAll = useCallback((): void => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

    if (!supabaseUrl || !accessToken) {
      setError('Supabase is not configured')
      setLoading(false)
      return
    }

    setError(null)

    Promise.all([
      fetchTables(supabaseUrl, accessToken),
      fetchTakeawayDeliveryQueue(supabaseUrl, accessToken),
    ])
      .then(([t, q]) => {
        setTablesCache(t, q)
        setTables(t)
        setQueue(q)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load tables')
      })
      .finally(() => { setLoading(false) })
  }, [])

  // Initial load — show cached data immediately (stale-while-revalidate)
  useEffect(() => {
    const cached = getTablesCache()
    if (cached !== null) {
      // Serve stale data instantly so the page is usable right away
      setTables(cached.tables)
      setQueue(cached.queue)
      setLoading(false)
    }
    // Always kick off a background (or foreground) refresh
    loadAll()
  }, [loadAll])

  // Auto-refresh every 30s
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      if (!supabaseUrl || !accessToken) return

      Promise.all([
        fetchTables(supabaseUrl, accessToken),
        fetchTakeawayDeliveryQueue(supabaseUrl, accessToken),
      ])
        .then(([t, q]) => {
          setTablesCache(t, q)
          setTables(t)
          setQueue(q)
        })
        .catch(() => { /* silent background refresh failure */ })
    }, REFRESH_INTERVAL_MS)

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current)
      }
    }
  }, [])

  async function handleCreateTakeaway(): Promise<void> {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!supabaseUrl || !accessToken) {
      setCreateOrderError('Not authenticated')
      return
    }
    setCreatingOrder(true)
    setCreateOrderError(null)
    try {
      const result = await callCreateOrder(supabaseUrl, accessToken, {
        orderType: 'takeaway',
      })
      router.push(`/tables/takeaway/order/${result.order_id}`)
    } catch (err) {
      setCreateOrderError(err instanceof Error ? err.message : 'Failed to create takeaway order')
      setCreatingOrder(false)
    }
  }

  async function handleCreateDelivery(): Promise<void> {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!supabaseUrl || !accessToken) {
      setCreateOrderError('Not authenticated')
      return
    }
    if (!deliveryCustomerName.trim()) {
      setCreateOrderError('Customer name is required for delivery orders')
      return
    }
    setCreatingOrder(true)
    setCreateOrderError(null)
    try {
      const result = await callCreateOrder(supabaseUrl, accessToken, {
        orderType: 'delivery',
        customerName: deliveryCustomerName.trim(),
        deliveryNote: deliveryNote.trim() || undefined,
      })
      setShowDeliveryModal(false)
      setDeliveryCustomerName('')
      setDeliveryNote('')
      router.push(`/tables/delivery/order/${result.order_id}`)
    } catch (err) {
      setCreateOrderError(err instanceof Error ? err.message : 'Failed to create delivery order')
      setCreatingOrder(false)
    }
  }

  return (
    <main className="min-h-screen bg-zinc-900 p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-white">Tables</h1>
        <div className="flex items-center gap-3">
          <Link
            href="/shifts"
            className="text-zinc-400 hover:text-white text-base font-medium px-4 py-2 rounded-lg border border-zinc-700 hover:border-zinc-500 transition-colors min-h-[48px] flex items-center"
          >
            Shifts
          </Link>
          <button
            type="button"
            onClick={loadAll}
            className="text-zinc-400 hover:text-white text-base font-medium px-4 py-2 rounded-lg border border-zinc-700 hover:border-zinc-500 transition-colors min-h-[48px]"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Status legend */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mb-6">
        {STATUS_LEGEND.map(({ status, label, dotClass }) => (
          <span key={status} className="flex items-center gap-1.5 text-sm text-zinc-400">
            <span className={`inline-block w-3 h-3 rounded-full ${dotClass}`} />
            {label}
          </span>
        ))}
        <span className="text-xs text-zinc-600 ml-auto">Auto-refreshes every 30s</span>
      </div>

      {/* Takeaway / Delivery quick-launch buttons */}
      <div className="flex gap-3 mb-6">
        <button
          type="button"
          onClick={() => { void handleCreateTakeaway() }}
          disabled={creatingOrder}
          className={[
            'flex-1 min-h-[56px] rounded-xl text-base font-semibold transition-colors border-2',
            creatingOrder
              ? 'border-amber-800 bg-amber-900/20 text-amber-600 cursor-wait'
              : 'border-amber-500 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 hover:border-amber-400',
          ].join(' ')}
        >
          {creatingOrder ? 'Creating…' : <span className='inline-flex items-center gap-2'><ShoppingBag size={18} aria-hidden='true' />New Takeaway Order</span>}
        </button>
        <button
          type="button"
          onClick={() => {
            setDeliveryCustomerName('')
            setDeliveryNote('')
            setCreateOrderError(null)
            setShowDeliveryModal(true)
          }}
          disabled={creatingOrder}
          className={[
            'flex-1 min-h-[56px] rounded-xl text-base font-semibold transition-colors border-2',
            creatingOrder
              ? 'border-blue-800 bg-blue-900/20 text-blue-600 cursor-wait'
              : 'border-blue-500 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 hover:border-blue-400',
          ].join(' ')}
        >
          <span className='inline-flex items-center gap-2'><Bike size={18} aria-hidden='true' />New Delivery Order</span>
        </button>
      </div>

      {createOrderError !== null && !showDeliveryModal && (
        <p className="text-red-400 text-sm mb-4">{createOrderError}</p>
      )}

      {loading ? (
        <p className="text-zinc-400 text-lg">Loading tables…</p>
      ) : error !== null ? (
        <p className="text-red-400 text-lg">{error}</p>
      ) : (
        <>
          {/* Dine-in table grid */}
          {(() => {
            const hasFloorPlan = tables.some(t => t.grid_x !== null && t.grid_y !== null)
            const unplacedTables = tables.filter(t => t.grid_x === null || t.grid_y === null)
            return hasFloorPlan ? (
              <>
                {/* Floor plan canvas */}
                <FloorPlanView
                  tables={tables}
                />

                {/* Unplaced tables strip */}
                {unplacedTables.length > 0 && (
                  <div className="mt-4">
                    <p className="text-sm font-semibold text-zinc-400 mb-2">
                      Unplaced Tables ({unplacedTables.length})
                    </p>
                    <div className="flex gap-3 overflow-x-auto pb-2">
                      {unplacedTables.map((table) => (
                        <div key={table.id} className="flex-shrink-0 w-36">
                          <TableCard table={table} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              /* Tables grouped by section */
              <div className="space-y-8 mb-10">
                {tables.length === 0 ? (
                  <p className="text-zinc-400 text-lg">No tables configured.</p>
                ) : (() => {
                  const sectionGroups = new Map<string | null, TableRow[]>()
                  for (const t of tables) {
                    const key = t.section_id
                    if (!sectionGroups.has(key)) sectionGroups.set(key, [])
                    sectionGroups.get(key)!.push(t)
                  }
                  const sectionEntries = [...sectionGroups.entries()].sort((a, b) => {
                    if (a[0] === null && b[0] !== null) return 1
                    if (a[0] !== null && b[0] === null) return -1
                    const sortA = a[1][0]?.section_sort_order ?? 0
                    const sortB = b[1][0]?.section_sort_order ?? 0
                    if (sortA !== sortB) return sortA - sortB
                    const nameA = a[1][0]?.section_name ?? ''
                    const nameB = b[1][0]?.section_name ?? ''
                    return nameA.localeCompare(nameB)
                  })
                  return sectionEntries.map(([sectionId, sectionTables]) => {
                    const sectionName = sectionTables[0]?.section_name ?? null
                    const serverName = sectionTables[0]?.assigned_server_name ?? null
                    return (
                      <div key={sectionId ?? 'unsectioned'}>
                        <div className="flex items-center gap-3 mb-3">
                          <h2 className="text-lg font-bold text-white">{sectionName ?? 'Unsectioned'}</h2>
                          {serverName && (
                            <span className="text-sm bg-indigo-600/30 text-indigo-300 border border-indigo-700 rounded-full px-2.5 py-0.5">{serverName}</span>
                          )}
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                          {sectionTables.map(table => (
                            <TableCard key={table.id} table={table} />
                          ))}
                        </div>
                      </div>
                    )
                  })
                })()}
              </div>
            )
          })()}

          {/* Takeaway / Delivery Queue */}
          <section>
            <h2 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
              <span>Takeaway / Delivery Queue</span>
              {queue.length > 0 && (
                <span className="text-sm font-normal bg-amber-500/20 text-amber-400 border border-amber-700 rounded-full px-2 py-0.5">
                  {queue.length}
                </span>
              )}
            </h2>
            {queue.length === 0 ? (
              <p className="text-zinc-500 text-base">No active takeaway or delivery orders.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {queue.map((order) => {
                  const isDelivery = order.order_type === 'delivery'
                  const urlSegment = isDelivery ? 'delivery' : 'takeaway'
                  return (
                    <button
                      key={order.id}
                      type="button"
                      onClick={() => { router.push(`/tables/${urlSegment}/order/${order.id}`) }}
                      className={[
                        'flex flex-col gap-2 p-4 rounded-xl border-2 text-left transition-colors',
                        isDelivery
                          ? 'border-blue-700 bg-blue-900/20 hover:bg-blue-900/40 hover:border-blue-500'
                          : 'border-amber-700 bg-amber-900/20 hover:bg-amber-900/40 hover:border-amber-500',
                      ].join(' ')}
                    >
                      {/* Type badge + age */}
                      <div className="flex items-center justify-between">
                        <span className={[
                          'text-xs font-bold px-2 py-0.5 rounded-full',
                          isDelivery
                            ? 'bg-blue-900/60 text-blue-300'
                            : 'bg-amber-900/60 text-amber-300',
                        ].join(' ')}>
                          {isDelivery ? <span className='inline-flex items-center gap-1'><Bike size={12} aria-hidden='true' />DELIVERY</span> : <span className='inline-flex items-center gap-1'><ShoppingBag size={12} aria-hidden='true' />TAKEAWAY</span>}
                        </span>
                        <span className="text-xs text-zinc-500">{orderAge(order.created_at)}</span>
                      </div>

                      {/* Customer name (delivery only) */}
                      {isDelivery && order.customer_name && (
                        <p className="text-white font-semibold text-base">{order.customer_name}</p>
                      )}

                      {/* Item count */}
                      <p className="text-zinc-400 text-sm">
                        {order.item_count} item{order.item_count !== 1 ? 's' : ''}
                      </p>

                      {/* Order ID snippet */}
                      <p className="text-zinc-600 text-xs font-mono">{order.id.slice(0, 8)}</p>
                    </button>
                  )
                })}
              </div>
            )}
          </section>
        </>
      )}

      {/* Delivery order modal */}
      {showDeliveryModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70">
          <div className="w-full max-w-lg bg-zinc-900 rounded-t-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-white flex items-center gap-2"><Bike size={20} aria-hidden="true" />New Delivery Order</h2>
              <button
                type="button"
                onClick={() => {
                  setShowDeliveryModal(false)
                  setCreateOrderError(null)
                }}
                className="min-h-[48px] min-w-[48px] text-zinc-400 hover:text-white flex items-center justify-center"
                aria-label="Close"
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>

            <div>
              <label htmlFor="delivery-customer-name" className="block text-zinc-400 text-base mb-2">
                Customer Name <span className="text-red-400">*</span>
              </label>
              <input
                id="delivery-customer-name"
                type="text"
                placeholder="e.g. Ahmed Khan"
                value={deliveryCustomerName}
                onChange={(e) => { setDeliveryCustomerName(e.target.value) }}
                className="w-full min-h-[48px] px-4 rounded-xl text-base bg-zinc-800 text-white border-2 border-zinc-600 focus:border-blue-400 focus:outline-none"
                autoFocus
              />
            </div>

            <div>
              <label htmlFor="delivery-note" className="block text-zinc-400 text-base mb-2">
                Delivery Note <span className="text-zinc-600">(optional)</span>
              </label>
              <input
                id="delivery-note"
                type="text"
                placeholder="e.g. Road 12, House 5, Ring the bell"
                value={deliveryNote}
                onChange={(e) => { setDeliveryNote(e.target.value) }}
                className="w-full min-h-[48px] px-4 rounded-xl text-base bg-zinc-800 text-white border-2 border-zinc-600 focus:border-blue-400 focus:outline-none"
              />
            </div>

            {createOrderError !== null && (
              <p className="text-red-400 text-sm">{createOrderError}</p>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowDeliveryModal(false)
                  setCreateOrderError(null)
                }}
                disabled={creatingOrder}
                className="flex-1 min-h-[48px] min-w-[48px] px-6 rounded-xl text-base font-semibold border-2 border-zinc-600 text-zinc-300 hover:border-zinc-400 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => { void handleCreateDelivery() }}
                disabled={creatingOrder || deliveryCustomerName.trim() === ''}
                className={[
                  'flex-1 min-h-[48px] min-w-[48px] px-6 rounded-xl text-base font-semibold transition-colors',
                  creatingOrder || deliveryCustomerName.trim() === ''
                    ? 'bg-zinc-700 text-zinc-400 cursor-wait'
                    : 'bg-blue-600 hover:bg-blue-500 text-white',
                ].join(' ')}
              >
                {creatingOrder ? 'Creating…' : 'Create Order'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
