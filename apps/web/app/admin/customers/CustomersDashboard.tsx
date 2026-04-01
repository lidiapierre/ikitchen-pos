'use client'

import { useState, useEffect, useCallback } from 'react'
import type { JSX } from 'react'
import Link from 'next/link'
import { Users, Search, Phone, X, Pencil, Check } from 'lucide-react'
import { useUser } from '@/lib/user-context'
import { formatPrice, DEFAULT_CURRENCY_SYMBOL } from '@/lib/formatPrice'
import {
  fetchCustomers,
  fetchCustomerOrders,
  updateCustomer,
} from './customersApi'
import type { Customer, CustomerOrder } from './customersApi'

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
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ''

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

  // Inline edit state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Load restaurant_id from the user context
  useEffect(() => {
    if (!supabaseUrl || !supabaseKey) return
    // Fetch via users table to get the restaurant_id
    void fetch(`${supabaseUrl}/rest/v1/users?select=restaurant_id&limit=1`, {
      headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
    })
      .then((r) => r.json())
      .then((rows: Array<{ restaurant_id: string }>) => {
        if (rows.length > 0) setRestaurantId(rows[0].restaurant_id)
      })
      .catch(() => { /* non-fatal */ })
  }, [supabaseUrl, supabaseKey])

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search) }, 300)
    return () => { clearTimeout(t) }
  }, [search])

  const loadCustomers = useCallback(() => {
    if (!restaurantId) return
    setLoading(true)
    setError(null)
    fetchCustomers(supabaseUrl, supabaseKey, restaurantId, debouncedSearch)
      .then(setCustomers)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load customers')
      })
      .finally(() => { setLoading(false) })
  }, [supabaseUrl, supabaseKey, restaurantId, debouncedSearch])

  useEffect(() => {
    loadCustomers()
  }, [loadCustomers])

  function openCustomer(customer: Customer): void {
    setSelectedCustomer(customer)
    setCustomerOrders([])
    setOrdersError(null)
    setOrdersLoading(true)
    fetchCustomerOrders(supabaseUrl, supabaseKey, customer.restaurant_id, customer.mobile)
      .then(setCustomerOrders)
      .catch((err: unknown) => {
        setOrdersError(err instanceof Error ? err.message : 'Failed to load orders')
      })
      .finally(() => { setOrdersLoading(false) })
  }

  function startEdit(customer: Customer): void {
    setEditingId(customer.id)
    setEditName(customer.name ?? '')
    setEditNotes(customer.notes ?? '')
    setSaveError(null)
  }

  async function saveEdit(customer: Customer): Promise<void> {
    if (!accessToken) return
    setSaving(true)
    setSaveError(null)
    try {
      await updateCustomer(supabaseUrl, supabaseKey, accessToken, customer.id, {
        name: editName.trim() || undefined,
        notes: editNotes.trim() || undefined,
      })
      // Update local state
      const updated: Customer = {
        ...customer,
        name: editName.trim() || null,
        notes: editNotes.trim() || null,
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
        <h1 className="text-2xl font-bold text-white">Customers</h1>
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
                            <span className="font-medium text-white">
                              {customer.name ?? <span className="text-zinc-500 italic">—</span>}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1 text-zinc-300">
                            <Phone size={12} className="text-zinc-500" aria-hidden="true" />
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
                        <td className="px-4 py-3 text-zinc-400">
                          {customer.last_visit_at
                            ? new Date(customer.last_visit_at).toLocaleDateString()
                            : '—'}
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

              <div className="text-xs text-zinc-500">
                {selectedCustomer.visit_count > 0 && (
                  <p>{ordinalSuffix(selectedCustomer.visit_count)} visit</p>
                )}
                {selectedCustomer.last_visit_at && (
                  <p>Last visit: {new Date(selectedCustomer.last_visit_at).toLocaleDateString()}</p>
                )}
                {selectedCustomer.notes && (
                  <p className="mt-1 text-zinc-400">{selectedCustomer.notes}</p>
                )}
              </div>

              {/* Notes edit */}
              {editingId === selectedCustomer.id && (
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
                    {customerOrders.map((order) => (
                      <li key={order.id} className="bg-zinc-700/50 rounded-xl px-3 py-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            {order.bill_number && (
                              <p className="text-xs font-mono text-indigo-400">{order.bill_number}</p>
                            )}
                            <p className="text-xs text-zinc-400">
                              {new Date(order.created_at).toLocaleDateString()}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-white text-sm">
                              {order.final_total_cents != null
                                ? formatPrice(order.final_total_cents, DEFAULT_CURRENCY_SYMBOL)
                                : '—'}
                            </span>
                            <Link
                              href={`/tables/${order.table_id ?? order.order_type}/order/${order.id}`}
                              className="text-xs text-indigo-400 hover:text-indigo-300 underline"
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              View
                            </Link>
                          </div>
                        </div>
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
