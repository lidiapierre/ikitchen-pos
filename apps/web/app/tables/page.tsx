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
import { ShoppingBag, Bike, X, Clock } from 'lucide-react'
import { formatDateTimeShort } from '@/lib/dateFormat'

/** Auto-refresh interval in milliseconds (30 seconds) */
const REFRESH_INTERVAL_MS = 30_000

/** Delivery zone as returned by the delivery_zones table (issue #353). */
interface DeliveryZone { id: string; name: string; charge_amount: number }

const STATUS_LEGEND: { status: TableStatus; label: string; dotClass: string }[] = [
  { status: 'available', label: 'Empty', dotClass: 'bg-brand-grey' },
  { status: 'seated', label: 'Seated', dotClass: 'bg-brand-blue' },
  { status: 'ordered', label: 'Ordered', dotClass: 'bg-brand-gold' },
  { status: 'overdue', label: 'Overdue (>2h)', dotClass: 'bg-red-500' },
  { status: 'merged', label: 'Merged', dotClass: 'bg-purple-500' },
  { status: 'due', label: 'Due (bill pending)', dotClass: 'bg-orange-500' },
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

  // Takeaway modal state
  const [showTakeawayModal, setShowTakeawayModal] = useState(false)
  const [takeawayName, setTakeawayName] = useState('')
  const [takeawayMobile, setTakeawayMobile] = useState('')
  const [takeawayScheduledTime, setTakeawayScheduledTime] = useState('')
  const [takeawaySuggestion, setTakeawaySuggestion] = useState<{ name: string; mobile: string } | null>(null)
  const takeawaySearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Delivery modal state
  const [showDeliveryModal, setShowDeliveryModal] = useState(false)
  const [deliveryCustomerName, setDeliveryCustomerName] = useState('')
  const [deliveryPhone, setDeliveryPhone] = useState('')
  const [deliveryPhoneTouched, setDeliveryPhoneTouched] = useState(false)
  const [deliveryNote, setDeliveryNote] = useState('')
  const [deliveryScheduledTime, setDeliveryScheduledTime] = useState('')
  const [createOrderError, setCreateOrderError] = useState<string | null>(null)
  // Customer search state (mobile lookup)
  const [customerSuggestion, setCustomerSuggestion] = useState<{ name: string; mobile: string } | null>(null)
  const customerSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Delivery zones (issue #353)
  const [deliveryZones, setDeliveryZones] = useState<DeliveryZone[]>([])
  const [selectedDeliveryZoneId, setSelectedDeliveryZoneId] = useState<string>('')
  const [zonesLoading, setZonesLoading] = useState(false)
  // Delivery fee override — issue #393: free delivery toggle
  // NOTE: When a zone is selected the Edge Function always applies the zone's charge
  // server-side (security boundary). The toggle here only affects orders without a zone
  // (no-zone case always results in ৳0, so the toggle is purely cosmetic there).
  // For zone-based free-delivery, staff should use the "Waive Delivery Fee" button on
  // the order screen immediately after creation.
  const [deliveryFreeShipping, setDeliveryFreeShipping] = useState(false)
  const [deliveryCustomChargeStr, setDeliveryCustomChargeStr] = useState('')

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

  // Debounced customer mobile search for takeaway modal
  useEffect(() => {
    if (takeawaySearchTimerRef.current !== null) {
      clearTimeout(takeawaySearchTimerRef.current)
    }

    const phone = takeawayMobile.trim()
    if (!phone || !showTakeawayModal) {
      setTakeawaySuggestion(null)
      return
    }

    takeawaySearchTimerRef.current = setTimeout(() => {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ''
      if (!supabaseUrl || !accessToken) return

      const url = new URL(`${supabaseUrl}/rest/v1/customers`)
      url.searchParams.set('select', 'name,mobile')
      url.searchParams.set('mobile', `eq.${phone}`)
      url.searchParams.set('limit', '1')

      fetch(url.toString(), {
        headers: { apikey: publishableKey, Authorization: `Bearer ${accessToken}` },
      })
        .then((res) => res.ok ? res.json() : Promise.reject(new Error('search failed')))
        .then((rows: unknown) => {
          const results = rows as Array<{ name: string | null; mobile: string }>
          if (results.length > 0 && results[0].name) {
            setTakeawaySuggestion({ name: results[0].name, mobile: results[0].mobile })
          } else {
            setTakeawaySuggestion(null)
          }
        })
        .catch(() => { setTakeawaySuggestion(null) })
    }, 400)

    return () => {
      if (takeawaySearchTimerRef.current !== null) {
        clearTimeout(takeawaySearchTimerRef.current)
      }
    }
  }, [takeawayMobile, showTakeawayModal, accessToken])

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

  // Fetch delivery zones when the delivery modal opens (issue #353)
  useEffect(() => {
    if (!showDeliveryModal) return
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ''
    if (!supabaseUrl || !accessToken) return

    setZonesLoading(true)
    // Get restaurant id first, then zones
    fetch(`${supabaseUrl}/rest/v1/restaurants?select=id&limit=1`, {
      headers: { apikey: publishableKey, Authorization: `Bearer ${accessToken}` },
    })
      .then((r) => r.ok ? r.json() : Promise.reject(new Error('failed')))
      .then(async (rows: unknown) => {
        const rids = rows as Array<{ id: string }>
        if (rids.length === 0) return
        const rid = rids[0].id
        const url = new URL(`${supabaseUrl}/rest/v1/delivery_zones`)
        url.searchParams.set('restaurant_id', `eq.${rid}`)
        url.searchParams.set('select', 'id,name,charge_amount')
        url.searchParams.set('order', 'name.asc')
        const res = await fetch(url.toString(), {
          headers: { apikey: publishableKey, Authorization: `Bearer ${accessToken}` },
        })
        if (!res.ok) return
        const zones = (await res.json()) as Array<{ id: string; name: string; charge_amount: number }>
        setDeliveryZones(zones)
        // Intentionally do NOT auto-select — staff must make an explicit zone choice (issue #353)
      })
      .catch(() => {
        // Non-fatal: zones remain empty → zone selector hidden
      })
      .finally(() => { setZonesLoading(false) })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showDeliveryModal, accessToken])

  // Open the optional takeaway customer modal before navigating
  function handleCreateTakeaway(): void {
    setTakeawayName('')
    setTakeawayMobile('')
    setTakeawayScheduledTime('')
    setTakeawaySuggestion(null)
    setCreateOrderError(null)
    setShowTakeawayModal(true)
  }

  // Confirm takeaway — navigate to /order/new with required search params (issue #317 + #276 + #352 + #392)
  // Note: button is disabled when any field is empty, so these early-returns are safety guards only.
  function handleConfirmTakeaway(): void {
    if (!takeawayName.trim()) {
      return // button is disabled; guard for safety
    }
    if (!takeawayMobile.trim()) {
      return // button is disabled; guard for safety
    }
    if (!takeawayScheduledTime) {
      return // button is disabled; guard for safety
    }
    const params = new URLSearchParams()
    params.set('customerName', takeawayName.trim())
    params.set('customerPhone', takeawayMobile.trim())
    // Convert local datetime-local value to ISO string for the edge function
    params.set('scheduledTime', new Date(takeawayScheduledTime).toISOString())
    setCreateOrderError(null)
    setShowTakeawayModal(false)
    setTakeawayName('')
    setTakeawayMobile('')
    setTakeawayScheduledTime('')
    router.push(`/tables/takeaway/order/new?${params.toString()}`)
  }

  function handleCreateDelivery(): void {
    if (!deliveryCustomerName.trim()) {
      setCreateOrderError('Customer name is required for delivery orders')
      return
    }
    if (!deliveryPhone.trim()) {
      setCreateOrderError('Mobile number is required for delivery orders')
      return
    }
    if (!deliveryNote.trim()) {
      setCreateOrderError('Delivery address is required for delivery orders')
      return
    }
    if (!deliveryScheduledTime) {
      setCreateOrderError('Delivery Time is required')
      return
    }
    // Require zone selection only when zones are configured (issue #353)
    if (deliveryZones.length > 0 && !selectedDeliveryZoneId) {
      setCreateOrderError('Please select a delivery zone')
      return
    }

    const selectedZone = deliveryZones.find((z) => z.id === selectedDeliveryZoneId) ?? null

    // Compute effective delivery charge in cents for the URL shell display (issue #393):
    // - Zone selected  → zone.charge_amount (authoritative: Edge Function applies this server-side)
    // - No zones, manual charge entered → parsed from deliveryCustomChargeStr (display only)
    // - No zones, free delivery toggled → 0
    // NOTE: when a zone is selected, the Edge Function always uses the zone's charge
    // regardless of what we pass — this is intentional (fee manipulation prevention, issue #353).
    // For zone-based free delivery, staff should use the "Waive Delivery Fee" button on the order screen.
    const effectiveChargeCents = (() => {
      if (selectedZone) return selectedZone.charge_amount
      if (deliveryFreeShipping) return 0
      const custom = parseFloat(deliveryCustomChargeStr || '0')
      return isNaN(custom) ? 0 : Math.round(custom * 100)
    })()

    const params = new URLSearchParams({
      customerName: deliveryCustomerName.trim(),
      customerPhone: deliveryPhone.trim(),
      deliveryNote: deliveryNote.trim(),
      // Convert local datetime-local value to ISO string (issue #352)
      scheduledTime: new Date(deliveryScheduledTime).toISOString(),
      ...(selectedZone ? { deliveryZoneId: selectedZone.id } : {}),
      // Always send deliveryCharge so the order shell can display it (issue #393)
      deliveryCharge: String(effectiveChargeCents),
      ...(selectedZone ? { deliveryZoneName: selectedZone.name } : {}),
    })
    setCreateOrderError(null)
    setShowDeliveryModal(false)
    setDeliveryCustomerName('')
    setDeliveryPhone('')
    setDeliveryPhoneTouched(false)
    setDeliveryNote('')
    setDeliveryScheduledTime('')
    setSelectedDeliveryZoneId('')
    setDeliveryZones([])
    setDeliveryFreeShipping(false)
    setDeliveryCustomChargeStr('')
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
            setDeliveryScheduledTime('')
            setCreateOrderError(null)
            setCustomerSuggestion(null)
            setDeliveryFreeShipping(false)
            setDeliveryCustomChargeStr('')
            setShowDeliveryModal(true)
          }}
          className="flex-1 min-h-[56px] rounded-xl text-base font-semibold transition-colors border-2 border-brand-blue bg-brand-blue/10 text-brand-navy hover:bg-brand-blue/20 hover:border-brand-blue/80"
        >
          <span className='inline-flex items-center gap-2'><Bike size={18} aria-hidden='true' />New Delivery Order</span>
        </button>
      </div>

      {createOrderError !== null && !showDeliveryModal && !showTakeawayModal && (
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

                      {/* Customer name (takeaway and delivery) */}
                      {order.customer_name && (
                        <p className="text-white font-semibold text-base">{order.customer_name}</p>
                      )}
                      {/* Phone number (takeaway and delivery) */}
                      {order.customer_mobile && (
                        <p className="text-white/70 text-sm">📞 {order.customer_mobile}</p>
                      )}

                      {/* Scheduled time */}
                      {order.scheduled_time && (
                        <p className="text-brand-navy font-semibold text-sm inline-flex items-center gap-1">
                          <Clock size={13} aria-hidden="true" />
                          {isDelivery ? 'Delivery' : 'Pickup'}: {formatDateTimeShort(order.scheduled_time)}
                        </p>
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

      {/* Takeaway order modal — mandatory name + mobile (issue #276 + #392) */}
      {showTakeawayModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70">
          <div className="w-full max-w-lg bg-brand-navy rounded-t-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-white flex items-center gap-2 font-heading">
                <ShoppingBag size={20} aria-hidden="true" />New Takeaway Order
              </h2>
              <button
                type="button"
                onClick={() => { setShowTakeawayModal(false) }}
                className="min-h-[48px] min-w-[48px] text-white/60 hover:text-white flex items-center justify-center"
                aria-label="Close"
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>

            <div>
              <label htmlFor="takeaway-name" className="block text-white text-base mb-2 font-body">
                Customer Name <span className="text-red-400">*</span>
              </label>
              <input
                id="takeaway-name"
                type="text"
                placeholder="e.g. Ahmed Khan"
                value={takeawayName}
                onChange={(e) => { setTakeawayName(e.target.value); setTakeawaySuggestion(null) }}
                className="w-full min-h-[48px] px-4 rounded-xl text-base bg-brand-blue text-white border-2 border-brand-grey/40 focus:border-brand-gold focus:outline-none placeholder-white/40 font-body"
                autoFocus
              />
            </div>

            <div>
              <label htmlFor="takeaway-mobile" className="block text-white text-base mb-2 font-body">
                Phone Number <span className="text-red-400">*</span>
              </label>
              <input
                id="takeaway-mobile"
                type="tel"
                placeholder="+880 1X XX XXX XXX"
                value={takeawayMobile}
                onChange={(e) => { setTakeawayMobile(e.target.value) }}
                className="w-full min-h-[48px] px-4 rounded-xl text-base bg-brand-blue text-white border-2 border-brand-grey/40 focus:border-brand-gold focus:outline-none placeholder-white/40 font-body"
              />
              {takeawaySuggestion !== null && (
                <button
                  type="button"
                  onClick={() => { setTakeawayName(takeawaySuggestion.name); setTakeawaySuggestion(null) }}
                  className="mt-2 w-full text-left px-4 py-2 rounded-xl bg-brand-gold/10 border border-brand-gold/40 text-sm text-brand-gold hover:bg-brand-gold/20 transition-colors font-body"
                >
                  👤 Returning customer: <span className="font-semibold">{takeawaySuggestion.name}</span> — tap to fill name
                </button>
              )}
            </div>

            <div>
              <label htmlFor="takeaway-scheduled-time" className="block text-white text-base mb-2 font-body">
                Pickup Time <span className="text-red-400">*</span>
              </label>
              <input
                id="takeaway-scheduled-time"
                type="datetime-local"
                value={takeawayScheduledTime}
                min={new Date().toISOString().slice(0, 16)}
                onChange={(e) => { setTakeawayScheduledTime(e.target.value) }}
                className="w-full min-h-[48px] px-4 rounded-xl text-base bg-brand-blue text-white border-2 border-brand-grey/40 focus:border-brand-gold focus:outline-none font-body"
                required
              />
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => { setShowTakeawayModal(false) }}
                className="flex-1 min-h-[48px] min-w-[48px] px-6 rounded-xl text-base font-semibold border-2 border-brand-grey/40 text-white hover:border-brand-grey transition-colors font-body"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmTakeaway}
                disabled={!takeawayScheduledTime || !takeawayName.trim() || !takeawayMobile.trim()}
                className={[
                  'flex-1 min-h-[48px] min-w-[48px] px-6 rounded-xl text-base font-semibold transition-colors font-body',
                  (!takeawayScheduledTime || !takeawayName.trim() || !takeawayMobile.trim())
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
                  setDeliveryFreeShipping(false)
                  setDeliveryCustomChargeStr('')
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
                onChange={(e) => { setDeliveryCustomerName(e.target.value); setCustomerSuggestion(null) }}
                className="w-full min-h-[48px] px-4 rounded-xl text-base bg-brand-blue text-white border-2 border-brand-grey/40 focus:border-brand-gold focus:outline-none placeholder-white/40 font-body"
                autoFocus
              />
            </div>

            <div>
              <label htmlFor="delivery-phone" className="block text-white text-base mb-2 font-body">
                Mobile Number <span className="text-red-400">*</span>
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
                Delivery Address <span className="text-red-400">*</span>
              </label>
              <input
                id="delivery-note"
                type="text"
                placeholder="e.g. Road 12, House 5, Mirpur"
                value={deliveryNote}
                onChange={(e) => { setDeliveryNote(e.target.value) }}
                className="w-full min-h-[48px] px-4 rounded-xl text-base bg-brand-blue text-white border-2 border-brand-grey/40 focus:border-brand-gold focus:outline-none placeholder-white/40 font-body"
              />
            </div>

            <div>
              <label htmlFor="delivery-scheduled-time" className="block text-white text-base mb-2 font-body">
                Delivery Time <span className="text-red-400">*</span>
              </label>
              <input
                id="delivery-scheduled-time"
                type="datetime-local"
                value={deliveryScheduledTime}
                min={new Date().toISOString().slice(0, 16)}
                onChange={(e) => { setDeliveryScheduledTime(e.target.value) }}
                className="w-full min-h-[48px] px-4 rounded-xl text-base bg-brand-blue text-white border-2 border-brand-grey/40 focus:border-brand-gold focus:outline-none font-body"
                required
              />
            </div>

            {/* Delivery zone selector — only shown when zones are configured (issue #353) */}
            {zonesLoading && (
              <p className="text-zinc-400 text-sm">Loading delivery zones…</p>
            )}
            {!zonesLoading && deliveryZones.length > 0 && (
              <div>
                <label htmlFor="delivery-zone" className="block text-white text-base mb-2 font-body">
                  Delivery Zone <span className="text-red-400">*</span>
                </label>
                <select
                  id="delivery-zone"
                  value={selectedDeliveryZoneId}
                  onChange={(e) => { setSelectedDeliveryZoneId(e.target.value); setDeliveryFreeShipping(false) }}
                  className="w-full min-h-[48px] px-4 rounded-xl text-base bg-brand-blue text-white border-2 border-brand-grey/40 focus:border-brand-gold focus:outline-none font-body"
                  required
                >
                  <option value="">— Select zone —</option>
                  {deliveryZones.map((zone) => (
                    <option key={zone.id} value={zone.id}>
                      {zone.name} — ৳{(zone.charge_amount / 100).toFixed(2)}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* ── Delivery fee preview — shown once a zone is selected (issue #393) ── */}
            {!zonesLoading && deliveryZones.length > 0 && selectedDeliveryZoneId && (() => {
              const zone = deliveryZones.find((z) => z.id === selectedDeliveryZoneId)
              if (!zone) return null
              return (
                <div
                  data-testid="delivery-fee-preview"
                  className="bg-blue-900/20 border-2 border-blue-700 rounded-xl px-4 py-3"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-zinc-400 text-xs font-semibold uppercase tracking-wider mb-0.5 font-body">Delivery Fee</p>
                      <p className="text-lg font-bold text-white font-body">
                        ৳{(zone.charge_amount / 100).toFixed(2)}
                      </p>
                    </div>
                    <p className="text-xs text-zinc-500 text-right max-w-[140px] font-body">
                      To waive, use the order screen after creating
                    </p>
                  </div>
                </div>
              )
            })()}

            {/* ── Manual delivery charge — shown when no zones are configured (issue #393) ── */}
            {!zonesLoading && deliveryZones.length === 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label htmlFor="delivery-charge" className="text-white text-base font-body">
                    Delivery Charge
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setDeliveryFreeShipping(!deliveryFreeShipping)
                      if (!deliveryFreeShipping) setDeliveryCustomChargeStr('')
                    }}
                    className={[
                      'text-sm font-semibold px-3 min-h-[36px] rounded-lg border-2 transition-colors font-body',
                      deliveryFreeShipping
                        ? 'border-amber-600 text-amber-400 hover:border-amber-400 hover:bg-amber-900/20'
                        : 'border-emerald-700 text-emerald-400 hover:border-emerald-500 hover:bg-emerald-900/20',
                    ].join(' ')}
                  >
                    {deliveryFreeShipping ? '↩ Add charge' : '🆓 Free Delivery'}
                  </button>
                </div>
                {deliveryFreeShipping ? (
                  <div
                    data-testid="delivery-fee-free-badge"
                    className="bg-emerald-900/20 border-2 border-emerald-700 rounded-xl px-4 py-3"
                  >
                    <p className="text-emerald-400 font-semibold font-body">Free Delivery ✓</p>
                  </div>
                ) : (
                  <input
                    id="delivery-charge"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    placeholder="0.00 (leave empty for free)"
                    value={deliveryCustomChargeStr}
                    onChange={(e) => { setDeliveryCustomChargeStr(e.target.value) }}
                    className="w-full min-h-[48px] px-4 rounded-xl text-base bg-brand-blue text-white border-2 border-brand-grey/40 focus:border-brand-gold focus:outline-none placeholder-white/40 font-body"
                  />
                )}
              </div>
            )}

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
                  setSelectedDeliveryZoneId('')
                  setDeliveryZones([])
                  setZonesLoading(false)
                  setDeliveryFreeShipping(false)
                  setDeliveryCustomChargeStr('')
                }}
                className="flex-1 min-h-[48px] min-w-[48px] px-6 rounded-xl text-base font-semibold border-2 border-brand-grey/40 text-white hover:border-brand-grey transition-colors font-body"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateDelivery}
                disabled={
                  deliveryCustomerName.trim() === '' ||
                  deliveryPhone.trim() === '' ||
                  deliveryNote.trim() === '' ||
                  !deliveryScheduledTime ||
                  zonesLoading ||
                  (deliveryZones.length > 0 && !selectedDeliveryZoneId)
                }
                className={[
                  'flex-1 min-h-[48px] min-w-[48px] px-6 rounded-xl text-base font-semibold transition-colors font-body',
                  (deliveryCustomerName.trim() === '' ||
                    deliveryPhone.trim() === '' ||
                    deliveryNote.trim() === '' ||
                    !deliveryScheduledTime ||
                    zonesLoading ||
                    (deliveryZones.length > 0 && !selectedDeliveryZoneId))
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
