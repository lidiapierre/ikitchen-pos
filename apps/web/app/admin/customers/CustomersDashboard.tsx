'use client'

import { useState, useEffect, useCallback } from 'react'
import type { JSX } from 'react'
import Link from 'next/link'
import { Users, Search, Phone, X, Pencil, Check, CalendarDays, Star, Mail, MapPin } from 'lucide-react'
import { membershipColor, membershipBadge } from './membershipHelpers'
import { useUser } from '@/lib/user-context'
import { formatPrice, DEFAULT_CURRENCY_SYMBOL } from '@/lib/formatPrice'
import { isoDateToDDMMYYYY, formatDateTimeShort } from '@/lib/dateFormat'
import {
  fetchCustomers,
  fetchCustomerOrders,
  fetchCustomerOrdersById,
  updateCustomer,
} from './customersApi'
import type { Customer, CustomerOrder } from './customersApi'
import { fetchCustomerReservations } from '../reservations/reservationsApi'
import type { Reservation } from '../reservations/reservationsApi'

function ordinalSuffix(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return `${n}th`
  const rem = n % 10
  if (rem === 1) return `${n}st`
  if (rem === 2) return `${n}nd`
  if (rem === 3) return `${n}rd`
  return `${n}th`
}

export default function CustomersDashboard(): JSX.Element {
  const { accessToken: _at } = useUser(); const accessToken = _at ?? ''
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''

  const [restaurantId, setRestaurantId] = useState<string | null>(null)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  // Selected customer detail panel
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [customerOrders, setCustomerOrders] = useState<CustomerOrder[]>([])
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [ordersError, setOrdersError] = useState<string | null>(null)

  // Customer reservations (issue #277)
  const [customerReservations, setCustomerReservations] = useState<Reservation[]>([])
  const [reservationsLoading, setReservationsLoading] = useState(false)

  // Inline edit state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [editDob, setEditDob] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editAddress, setEditAddress] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Load restaurant_id from the user context
  useEffect(() => {
    if (!supabaseUrl || !accessToken) return
    // Fetch via users table to get the restaurant_id
    void fetch(`${supabaseUrl}/rest/v1/users?select=restaurant_id&limit=1`, {
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '', Authorization: `Bearer ${accessToken}` },
    })
      .then((r) => r.json())
      .then((rows: Array<{ restaurant_id: string }>) => {
        if (rows.length > 0) setRestaurantId(rows[0].restaurant_id)
      })
      .catch(() => { /* non-fatal */ })
  }, [supabaseUrl, accessToken])

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search) }, 300)
    return () => { clearTimeout(t) }
  }, [search])

  const loadCustomers = useCallback(() => {
    if (!restaurantId) return
    setLoading(true)
    setError(null)
    fetchCustomers(supabaseUrl, accessToken, restaurantId, debouncedSearch)
      .then(setCustomers)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load customers')
      })
      .finally(() => { setLoading(false) })
  }, [supabaseUrl, accessToken, restaurantId, debouncedSearch])

  useEffect(() => {
    loadCustomers()
  }, [loadCustomers])

  function openCustomer(customer: Customer): void {
    setSelectedCustomer(customer)
    setCustomerOrders([])
    setOrdersError(null)
    setOrdersLoading(true)
    setCustomerReservations([])

    // Prefer customer_id-based query (issue #276); fall back to mobile-based for older orders
    fetchCustomerOrdersById(supabaseUrl, accessToken, customer.id)
      .then((byId) => {
        if (byId.length > 0) {
          setCustomerOrders(byId)
          setOrdersLoading(false)
        } else {
          // Fall back to mobile lookup for pre-#276 orders
          return fetchCustomerOrders(supabaseUrl, accessToken, customer.restaurant_id, customer.mobile)
            .then(setCustomerOrders)
        }
      })
      .catch((err: unknown) => {
        setOrdersError(err instanceof Error ? err.message : 'Failed to load orders')
      })
      .finally(() => { setOrdersLoading(false) })

    // Fetch reservations if the customer has an id (issue #277)
    setReservationsLoading(true)
    const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ''
    fetchCustomerReservations(supabaseUrl, publishableKey, accessToken, customer.id)
      .then(setCustomerReservations)
      .catch(() => {
        // Silently swallow — customer_id column may not exist pre-migration;
        // the panel shows "No reservations found" rather than an error.
        setCustomerReservations([])
      })
      .finally(() => { setReservationsLoading(false) })
  }

  function startEdit(customer: Customer): void {
    setEditingId(customer.id)
    setEditName(customer.name ?? '')
    setEditNotes(customer.notes ?? '')
    setEditDob(customer.date_of_birth ?? '')
    setEditEmail(customer.email ?? '')
    setEditAddress(customer.delivery_address ?? '')
    setSaveError(null)
  }

  // membershipColor and membershipBadge are imported from ./membershipHelpers

  async function saveEdit(customer: Customer): Promise<void> {
    if (!accessToken) return
    setSaving(true)
    setSaveError(null)
    try {
      await updateCustomer(supabaseUrl, accessToken, customer.id, {
        name: editName.trim() || undefined,
        notes: editNotes.trim() || undefined,
        date_of_birth: editDob.trim() || null,
        email: editEmail.trim() || null,
        delivery_address: editAddress.trim() || null,
      })
      // Update local state
      const updated: Customer = {
        ...customer,
        name: editName.trim() || null,
        notes: editNotes.trim() || null,
        date_of_birth: editDob.trim() || null,
        email: editEmail.trim() || null,
        delivery_address: editAddress.trim() || null,
      }
      setCustomers((prev) => prev.map((c) => c.id === customer.id ? updated : c))
      if (selectedCustomer?.id === customer.id) {
        setSelectedCustomer(updated)
      }
      setEditingId(null)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Users size={24} className="text-indigo-400" aria-hidden="true" />
        <h1 className="text-2xl font-bold text-brand-navy">Customers</h1>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" aria-hidden="true" />
        <input
          type="search"
          placeholder="Search by name or mobile…"
          value={search}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setSearch(e.target.value) }}
          className="w-full pl-10 pr-4 py-3 rounded-xl bg-zinc-800 text-white border-2 border-zinc-700 focus:border-indigo-500 focus:outline-none text-base placeholder:text-zinc-500"
        />
      </div>

      <div className="flex gap-6">
        {/* Customer list */}
        <div className="flex-1 min-w-0">
          {loading ? (
            <p className="text-zinc-400 text-base">Loading customers…</p>
          ) : error !== null ? (
            <p className="text-red-400 text-base">{error}</p>
          ) : customers.length === 0 ? (
            <div className="text-center py-16">
              <Users size={48} className="text-zinc-600 mx-auto mb-4" aria-hidden="true" />
              <p className="text-zinc-400 text-base">
                {debouncedSearch ? 'No customers match your search.' : 'No customers yet. They will appear here after their first order.'}
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-zinc-700 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-700 bg-zinc-800/50">
                    <th className="text-left px-4 py-3 text-zinc-400 font-semibold">Customer</th>
                    <th className="text-left px-4 py-3 text-zinc-400 font-semibold">Mobile</th>
                    <th className="text-right px-4 py-3 text-zinc-400 font-semibold">Visits</th>
                    <th className="text-right px-4 py-3 text-zinc-400 font-semibold">Total Spend</th>
                    <th className="text-center px-4 py-3 text-zinc-400 font-semibold">Loyalty</th>
                    <th className="text-left px-4 py-3 text-zinc-400 font-semibold">Last Visit</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {customers.map((customer) => {
                    const isEditing = editingId === customer.id
                    const isSelected = selectedCustomer?.id === customer.id
                    return (
                      <tr
                        key={customer.id}
                        className={[
                          'border-b border-zinc-800 transition-colors',
                          isSelected ? 'bg-indigo-900/20' : 'hover:bg-zinc-800/60 cursor-pointer',
                        ].join(' ')}
                        onClick={() => { if (!isEditing) openCustomer(customer) }}
                      >
                        <td className="px-4 py-3">
                          {isEditing ? (
                            <input
                              type="text"
                              value={editName}
                              onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setEditName(e.target.value) }}
                              onClick={(e) => { e.stopPropagation() }}
                              placeholder="Customer name"
                              className="w-full min-h-[36px] px-2 rounded-lg bg-zinc-700 text-white border border-zinc-600 focus:border-indigo-400 focus:outline-none text-sm"
                            />
                          ) : (
                            <span className="font-medium text-gray-900">
                              {customer.name ?? <span className="text-gray-400 italic">—</span>}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1 text-gray-600">
                            <Phone size={12} className="text-gray-400" aria-hidden="true" />
                            {customer.mobile}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="font-semibold text-amber-400">{customer.visit_count}</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="font-semibold text-white">
                            {formatPrice(customer.total_spend_cents, DEFAULT_CURRENCY_SYMBOL)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex flex-col items-center gap-0.5">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${membershipBadge(customer.membership_status)}`}>
                              {customer.membership_status}
                            </span>
                            <span className="text-xs text-zinc-500">{customer.loyalty_points} pts</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-zinc-400">
                          {isoDateToDDMMYYYY(customer.last_visit_at)}
                        </td>
                        <td className="px-4 py-3" onClick={(e) => { e.stopPropagation() }}>
                          {isEditing ? (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => { void saveEdit(customer) }}
                                disabled={saving}
                                className="min-h-[36px] min-w-[36px] rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center transition-colors disabled:opacity-50"
                                aria-label="Save"
                              >
                                <Check size={14} aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                onClick={() => { setEditingId(null) }}
                                disabled={saving}
                                className="min-h-[36px] min-w-[36px] rounded-lg border border-zinc-600 text-zinc-400 hover:text-white flex items-center justify-center transition-colors disabled:opacity-50"
                                aria-label="Cancel"
                              >
                                <X size={14} aria-hidden="true" />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => { startEdit(customer) }}
                              className="min-h-[36px] min-w-[36px] rounded-lg border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 flex items-center justify-center transition-colors"
                              aria-label="Edit customer"
                            >
                              <Pencil size={14} aria-hidden="true" />
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {saveError !== null && (
                <p className="px-4 py-3 text-red-400 text-sm border-t border-zinc-700">{saveError}</p>
              )}
            </div>
          )}
        </div>

        {/* Customer detail panel */}
        {selectedCustomer !== null && (
          <div className="w-80 shrink-0">
            <div className="bg-zinc-800 rounded-xl border border-zinc-700 p-5 space-y-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="font-bold text-white text-lg">
                    {selectedCustomer.name ?? <span className="text-zinc-400 italic text-base">No name</span>}
                  </h2>
                  <p className="text-zinc-400 text-sm inline-flex items-center gap-1 mt-0.5">
                    <Phone size={12} aria-hidden="true" />
                    {selectedCustomer.mobile}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => { setSelectedCustomer(null) }}
                  className="min-h-[32px] min-w-[32px] text-zinc-500 hover:text-white flex items-center justify-center rounded-lg"
                  aria-label="Close panel"
                >
                  <X size={16} aria-hidden="true" />
                </button>
              </div>

              {/* Membership badge */}
              <div className="flex items-center gap-2">
                <Star size={14} className={membershipColor(selectedCustomer.membership_status)} aria-hidden="true" />
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${membershipBadge(selectedCustomer.membership_status)}`}>
                  {selectedCustomer.membership_status}
                </span>
                <span className="text-xs text-zinc-400">{selectedCustomer.loyalty_points} pts</span>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-zinc-700/50 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-amber-400">{selectedCustomer.visit_count}</p>
                  <p className="text-xs text-zinc-400 mt-0.5">visits</p>
                </div>
                <div className="bg-zinc-700/50 rounded-xl p-3 text-center">
                  <p className="text-lg font-bold text-white">
                    {formatPrice(selectedCustomer.total_spend_cents, DEFAULT_CURRENCY_SYMBOL)}
                  </p>
                  <p className="text-xs text-zinc-400 mt-0.5">total spend</p>
                </div>
              </div>

              <div className="text-xs text-zinc-500 space-y-1">
                {selectedCustomer.visit_count > 0 && (
                  <p>{ordinalSuffix(selectedCustomer.visit_count)} visit</p>
                )}
                {selectedCustomer.last_visit_at && (
                  <p>Last visit: {isoDateToDDMMYYYY(selectedCustomer.last_visit_at)}</p>
                )}
                {selectedCustomer.date_of_birth && (
                  <p>DOB: {isoDateToDDMMYYYY(selectedCustomer.date_of_birth)}</p>
                )}
                {selectedCustomer.email && (
                  <p className="inline-flex items-center gap-1 text-zinc-400">
                    <Mail size={11} aria-hidden="true" />
                    {selectedCustomer.email}
                  </p>
                )}
                {selectedCustomer.delivery_address && (
                  <p className="inline-flex items-center gap-1 text-zinc-400">
                    <MapPin size={11} aria-hidden="true" />
                    {selectedCustomer.delivery_address}
                  </p>
                )}
                {selectedCustomer.notes && (
                  <p className="text-zinc-400">{selectedCustomer.notes}</p>
                )}
              </div>

              {/* Extended edit fields */}
              {editingId === selectedCustomer.id && (
                <div className="space-y-3">
                  <div>
                    <label htmlFor="edit-dob" className="block text-zinc-400 text-xs mb-1">Date of Birth</label>
                    <input
                      id="edit-dob"
                      type="date"
                      value={editDob}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setEditDob(e.target.value) }}
                      className="w-full px-3 py-2 rounded-xl bg-zinc-700 text-white border border-zinc-600 focus:border-indigo-400 focus:outline-none text-sm"
                    />
                  </div>
                  <div>
                    <label htmlFor="edit-email" className="block text-zinc-400 text-xs mb-1">Email</label>
                    <input
                      id="edit-email"
                      type="email"
                      value={editEmail}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setEditEmail(e.target.value) }}
                      className="w-full px-3 py-2 rounded-xl bg-zinc-700 text-white border border-zinc-600 focus:border-indigo-400 focus:outline-none text-sm"
                      placeholder="customer@email.com"
                    />
                  </div>
                  <div>
                    <label htmlFor="edit-address" className="block text-zinc-400 text-xs mb-1">Delivery Address</label>
                    <textarea
                      id="edit-address"
                      value={editAddress}
                      onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => { setEditAddress(e.target.value) }}
                      rows={2}
                      className="w-full px-3 py-2 rounded-xl bg-zinc-700 text-white border border-zinc-600 focus:border-indigo-400 focus:outline-none text-sm resize-none"
                      placeholder="Delivery address…"
                    />
                  </div>
                  <div>
                    <label htmlFor="edit-notes" className="block text-zinc-400 text-xs mb-1">Notes</label>
                    <textarea
                      id="edit-notes"
                      value={editNotes}
                      onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => { setEditNotes(e.target.value) }}
                      rows={2}
                      className="w-full px-3 py-2 rounded-xl bg-zinc-700 text-white border border-zinc-600 focus:border-indigo-400 focus:outline-none text-sm resize-none"
                      placeholder="Add a note about this customer…"
                    />
                  </div>
                </div>
              )}

              {/* Order history */}
              <div>
                <h3 className="text-sm font-semibold text-zinc-300 mb-3">Order History</h3>
                {ordersLoading ? (
                  <p className="text-zinc-500 text-xs">Loading…</p>
                ) : ordersError !== null ? (
                  <p className="text-red-400 text-xs">{ordersError}</p>
                ) : customerOrders.length === 0 ? (
                  <p className="text-zinc-500 text-xs">No orders found.</p>
                ) : (
                  <ul className="space-y-2">
                    {customerOrders.map((order) => {
                      const orderTypeLabel = order.order_type === 'delivery' ? 'Delivery' : order.order_type === 'takeaway' ? 'Takeaway' : 'Dine-in'
                      const orderTypeColor = order.order_type === 'delivery' ? 'text-blue-400' : order.order_type === 'takeaway' ? 'text-amber-400' : 'text-zinc-400'
                      // Build correct order URL: dine-in uses table_id, takeaway/delivery use order_type segment.
                      // For dine-in orders with a null table_id (edge case), skip the link.
                      const segment = order.order_type === 'dine_in' ? order.table_id : order.order_type
                      const hasValidLink = segment !== null
                      return (
                        <li key={order.id} className="bg-zinc-700/50 rounded-xl px-3 py-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              {order.bill_number && (
                                <p className="text-xs font-mono text-indigo-400">{order.bill_number}</p>
                              )}
                              <p className="text-xs text-zinc-400">
                                {isoDateToDDMMYYYY(order.created_at)}
                                <span className={`ml-2 ${orderTypeColor}`}>{orderTypeLabel}</span>
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-white text-sm">
                                {order.final_total_cents != null
                                  ? formatPrice(order.final_total_cents, DEFAULT_CURRENCY_SYMBOL)
                                  : '—'}
                              </span>
                              {hasValidLink && (
                                <Link
                                  href={`/tables/${segment}/order/${order.id}`}
                                  className="text-xs text-indigo-400 hover:text-indigo-300 underline"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  View
                                </Link>
                              )}
                            </div>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>

              {/* Reservations (issue #277) */}
              <div>
                <h3 className="text-sm font-semibold text-zinc-300 mb-3 flex items-center gap-1.5">
                  <CalendarDays size={14} aria-hidden="true" />
                  Reservations
                </h3>
                {reservationsLoading ? (
                  <p className="text-zinc-500 text-xs">Loading…</p>
                ) : customerReservations.length === 0 ? (
                  <p className="text-zinc-500 text-xs">No reservations found.</p>
                ) : (
                  <ul className="space-y-2">
                    {customerReservations.map((res) => (
                      <li key={res.id} className="bg-zinc-700/50 rounded-xl px-3 py-2.5 space-y-0.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium text-white">
                            {res.reservation_time
                              ? formatDateTimeShort(res.reservation_time)
                              : 'Walk-in'}
                          </span>
                          <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                            res.status === 'waiting' ? 'bg-amber-500/20 text-amber-300' :
                            res.status === 'seated' ? 'bg-emerald-500/20 text-emerald-300' :
                            'bg-zinc-500/20 text-zinc-400'
                          }`}>
                            {res.status}
                          </span>
                        </div>
                        <p className="text-xs text-zinc-400">Party of {res.party_size}</p>
                        {res.notes && <p className="text-xs text-zinc-500 italic">{res.notes}</p>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
