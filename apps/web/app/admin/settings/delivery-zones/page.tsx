'use client'

/**
 * Admin → Settings → Delivery Zones
 *
 * Issue #353: Configurable delivery fees by area/location.
 * Admins can create, edit, and delete delivery zones (e.g. Zone A: ৳50).
 * These zones are available when staff create a delivery order.
 */

import React, { useState, useEffect, useCallback } from 'react'
import type { JSX } from 'react'
import Link from 'next/link'
import { Bike, Plus, Pencil, Trash2, Check, X } from 'lucide-react'
import { useUser } from '@/lib/user-context'

interface DeliveryZone {
  id: string
  name: string
  charge_amount: number
}

type SaveMode = 'add' | 'edit'

export default function DeliveryZonesPage(): JSX.Element {
  const { accessToken: _at } = useUser()
  const accessToken = _at ?? ''

  const [loading, setLoading] = useState(true)
  const [restaurantId, setRestaurantId] = useState<string>('')
  const [zones, setZones] = useState<DeliveryZone[]>([])
  const [fetchError, setFetchError] = useState<string | null>(null)

  // Form state
  const [showForm, setShowForm] = useState(false)
  const [saveMode, setSaveMode] = useState<SaveMode>('add')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [zoneName, setZoneName] = useState('')
  const [chargeAmount, setChargeAmount] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // Confirm-delete state
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ''

  const loadZones = useCallback(async (rid: string): Promise<void> => {
    // Build headers inline so this callback has no stale-closure issues with apiHeaders()
    const headers = {
      apikey: publishableKey,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    }
    const res = await fetch(
      `${supabaseUrl}/rest/v1/delivery_zones?restaurant_id=eq.${rid}&order=name.asc&select=id,name,charge_amount`,
      { headers },
    )
    if (!res.ok) throw new Error(`Failed to load zones: ${res.statusText}`)
    setZones((await res.json()) as DeliveryZone[])
  }, [supabaseUrl, publishableKey, accessToken])

  useEffect(() => {
    if (!supabaseUrl || !accessToken) return

    const headers = {
      apikey: publishableKey,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    }
    fetch(`${supabaseUrl}/rest/v1/restaurants?select=id&limit=1`, { headers })
      .then((r) => r.json() as Promise<Array<{ id: string }>>)
      .then(async (rows) => {
        if (rows.length === 0) throw new Error('No restaurant found')
        const rid = rows[0].id
        setRestaurantId(rid)
        await loadZones(rid)
      })
      .catch((err: unknown) => {
        setFetchError(err instanceof Error ? err.message : 'Failed to load')
      })
      .finally(() => { setLoading(false) })
  }, [accessToken, supabaseUrl, publishableKey, loadZones])

  function openAdd(): void {
    setSaveMode('add')
    setEditingId(null)
    setZoneName('')
    setChargeAmount('')
    setFormError(null)
    setShowForm(true)
  }

  function openEdit(zone: DeliveryZone): void {
    setSaveMode('edit')
    setEditingId(zone.id)
    setZoneName(zone.name)
    setChargeAmount(String(zone.charge_amount / 100))
    setFormError(null)
    setShowForm(true)
  }

  function cancelForm(): void {
    setShowForm(false)
    setFormError(null)
  }

  async function handleSave(): Promise<void> {
    if (!zoneName.trim()) { setFormError('Zone name is required'); return }
    const parsed = parseFloat(chargeAmount)
    if (isNaN(parsed) || parsed < 0) { setFormError('Charge amount must be a non-negative number'); return }
    const chargeCents = Math.round(parsed * 100)

    setSubmitting(true)
    setFormError(null)
    try {
      const authHeaders = {
        apikey: publishableKey,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      }
      if (saveMode === 'add') {
        const res = await fetch(`${supabaseUrl}/rest/v1/delivery_zones`, {
          method: 'POST',
          headers: { ...authHeaders, Prefer: 'return=representation' },
          body: JSON.stringify({ restaurant_id: restaurantId, name: zoneName.trim(), charge_amount: chargeCents }),
        })
        if (!res.ok) throw new Error(`Save failed: ${res.statusText}`)
      } else {
        const res = await fetch(
          `${supabaseUrl}/rest/v1/delivery_zones?id=eq.${editingId}`,
          {
            method: 'PATCH',
            headers: { ...authHeaders, Prefer: 'return=representation' },
            body: JSON.stringify({ name: zoneName.trim(), charge_amount: chargeCents }),
          },
        )
        if (!res.ok) throw new Error(`Update failed: ${res.statusText}`)
      }
      setShowForm(false)
      setSuccessMsg(saveMode === 'add' ? 'Zone added' : 'Zone updated')
      setTimeout(() => { setSuccessMsg(null) }, 3000)
      await loadZones(restaurantId)
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(id: string): Promise<void> {
    setDeletingId(id)
    try {
      const authHeaders = {
        apikey: publishableKey,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      }
      const res = await fetch(`${supabaseUrl}/rest/v1/delivery_zones?id=eq.${id}`, {
        method: 'DELETE',
        headers: authHeaders,
      })
      if (!res.ok) throw new Error(`Delete failed: ${res.statusText}`)
      setSuccessMsg('Zone deleted')
      setTimeout(() => { setSuccessMsg(null) }, 3000)
      await loadZones(restaurantId)
    } catch (err: unknown) {
      setFetchError(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setDeletingId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-brand-navy">
        Loading delivery zones…
      </div>
    )
  }

  if (fetchError) {
    return (
      <div className="text-red-600 p-4">
        <p className="font-semibold">Error</p>
        <p className="text-sm">{fetchError}</p>
      </div>
    )
  }

  return (
    <div className="max-w-2xl space-y-6">
      {/* Back link */}
      <div>
        <Link
          href="/admin/settings/restaurant"
          className="text-brand-blue hover:text-brand-navy text-sm font-medium"
        >
          ← Settings
        </Link>
      </div>

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-brand-navy font-heading flex items-center gap-2">
          <Bike size={22} aria-hidden="true" />
          Delivery Zones
        </h1>
        <button
          type="button"
          onClick={openAdd}
          className="inline-flex items-center gap-2 min-h-[48px] px-5 rounded-xl bg-brand-navy text-white font-semibold text-base hover:bg-brand-blue transition-colors"
        >
          <Plus size={18} aria-hidden="true" /> Add Zone
        </button>
      </div>

      <p className="text-sm text-zinc-500">
        Configure delivery charge zones. Staff select a zone when creating a delivery order and the charge is applied automatically to the bill.
      </p>

      {successMsg && (
        <div className="flex items-center gap-2 rounded-xl border border-green-300 bg-green-50 px-4 py-3 text-green-700 text-sm">
          <Check size={16} aria-hidden="true" /> {successMsg}
        </div>
      )}

      {/* Add / Edit form */}
      {showForm && (
        <div className="rounded-2xl border border-brand-grey/40 bg-white p-6 space-y-4 shadow-sm">
          <h2 className="font-semibold text-brand-navy text-lg">
            {saveMode === 'add' ? 'New Zone' : 'Edit Zone'}
          </h2>

          <div>
            <label htmlFor="zone-name" className="block text-sm font-medium text-brand-navy mb-1">
              Zone Name <span className="text-red-500">*</span>
            </label>
            <input
              id="zone-name"
              type="text"
              placeholder="e.g. Zone A, City Centre, Gulshan"
              value={zoneName}
              onChange={(e) => { setZoneName(e.target.value) }}
              className="w-full min-h-[48px] px-4 rounded-xl border-2 border-brand-grey/40 focus:border-brand-gold focus:outline-none text-base text-brand-navy"
            />
          </div>

          <div>
            <label htmlFor="zone-charge" className="block text-sm font-medium text-brand-navy mb-1">
              Delivery Charge (৳) <span className="text-red-500">*</span>
            </label>
            <input
              id="zone-charge"
              type="number"
              min="0"
              step="0.01"
              placeholder="e.g. 50"
              value={chargeAmount}
              onChange={(e) => { setChargeAmount(e.target.value) }}
              className="w-full min-h-[48px] px-4 rounded-xl border-2 border-brand-grey/40 focus:border-brand-gold focus:outline-none text-base text-brand-navy"
            />
          </div>

          {formError && (
            <p className="text-red-500 text-sm">{formError}</p>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={cancelForm}
              className="flex-1 min-h-[48px] rounded-xl border-2 border-brand-grey/40 text-brand-navy font-semibold hover:border-brand-navy transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => { void handleSave() }}
              disabled={submitting}
              className="flex-1 min-h-[48px] rounded-xl bg-brand-navy text-white font-semibold hover:bg-brand-blue transition-colors disabled:opacity-50"
            >
              {submitting ? 'Saving…' : saveMode === 'add' ? 'Add Zone' : 'Save Changes'}
            </button>
          </div>
        </div>
      )}

      {/* Zone list */}
      {zones.length === 0 && !showForm ? (
        <div className="rounded-2xl border border-dashed border-brand-grey/50 p-10 text-center text-brand-grey">
          <Bike size={32} className="mx-auto mb-3 opacity-40" aria-hidden="true" />
          <p className="text-base font-medium">No delivery zones yet</p>
          <p className="text-sm mt-1">Add zones to apply delivery charges to orders.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {zones.map((zone) => (
            <li
              key={zone.id}
              className="flex items-center justify-between gap-4 rounded-2xl border border-brand-grey/30 bg-white px-5 py-4 shadow-sm"
            >
              <div>
                <p className="font-semibold text-brand-navy text-base">{zone.name}</p>
                <p className="text-sm text-zinc-500">
                  ৳{(zone.charge_amount / 100).toFixed(2)} delivery charge
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => { openEdit(zone) }}
                  className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl border border-brand-grey/30 text-brand-navy hover:bg-brand-offwhite transition-colors"
                  aria-label={`Edit ${zone.name}`}
                >
                  <Pencil size={16} aria-hidden="true" />
                </button>
                {deletingId === zone.id ? (
                  <span className="text-xs text-zinc-400 px-2">Deleting…</span>
                ) : confirmDeleteId === zone.id ? (
                  /* Inline confirmation — prevents accidental deletes */
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-red-500 font-medium">Delete?</span>
                    <button
                      type="button"
                      onClick={() => { setConfirmDeleteId(null); void handleDelete(zone.id) }}
                      className="min-h-[36px] px-2 text-xs rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors font-semibold"
                      aria-label="Confirm delete"
                    >
                      Yes
                    </button>
                    <button
                      type="button"
                      onClick={() => { setConfirmDeleteId(null) }}
                      className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg border border-brand-grey/30 text-brand-navy hover:bg-brand-offwhite transition-colors"
                      aria-label="Cancel delete"
                    >
                      <X size={14} aria-hidden="true" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => { setConfirmDeleteId(zone.id) }}
                    className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl border border-red-200 text-red-500 hover:bg-red-50 transition-colors"
                    aria-label={`Delete ${zone.name}`}
                  >
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
