'use client'

import { useState, useEffect, useCallback } from 'react'
import type { JSX } from 'react'
import {
  CalendarDays,
  Users,
  Clock,
  Plus,
  X,
  Check,
  Ban,
  UserX,
  ChevronDown,
  ExternalLink,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useUser } from '@/lib/user-context'
import {
  fetchReservations,
  fetchTables,
  createReservation,
  updateReservationStatus,
  seatReservation,
  type Reservation,
  type ReservationTable,
  type CreateReservationInput,
} from './reservationsApi'

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function waitTime(createdAt: string): string {
  const diffMs = Date.now() - new Date(createdAt).getTime()
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  const rem = mins % 60
  return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`
}

function isToday(iso: string): boolean {
  const d = new Date(iso)
  const now = new Date()
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  )
}

// ─── Status badge ────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<Reservation['status'], string> = {
  waiting: 'bg-amber-500/20 text-amber-300 border border-amber-500/30',
  seated: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
  cancelled: 'bg-zinc-500/20 text-zinc-400 border border-zinc-600',
  no_show: 'bg-red-500/20 text-red-400 border border-red-500/30',
}

const STATUS_LABELS: Record<Reservation['status'], string> = {
  waiting: 'Waiting',
  seated: 'Seated',
  cancelled: 'Cancelled',
  no_show: 'No Show',
}

function StatusBadge({ status }: { status: Reservation['status'] }): JSX.Element {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  )
}

// ─── Add / Edit Modal ────────────────────────────────────────────────────────

interface AddModalProps {
  tables: ReservationTable[]
  restaurantId: string
  defaultWaitlist?: boolean
  onAdd: (input: CreateReservationInput) => Promise<void>
  onClose: () => void
}

function AddModal({ tables, restaurantId, defaultWaitlist = false, onAdd, onClose }: AddModalProps): JSX.Element {
  const [name, setName] = useState('')
  const [mobile, setMobile] = useState('')
  const [partySize, setPartySize] = useState(2)
  const [isWaitlist, setIsWaitlist] = useState(defaultWaitlist)
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [tableId, setTableId] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    if (!name.trim()) { setError('Customer name is required'); return }
    if (!isWaitlist && (!date || !time)) { setError('Date and time are required for a reservation'); return }
    setSaving(true)
    setError(null)
    try {
      const reservationTime = (!isWaitlist && date && time)
        ? new Date(`${date}T${time}`).toISOString()
        : null
      await onAdd({
        restaurant_id: restaurantId,
        customer_name: name.trim(),
        customer_mobile: mobile.trim() || undefined,
        party_size: partySize,
        reservation_time: reservationTime,
        table_id: tableId || null,
        notes: notes.trim() || undefined,
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-zinc-800">
          <h2 className="text-lg font-bold text-white">
            {isWaitlist ? 'Add to Waitlist' : 'New Reservation'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[36px] min-w-[36px] rounded-xl text-zinc-400 hover:text-white flex items-center justify-center"
            aria-label="Close"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={(e) => { void handleSubmit(e) }} className="p-6 space-y-4">
          {/* Walk-in toggle */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setIsWaitlist(false) }}
              className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors ${!isWaitlist ? 'bg-indigo-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}
            >
              <CalendarDays size={14} className="inline mr-1.5" aria-hidden="true" />
              Reservation
            </button>
            <button
              type="button"
              onClick={() => { setIsWaitlist(true) }}
              className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors ${isWaitlist ? 'bg-indigo-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}
            >
              <Clock size={14} className="inline mr-1.5" aria-hidden="true" />
              Walk-in
            </button>
          </div>

          {/* Name */}
          <div>
            <label htmlFor="res-name" className="block text-sm text-zinc-400 mb-1">Name *</label>
            <input
              id="res-name"
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value) }}
              placeholder="Customer name"
              required
              className="w-full min-h-[44px] px-4 rounded-xl bg-zinc-800 text-white border border-zinc-700 focus:border-indigo-500 focus:outline-none text-sm"
            />
          </div>

          {/* Mobile */}
          <div>
            <label htmlFor="res-mobile" className="block text-sm text-zinc-400 mb-1">Mobile</label>
            <input
              id="res-mobile"
              type="tel"
              value={mobile}
              onChange={(e) => { setMobile(e.target.value) }}
              placeholder="+880 1XXXXXXXXX"
              className="w-full min-h-[44px] px-4 rounded-xl bg-zinc-800 text-white border border-zinc-700 focus:border-indigo-500 focus:outline-none text-sm"
            />
          </div>

          {/* Party size */}
          <div>
            <label htmlFor="res-party" className="block text-sm text-zinc-400 mb-1">Party Size</label>
            <input
              id="res-party"
              type="number"
              min={1}
              max={50}
              value={partySize}
              onChange={(e) => { setPartySize(parseInt(e.target.value, 10) || 1) }}
              className="w-full min-h-[44px] px-4 rounded-xl bg-zinc-800 text-white border border-zinc-700 focus:border-indigo-500 focus:outline-none text-sm"
            />
          </div>

          {/* Date + Time (only for reservations) */}
          {!isWaitlist && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="res-date" className="block text-sm text-zinc-400 mb-1">Date</label>
                <input
                  id="res-date"
                  type="date"
                  value={date}
                  onChange={(e) => { setDate(e.target.value) }}
                  className="w-full min-h-[44px] px-4 rounded-xl bg-zinc-800 text-white border border-zinc-700 focus:border-indigo-500 focus:outline-none text-sm"
                />
              </div>
              <div>
                <label htmlFor="res-time" className="block text-sm text-zinc-400 mb-1">Time</label>
                <input
                  id="res-time"
                  type="time"
                  value={time}
                  onChange={(e) => { setTime(e.target.value) }}
                  className="w-full min-h-[44px] px-4 rounded-xl bg-zinc-800 text-white border border-zinc-700 focus:border-indigo-500 focus:outline-none text-sm"
                />
              </div>
            </div>
          )}

          {/* Table */}
          <div>
            <label htmlFor="res-table" className="block text-sm text-zinc-400 mb-1">Table (optional)</label>
            <div className="relative">
              <select
                id="res-table"
                value={tableId}
                onChange={(e) => { setTableId(e.target.value) }}
                className="w-full min-h-[44px] px-4 pr-10 rounded-xl bg-zinc-800 text-white border border-zinc-700 focus:border-indigo-500 focus:outline-none text-sm appearance-none"
              >
                <option value="">— No table assigned —</option>
                {tables.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label} ({t.seat_count} seats)
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" aria-hidden="true" />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label htmlFor="res-notes" className="block text-sm text-zinc-400 mb-1">Notes</label>
            <textarea
              id="res-notes"
              value={notes}
              onChange={(e) => { setNotes(e.target.value) }}
              rows={2}
              placeholder="Allergies, occasion, seating preference…"
              className="w-full px-4 py-3 rounded-xl bg-zinc-800 text-white border border-zinc-700 focus:border-indigo-500 focus:outline-none text-sm resize-none"
            />
          </div>

          {error !== null && <p className="text-red-400 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={saving}
            className="w-full min-h-[48px] rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-colors disabled:opacity-50 text-sm"
          >
            {saving ? 'Saving…' : isWaitlist ? 'Add to Waitlist' : 'Book Reservation'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ─── Seat modal (table picker) ───────────────────────────────────────────────

interface SeatModalProps {
  reservation: Reservation
  tables: ReservationTable[]
  onSeat: (reservation: Reservation, tableId: string | null) => Promise<void>
  onClose: () => void
}

function SeatModal({ reservation, tables, onSeat, onClose }: SeatModalProps): JSX.Element {
  const [tableId, setTableId] = useState(reservation.table_id ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSeat(): Promise<void> {
    setSaving(true)
    setError(null)
    try {
      await onSeat(reservation, tableId || null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to seat')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-sm shadow-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Seat {reservation.customer_name}</h2>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[36px] min-w-[36px] rounded-xl text-zinc-400 hover:text-white flex items-center justify-center"
            aria-label="Close"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <p className="text-sm text-zinc-400">
          Party of <span className="text-white font-medium">{reservation.party_size}</span>
        </p>

        <div>
          <label htmlFor="seat-table" className="block text-sm text-zinc-400 mb-1">Assign table (optional)</label>
          <div className="relative">
            <select
              id="seat-table"
              value={tableId}
              onChange={(e) => { setTableId(e.target.value) }}
              className="w-full min-h-[44px] px-4 pr-10 rounded-xl bg-zinc-800 text-white border border-zinc-700 focus:border-indigo-500 focus:outline-none text-sm appearance-none"
            >
              <option value="">— No specific table —</option>
              {tables.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label} ({t.seat_count} seats)
                </option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" aria-hidden="true" />
          </div>
        </div>

        {error !== null && <p className="text-red-400 text-sm">{error}</p>}

        <button
          type="button"
          onClick={() => { void handleSeat() }}
          disabled={saving}
          className="w-full min-h-[48px] rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition-colors disabled:opacity-50 text-sm flex items-center justify-center gap-2"
        >
          <Check size={16} aria-hidden="true" />
          {saving ? 'Seating…' : 'Confirm Seated'}
        </button>
      </div>
    </div>
  )
}

// ─── Action buttons ──────────────────────────────────────────────────────────

interface ActionButtonsProps {
  reservation: Reservation
  onSeatClick: (r: Reservation) => void
  onCancel: (id: string) => void
  onNoShow: (id: string) => void
  busy: boolean
}

function ActionButtons({ reservation, onSeatClick, onCancel, onNoShow, busy }: ActionButtonsProps): JSX.Element {
  if (reservation.status === 'seated') {
    // Show a link to the active order if we have one
    if (reservation.linked_order_id) {
      const href = `/tables/${reservation.table_id ?? 'dine_in'}/order/${reservation.linked_order_id}`
      return (
        <Link
          href={href}
          className="inline-flex items-center gap-1 min-h-[34px] px-3 rounded-lg bg-indigo-600/20 border border-indigo-500/40 text-indigo-300 hover:text-indigo-200 text-xs font-medium transition-colors"
        >
          <ExternalLink size={12} aria-hidden="true" /> View Order
        </Link>
      )
    }
    return <span />
  }
  if (reservation.status !== 'waiting') return <span />
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <button
        type="button"
        onClick={() => { onSeatClick(reservation) }}
        disabled={busy}
        className="inline-flex items-center gap-1 min-h-[34px] px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors disabled:opacity-50"
      >
        <Check size={12} aria-hidden="true" /> Seat
      </button>
      <button
        type="button"
        onClick={() => { onCancel(reservation.id) }}
        disabled={busy}
        className="inline-flex items-center gap-1 min-h-[34px] px-3 rounded-lg border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 text-xs font-medium transition-colors disabled:opacity-50"
      >
        <Ban size={12} aria-hidden="true" /> Cancel
      </button>
      <button
        type="button"
        onClick={() => { onNoShow(reservation.id) }}
        disabled={busy}
        className="inline-flex items-center gap-1 min-h-[34px] px-3 rounded-lg border border-zinc-700 text-zinc-400 hover:text-red-400 hover:border-red-500/50 text-xs font-medium transition-colors disabled:opacity-50"
      >
        <UserX size={12} aria-hidden="true" /> No Show
      </button>
    </div>
  )
}

// ─── Main Dashboard ──────────────────────────────────────────────────────────

export default function ReservationsDashboard(): JSX.Element {
  const router = useRouter()
  const { accessToken: _at } = useUser(); const accessToken = _at ?? ''
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''

  const [restaurantId, setRestaurantId] = useState<string | null>(null)
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [tables, setTables] = useState<ReservationTable[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<'reservations' | 'waitlist'>('reservations')

  const [showAddModal, setShowAddModal] = useState(false)
  const [addDefaultWaitlist, setAddDefaultWaitlist] = useState(false)
  const [seatTarget, setSeatTarget] = useState<Reservation | null>(null)
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set())

  // Load restaurant_id
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ''
  useEffect(() => {
    if (!supabaseUrl || !accessToken) return
    void fetch(`${supabaseUrl}/rest/v1/restaurants?select=id&limit=1`, {
      headers: { apikey: publishableKey, Authorization: `Bearer ${accessToken}` },
    })
      .then((r) => r.json())
      .then((rows: Array<{ id: string }>) => {
        if (rows.length > 0) setRestaurantId(rows[0].id)
      })
      .catch(() => { /* non-fatal */ })
  }, [supabaseUrl, accessToken])

  const loadData = useCallback(() => {
    if (!restaurantId) return
    setLoading(true)
    setError(null)
    Promise.all([
      fetchReservations(supabaseUrl, accessToken, restaurantId, accessToken ?? undefined),
      fetchTables(supabaseUrl, accessToken, restaurantId),
    ])
      .then(([res, tbl]) => {
        setReservations(res)
        setTables(tbl)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load data')
      })
      .finally(() => { setLoading(false) })
  }, [supabaseUrl, accessToken, restaurantId, accessToken])

  useEffect(() => { loadData() }, [loadData])

  // Derived lists
  const bookings = reservations.filter((r) => r.reservation_time !== null)
  const waitlist = reservations.filter((r) => r.reservation_time === null)

  // Today's upcoming reservations count (for badge)
  const todayCount = bookings.filter(
    (r) => r.reservation_time !== null && isToday(r.reservation_time) && r.status === 'waiting',
  ).length

  async function handleAdd(input: CreateReservationInput): Promise<void> {
    if (!accessToken) throw new Error('Not authenticated')
    const created = await createReservation(supabaseUrl, accessToken, accessToken, input)
    setReservations((prev) => [created, ...prev].sort((a, b) => {
      if (a.reservation_time && b.reservation_time) {
        return new Date(a.reservation_time).getTime() - new Date(b.reservation_time).getTime()
      }
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    }))
  }

  async function handleStatusChange(
    id: string,
    status: Reservation['status'],
    tableId?: string | null,
  ): Promise<void> {
    if (!accessToken) return
    setBusyIds((prev) => new Set(prev).add(id))
    try {
      await updateReservationStatus(supabaseUrl, accessToken, accessToken, id, status, tableId)
      setReservations((prev) =>
        prev.map((r) =>
          r.id === id
            ? { ...r, status, ...(tableId !== undefined ? { table_id: tableId } : {}) }
            : r,
        ),
      )
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }

  function openAddModal(waitlist: boolean): void {
    setAddDefaultWaitlist(waitlist)
    setShowAddModal(true)
  }

  function getTableLabel(tableId: string | null): string {
    if (!tableId) return '—'
    return tables.find((t) => t.id === tableId)?.label ?? '—'
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
        <div className="flex items-center gap-3">
          <CalendarDays size={24} className="text-indigo-400" aria-hidden="true" />
          <h1 className="text-2xl font-bold text-white">Reservations</h1>
          {todayCount > 0 && (
            <span className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 rounded-full bg-indigo-600 text-white text-xs font-bold">
              {todayCount}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => { openAddModal(tab === 'waitlist') }}
          className="inline-flex items-center gap-2 min-h-[44px] px-5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm transition-colors"
        >
          <Plus size={16} aria-hidden="true" />
          {tab === 'waitlist' ? 'Add Walk-in' : 'New Reservation'}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-zinc-800/50 p-1 rounded-xl w-fit">
        <button
          type="button"
          onClick={() => { setTab('reservations') }}
          className={[
            'flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-colors',
            tab === 'reservations'
              ? 'bg-indigo-600 text-white'
              : 'text-zinc-400 hover:text-white',
          ].join(' ')}
        >
          <CalendarDays size={15} aria-hidden="true" />
          Reservations
          {bookings.filter((r) => r.status === 'waiting').length > 0 && (
            <span className="bg-indigo-500/40 text-indigo-200 text-xs px-1.5 py-0.5 rounded-full">
              {bookings.filter((r) => r.status === 'waiting').length}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => { setTab('waitlist') }}
          className={[
            'flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-colors',
            tab === 'waitlist'
              ? 'bg-indigo-600 text-white'
              : 'text-zinc-400 hover:text-white',
          ].join(' ')}
        >
          <Clock size={15} aria-hidden="true" />
          Waitlist
          {waitlist.filter((r) => r.status === 'waiting').length > 0 && (
            <span className="bg-indigo-500/40 text-indigo-200 text-xs px-1.5 py-0.5 rounded-full">
              {waitlist.filter((r) => r.status === 'waiting').length}
            </span>
          )}
        </button>
      </div>

      {loading ? (
        <p className="text-zinc-400">Loading…</p>
      ) : error !== null ? (
        <p className="text-red-400">{error}</p>
      ) : tab === 'reservations' ? (
        /* ── Reservations Tab ── */
        <div className="rounded-xl border border-zinc-700 overflow-hidden">
          {bookings.length === 0 ? (
            <div className="text-center py-16">
              <CalendarDays size={48} className="text-zinc-600 mx-auto mb-4" aria-hidden="true" />
              <p className="text-zinc-400">No reservations yet.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-700 bg-zinc-800/50">
                  <th className="text-left px-4 py-3 text-zinc-400 font-semibold">Guest</th>
                  <th className="text-left px-4 py-3 text-zinc-400 font-semibold">
                    <Users size={13} className="inline mr-1" aria-hidden="true" />
                    Party
                  </th>
                  <th className="text-left px-4 py-3 text-zinc-400 font-semibold">
                    <Clock size={13} className="inline mr-1" aria-hidden="true" />
                    Time
                  </th>
                  <th className="text-left px-4 py-3 text-zinc-400 font-semibold">Table</th>
                  <th className="text-left px-4 py-3 text-zinc-400 font-semibold">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {bookings.map((r) => (
                  <tr key={r.id} className="border-b border-zinc-800 hover:bg-zinc-800/40 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-white">{r.customer_name}</p>
                      {r.customer_mobile && <p className="text-xs text-zinc-500">{r.customer_mobile}</p>}
                      {r.notes && <p className="text-xs text-zinc-500 italic mt-0.5">{r.notes}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-white font-semibold">{r.party_size}</span>
                    </td>
                    <td className="px-4 py-3">
                      {r.reservation_time ? (
                        <div>
                          <p className={`font-medium ${isToday(r.reservation_time) ? 'text-indigo-300' : 'text-white'}`}>
                            {isToday(r.reservation_time) ? 'Today' : new Date(r.reservation_time).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                          </p>
                          <p className="text-xs text-zinc-400">{formatTime(r.reservation_time)}</p>
                        </div>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 text-zinc-300">{getTableLabel(r.table_id)}</td>
                    <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                    <td className="px-4 py-3">
                      <ActionButtons
                        reservation={r}
                        onSeatClick={setSeatTarget}
                        onCancel={(id) => { void handleStatusChange(id, 'cancelled') }}
                        onNoShow={(id) => { void handleStatusChange(id, 'no_show') }}
                        busy={busyIds.has(r.id)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        /* ── Waitlist Tab ── */
        <div className="rounded-xl border border-zinc-700 overflow-hidden">
          {waitlist.length === 0 ? (
            <div className="text-center py-16">
              <Clock size={48} className="text-zinc-600 mx-auto mb-4" aria-hidden="true" />
              <p className="text-zinc-400">Waitlist is empty.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-700 bg-zinc-800/50">
                  <th className="text-left px-4 py-3 text-zinc-400 font-semibold">#</th>
                  <th className="text-left px-4 py-3 text-zinc-400 font-semibold">Guest</th>
                  <th className="text-left px-4 py-3 text-zinc-400 font-semibold">
                    <Users size={13} className="inline mr-1" aria-hidden="true" />
                    Party
                  </th>
                  <th className="text-left px-4 py-3 text-zinc-400 font-semibold">
                    <Clock size={13} className="inline mr-1" aria-hidden="true" />
                    Waiting
                  </th>
                  <th className="text-left px-4 py-3 text-zinc-400 font-semibold">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {waitlist.map((r, idx) => (
                  <tr key={r.id} className="border-b border-zinc-800 hover:bg-zinc-800/40 transition-colors">
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-indigo-900/60 text-indigo-300 text-xs font-bold">
                        {idx + 1}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-white">{r.customer_name}</p>
                      {r.customer_mobile && <p className="text-xs text-zinc-500">{r.customer_mobile}</p>}
                      {r.notes && <p className="text-xs text-zinc-500 italic mt-0.5">{r.notes}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-white font-semibold">{r.party_size}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-amber-400 font-medium">{waitTime(r.created_at)}</span>
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                    <td className="px-4 py-3">
                      <ActionButtons
                        reservation={r}
                        onSeatClick={setSeatTarget}
                        onCancel={(id) => { void handleStatusChange(id, 'cancelled') }}
                        onNoShow={(id) => { void handleStatusChange(id, 'no_show') }}
                        busy={busyIds.has(r.id)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Modals */}
      {showAddModal && restaurantId !== null && (
        <AddModal
          tables={tables}
          restaurantId={restaurantId}
          defaultWaitlist={addDefaultWaitlist}
          onAdd={handleAdd}
          onClose={() => { setShowAddModal(false) }}
        />
      )}

      {seatTarget !== null && (
        <SeatModal
          reservation={seatTarget}
          tables={tables}
          onSeat={async (reservation, tblId) => {
            const tableIdToUse = tblId ?? reservation.table_id ?? ''
            if (!tableIdToUse) throw new Error('A table must be selected to seat the reservation')
            const orderId = await seatReservation(
              supabaseUrl,
              accessToken,
              accessToken,
              reservation,
              tableIdToUse,
            )
            // Update local state
            setReservations((prev) =>
              prev.map((r) =>
                r.id === reservation.id
                  ? { ...r, status: 'seated', table_id: tableIdToUse, linked_order_id: orderId }
                  : r,
              ),
            )
            setSeatTarget(null)
            router.push(`/tables/${tableIdToUse}/order/${orderId}`)
          }}
          onClose={() => { setSeatTarget(null) }}
        />
      )}
    </div>
  )
}
