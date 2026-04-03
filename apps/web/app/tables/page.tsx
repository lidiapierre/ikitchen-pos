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
import { useUser } from '@/lib/user-context'
import { ShoppingBag, Bike, X } from 'lucide-react'

/** Auto-refresh interval in milliseconds (30 seconds) */
const REFRESH_INTERVAL_MS = 30_000

const STATUS_LEGEND: { status: TableStatus; label: string; dotClass: string }[] = [
  { status: 'available', label: 'Empty', dotClass: 'bg-brand-grey' },
  { status: 'seated', label: 'Seated', dotClass: 'bg-brand-blue' },
  { status: 'ordered', label: 'Ordered', dotClass: 'bg-brand-gold' },
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
  const [deliveryPhone, setDeliveryPhone] = useState('')
  const [deliveryPhoneTouched, setDeliveryPhoneTouched] = useState(false)
  const [deliveryNote, setDeliveryNote] = useState('')
  const [createOrderError, setCreateOrderError] = useState<string | null>(null)
  // Customer search state (mobile lookup)
  const [customerSuggestion, setCustomerSuggestion] = useState<{ name: string; mobile: string } | null>(null)
  const customerSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken])

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

  // Debounced customer mobile search: when deliveryPhone changes, search customers table after 400ms
  useEffect(() => {
    if (customerSearchTimerRef.current !== null) {
      clearTimeout(customerSearchTimerRef.current)
    }

    const phone = deliveryPhone.trim()
    if (!phone || !showDeliveryModal) {
      setCustomerSuggestion(null)
      return
    }

    customerSearchTimerRef.current = setTimeout(() => {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ''
      if (!supabaseUrl || !accessToken) return

      const url = new URL(`${supabaseUrl}/rest/v1/customers`)
      url.searchParams.set('select', 'name,mobile')
      url.searchParams.set('mobile', `eq.${phone}`)
      url.searchParams.set('limit', '1')

      fetch(url.toString(), {
        headers: {
          apikey: publishableKey,
          Authorization: `Bearer ${accessToken}`,
        },
      })
        .then((res) => res.ok ? res.json() : Promise.reject(new Error('search failed')))
        .then((rows: unknown) => {
          const results = rows as Array<{ name: string | null; mobile: string }>
          if (results.length > 0 && results[0].name) {
            setCustomerSuggestion({ name: results[0].name, mobile: results[0].mobile })
          } else {
            setCustomerSuggestion(null)
          }
        })
        .catch(() => {
          // Non-fatal: ignore search errors
          setCustomerSuggestion(null)
        })
    }, 400)

    return () => {
      if (customerSearchTimerRef.current !== null) {
        clearTimeout(customerSearchTimerRef.current)
      }
    }
  }, [deliveryPhone, showDeliveryModal, accessToken])

  // Instant navigation — order is created in the background by the /order/new page (issue #317)
  function handleCreateTakeaway(): void {
    router.push('/tables/takeaway/order/new')
  }

  function handleCreateDelivery(): void {
    if (!deliveryCustomerName.trim()) {
      setCreateOrderError('Customer name is required for delivery orders')
      return
    }
    const params = new URLSearchParams({
      customerName: deliveryCustomerName.trim(),
      ...(deliveryPhone.trim() ? { customerPhone: deliveryPhone.trim() } : {}),
      ...(deliveryNote.trim() ? { deliveryNote: deliveryNote.trim() } : {}),
    })
    setCreateOrderError(null)
    setShowDeliveryModal(false)
    setDeliveryCustomerName('')
    setDeliveryPhone('')
    setDeliveryPhoneTouched(false)
    setDeliveryNote('')
    setCustomerSuggestion(null)
    router.push(`/tables/delivery/order/new?${params.toString()}`)
  }

  return (
    <main className="min-h-screen bg-brand-offwhite p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-brand-navy font-heading">Tables</h1>
        <div className="flex items-center gap-3">
          <Link
            href="/shifts"
            className="text-brand-blue hover:text-brand-navy text-base font-medium px-4 py-2 rounded-lg border border-brand-grey hover:border-brand-blue transition-colors min-h-[48px] flex items-center"
          >
            Shifts
          </Link>
          <button
            type="button"
            onClick={loadAll}
            className="text-brand-blue hover:text-brand-navy text-base font-medium px-4 py-2 rounded-lg border border-brand-grey hover:border-brand-blue transition-colors min-h-[48px]"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Status legend */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mb-6">
        {STATUS_LEGEND.map(({ status, label, dotClass }) => (
          <span key={status} className="flex items-center gap-1.5 text-sm text-brand-navy/70">
            <span className={`inline-block w-3 h-3 rounded-full ${dotClass}`} />
            {label}
          </span>
        ))}
        <span className="text-xs text-brand-grey ml-auto">Auto-refreshes every 30s</span>
      </div>

      {/* Takeaway / Delivery quick-launch buttons */}
      <div className="flex gap-3 mb-6">
        <button
          type="button"
          onClick={handleCreateTakeaway}
          className="flex-1 min-h-[56px] rounded-xl text-base font-semibold transition-colors border-2 border-brand-gold bg-brand-gold/10 text-brand-navy hover:bg-brand-gold/20 hover:border-brand-gold/80"
        >
          <span className='inline-flex items-center gap-2'><ShoppingBag size={18} aria-hidden='true' />New Takeaway Order</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setDeliveryCustomerName('')
            setDeliveryPhone('')
            setDeliveryPhoneTouched(false)
            setDeliveryNote('')
            setCreateOrderError(null)
            setCustomerSuggestion(null)
            setShowDeliveryModal(true)
          }}
          className="flex-1 min-h-[56px] rounded-xl text-base font-semibold transition-colors border-2 border-brand-blue bg-brand-blue/10 text-brand-navy hover:bg-brand-blue/20 hover:border-brand-blue/80"
        >
          <span className='inline-flex items-center gap-2'><Bike size={18} aria-hidden='true' />New Delivery Order</span>
        </button>
      </div>

      {createOrderError !== null && !showDeliveryModal && (
        <p className="text-red-400 text-sm mb-4">{createOrderError}</p>
      )}

      {loading ? (
        <p className="text-brand-blue text-lg">Loading tables…</p>
      ) : error !== null ? (
        <p className="text-red-500 text-lg">{error}</p>
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
                    <p className="text-sm font-semibold text-brand-navy/60 mb-2">
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
                  <p className="text-brand-navy/60 text-lg">No tables configured.</p>
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
                          <h2 className="text-lg font-bold text-brand-navy font-heading">{sectionName ?? 'Unsectioned'}</h2>
                          {serverName && (
                            <span className="text-sm bg-brand-blue/20 text-brand-navy border border-brand-blue rounded-full px-2.5 py-0.5">{serverName}</span>
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
            <h2 className="text-lg font-bold text-brand-navy mb-3 flex items-center gap-2 font-heading">
              <span>Takeaway / Delivery Queue</span>
              {queue.length > 0 && (
                <span className="text-sm font-normal bg-brand-gold/20 text-brand-navy border border-brand-gold rounded-full px-2 py-0.5">
                  {queue.length}
                </span>
              )}
            </h2>
            {queue.length === 0 ? (
              <p className="text-brand-grey text-base">No active takeaway or delivery orders.</p>
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
                          ? 'border-brand-blue bg-brand-blue/20 hover:bg-brand-blue/40 hover:border-brand-navy'
                          : 'border-brand-gold bg-brand-gold/20 hover:bg-brand-gold/30 hover:border-brand-gold',
                      ].join(' ')}
                    >
                      {/* Type badge + age */}
                      <div className="flex items-center justify-between">
                        <span className={[
                          'text-xs font-bold px-2 py-0.5 rounded-full',
                          isDelivery
                            ? 'bg-brand-blue/60 text-white'
                            : 'bg-brand-gold/60 text-brand-navy',
                        ].join(' ')}>
                          {isDelivery ? <span className='inline-flex items-center gap-1'><Bike size={12} aria-hidden='true' />DELIVERY</span> : <span className='inline-flex items-center gap-1'><ShoppingBag size={12} aria-hidden='true' />TAKEAWAY</span>}
                        </span>
                        <span className="text-xs text-brand-navy/60">{orderAge(order.created_at)}</span>
                      </div>

                      {/* Customer name (delivery only) */}
                      {isDelivery && order.customer_name && (
                        <p className="text-white font-semibold text-base">{order.customer_name}</p>
                      )}
                      {/* Phone number (delivery only) */}
                      {isDelivery && order.customer_mobile && (
                        <p className="text-white/70 text-sm">📞 {order.customer_mobile}</p>
                      )}

                      {/* Item count */}
                      <p className="text-brand-navy/60 text-sm">
                        {order.item_count} item{order.item_count !== 1 ? 's' : ''}
                      </p>

                      {/* Order ID snippet */}
                      <p className="text-brand-navy/60 text-xs font-mono">{order.id.slice(0, 8)}</p>
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
          <div className="w-full max-w-lg bg-brand-navy rounded-t-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-white flex items-center gap-2 font-heading"><Bike size={20} aria-hidden="true" />New Delivery Order</h2>
              <button
                type="button"
                onClick={() => {
                  setShowDeliveryModal(false)
                  setCreateOrderError(null)
                  setCustomerSuggestion(null)
                }}
                className="min-h-[48px] min-w-[48px] text-white/60 hover:text-white flex items-center justify-center"
                aria-label="Close"
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>

            <div>
              <label htmlFor="delivery-customer-name" className="block text-white text-base mb-2 font-body">
                Customer Name <span className="text-red-400">*</span>
              </label>
              <input
                id="delivery-customer-name"
                type="text"
                placeholder="e.g. Ahmed Khan"
                value={deliveryCustomerName}
                onChange={(e) => { setDeliveryCustomerName(e.target.value) }}
                className="w-full min-h-[48px] px-4 rounded-xl text-base bg-brand-blue text-white border-2 border-brand-grey/40 focus:border-brand-gold focus:outline-none placeholder-white/40 font-body"
                autoFocus
              />
            </div>

            <div>
              <label htmlFor="delivery-phone" className="block text-white text-base mb-2 font-body">
                Phone Number <span className="text-brand-grey">(optional)</span>
              </label>
              <input
                id="delivery-phone"
                type="tel"
                placeholder="+880 1X XX XXX XXX"
                value={deliveryPhone}
                onChange={(e) => { setDeliveryPhone(e.target.value) }}
                onBlur={() => { setDeliveryPhoneTouched(true) }}
                className="w-full min-h-[48px] px-4 rounded-xl text-base bg-brand-blue text-white border-2 border-brand-grey/40 focus:border-brand-gold focus:outline-none placeholder-white/40 font-body"
              />
              {deliveryPhoneTouched && deliveryPhone.trim() === '' && (
                <p className="text-amber-400/70 text-xs mt-1">Adding a phone number helps with delivery contact</p>
              )}
              {customerSuggestion !== null && (
                <button
                  type="button"
                  onClick={() => {
                    setDeliveryCustomerName(customerSuggestion.name)
                    setCustomerSuggestion(null)
                  }}
                  className="mt-2 w-full text-left px-4 py-2 rounded-xl bg-brand-gold/10 border border-brand-gold/40 text-sm text-brand-gold hover:bg-brand-gold/20 transition-colors font-body"
                >
                  👤 Returning customer: <span className="font-semibold">{customerSuggestion.name}</span> — tap to fill name
                </button>
              )}
            </div>

            <div>
              <label htmlFor="delivery-note" className="block text-white text-base mb-2 font-body">
                Delivery Note <span className="text-brand-grey">(optional)</span>
              </label>
              <input
                id="delivery-note"
                type="text"
                placeholder="e.g. Road 12, House 5, Ring the bell"
                value={deliveryNote}
                onChange={(e) => { setDeliveryNote(e.target.value) }}
                className="w-full min-h-[48px] px-4 rounded-xl text-base bg-brand-blue text-white border-2 border-brand-grey/40 focus:border-brand-gold focus:outline-none placeholder-white/40 font-body"
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
                  setCustomerSuggestion(null)
                }}
                className="flex-1 min-h-[48px] min-w-[48px] px-6 rounded-xl text-base font-semibold border-2 border-brand-grey/40 text-white hover:border-brand-grey transition-colors font-body"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateDelivery}
                disabled={deliveryCustomerName.trim() === ''}
                className={[
                  'flex-1 min-h-[48px] min-w-[48px] px-6 rounded-xl text-base font-semibold transition-colors font-body',
                  deliveryCustomerName.trim() === ''
                    ? 'bg-brand-grey/30 text-white/40 cursor-not-allowed'
                    : 'bg-brand-gold hover:bg-brand-gold/90 text-brand-navy',
                ].join(' ')}
              >
                Create Order
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
