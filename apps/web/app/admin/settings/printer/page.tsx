'use client'

/**
 * Admin → Settings → Printers
 *
 * Multi-printer management for issue #187.
 * Supports kitchen / cashier / bar printer profiles with per-profile
 * test print and enable/disable toggle.
 *
 * Falls back to the legacy single-printer config (printer_configs table)
 * for backwards compatibility.
 */

import React, { useState, useEffect, useCallback } from 'react'
import type { JSX } from 'react'
import { supabase } from '@/lib/supabase'
import { PRINT_BRIDGE_URL } from '@/lib/kotPrint'
import { buildKotEscPos } from '@/lib/escpos'
import { AlertTriangle, CheckCircle2, Info, Printer as PrinterIcon, X } from 'lucide-react'

const IP_REGEX = /^(\d{1,3}\.){3}\d{1,3}$/

type PrinterType = 'kitchen' | 'cashier' | 'bar'

const PRINTER_TYPE_LABELS: Record<PrinterType, string> = {
  kitchen: 'Kitchen',
  cashier: 'Cashier',
  bar: 'Bar',
}

interface PrinterRow {
  id: string
  restaurant_id: string
  name: string
  ip_address: string
  port: number
  type: PrinterType
  enabled: boolean
}

interface PrinterFormState {
  name: string
  ip_address: string
  port: string
  type: PrinterType
  enabled: boolean
}

const EMPTY_FORM: PrinterFormState = {
  name: '',
  ip_address: '',
  port: '9100',
  type: 'kitchen',
  enabled: true,
}

function validateForm(form: PrinterFormState): string | null {
  if (!form.name.trim()) return 'Printer name is required.'
  if (!form.ip_address.trim()) return 'IP address is required.'
  if (!IP_REGEX.test(form.ip_address.trim())) return 'Invalid IP address (e.g. 192.168.1.100).'
  const portNum = parseInt(form.port, 10)
  if (isNaN(portNum) || portNum < 1 || portNum > 65535) return 'Port must be 1–65535.'
  return null
}

export default function PrinterSettingsPage(): JSX.Element {
  const [loading, setLoading] = useState(true)
  const [restaurantId, setRestaurantId] = useState<string | null>(null)
  const [printers, setPrinters] = useState<PrinterRow[]>([])
  const [globalError, setGlobalError] = useState<string | null>(null)

  // Add / edit modal
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<PrinterFormState>(EMPTY_FORM)
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Delete confirmation
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Test print
  const [testingId, setTestingId] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<{ id: string; ok: boolean; msg: string } | null>(null)

  const loadPrinters = useCallback(async (rid: string) => {
    const { data, error } = await supabase
      .from('printers')
      .select('id,restaurant_id,name,ip_address,port,type,enabled')
      .eq('restaurant_id', rid)
      .order('type')
      .order('name')

    if (error) {
      setGlobalError(`Failed to load printers: ${error.message}`)
    } else {
      setPrinters((data ?? []) as PrinterRow[])
    }
  }, [])

  useEffect(() => {
    async function init(): Promise<void> {
      setLoading(true)
      setGlobalError(null)

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setGlobalError('Not authenticated')
        setLoading(false)
        return
      }

      const { data: userData } = await supabase
        .from('users')
        .select('restaurant_id')
        .eq('id', user.id)
        .single()

      const rid = (userData as { restaurant_id: string | null } | null)?.restaurant_id ?? null
      setRestaurantId(rid)

      if (rid) await loadPrinters(rid)
      setLoading(false)
    }
    void init()
  }, [loadPrinters])

  function openAdd(): void {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setFormError(null)
    setShowModal(true)
  }

  function openEdit(printer: PrinterRow): void {
    setEditingId(printer.id)
    setForm({
      name: printer.name,
      ip_address: printer.ip_address,
      port: String(printer.port),
      type: printer.type,
      enabled: printer.enabled,
    })
    setFormError(null)
    setShowModal(true)
  }

  async function handleSave(): Promise<void> {
    const validationError = validateForm(form)
    if (validationError) {
      setFormError(validationError)
      return
    }
    if (!restaurantId) {
      setFormError('No restaurant associated with your account.')
      return
    }

    setSaving(true)
    setFormError(null)

    const payload = {
      restaurant_id: restaurantId,
      name: form.name.trim(),
      ip_address: form.ip_address.trim(),
      port: parseInt(form.port, 10),
      type: form.type,
      enabled: form.enabled,
      updated_at: new Date().toISOString(),
    }

    let error: { message: string } | null = null

    if (editingId) {
      const result = await supabase
        .from('printers')
        .update(payload)
        .eq('id', editingId)
      error = result.error
    } else {
      const result = await supabase
        .from('printers')
        .insert(payload)
      error = result.error
    }

    setSaving(false)

    if (error) {
      setFormError(`Failed to save: ${error.message}`)
    } else {
      setShowModal(false)
      if (restaurantId) await loadPrinters(restaurantId)
    }
  }

  async function handleDelete(id: string): Promise<void> {
    setDeleting(true)
    setDeleteError(null)

    const { error } = await supabase.from('printers').delete().eq('id', id)

    setDeleting(false)
    if (error) {
      setDeleteError(`Failed to delete: ${error.message}`)
    } else {
      setDeletingId(null)
      if (restaurantId) await loadPrinters(restaurantId)
    }
  }

  async function handleToggleEnabled(printer: PrinterRow): Promise<void> {
    const { error } = await supabase
      .from('printers')
      .update({ enabled: !printer.enabled, updated_at: new Date().toISOString() })
      .eq('id', printer.id)

    if (!error && restaurantId) {
      await loadPrinters(restaurantId)
    }
  }

  async function handleTestPrint(printer: PrinterRow): Promise<void> {
    setTestingId(printer.id)
    setTestResult(null)

    try {
      const testItems = [{ name: 'TEST PRINT', qty: 1 }]
      const escposBytes = buildKotEscPos(testItems, {
        tableId: 'TEST',
        orderId: 'test-0000',
        timestamp: new Date().toLocaleString(),
      })
      const base64 = btoa(String.fromCharCode(...escposBytes))

      const res = await fetch(PRINT_BRIDGE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip: printer.ip_address, port: printer.port, data: base64 }),
      })

      if (res.ok) {
        setTestResult({ id: printer.id, ok: true, msg: 'Test print sent successfully.' })
      } else {
        let detail = `HTTP ${res.status}`
        try {
          const body = await res.json() as { error?: string }
          if (body?.error) detail = body.error
        } catch { /* ignore */ }
        setTestResult({ id: printer.id, ok: false, msg: `Bridge error: ${detail}` })
      }
    } catch (err) {
      const detail = err instanceof TypeError && err.message.includes('fetch')
        ? 'Bridge not running. Run: node scripts/print-bridge.js'
        : (err instanceof Error ? err.message : String(err))
      setTestResult({ id: printer.id, ok: false, msg: detail })
    } finally {
      setTestingId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <span className="text-brand-navy/60 text-lg">Loading…</span>
      </div>
    )
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold text-brand-navy font-heading">Printers</h1>
        <button
          type="button"
          onClick={openAdd}
          className="px-4 py-2 rounded-xl bg-brand-navy hover:bg-brand-blue text-white text-sm font-semibold transition-colors min-h-[44px]"
        >
          + Add Printer
        </button>
      </div>
      <p className="text-brand-navy/60 text-sm mb-6">
        Configure network printers for each station. KOTs route to <strong className="text-zinc-200">kitchen</strong>{' '}
        (or <strong className="text-zinc-200">bar</strong> for bar-tagged menus). Bills route to{' '}
        <strong className="text-zinc-200">cashier</strong>. The print bridge must be running on the same machine.
      </p>

      {globalError && (
        <div className="mb-4 p-3 rounded-xl bg-red-900/50 border border-red-700 text-red-200 text-sm flex items-center gap-2">
          <AlertTriangle size={16} aria-hidden="true" />
          {globalError}
        </div>
      )}

      {/* Bridge info */}
      <div className="mb-6 p-4 rounded-xl bg-white border border-brand-grey text-sm text-brand-navy/60">
        <p className="font-semibold text-brand-navy/80 mb-1 flex items-center gap-2">
          <Info size={14} aria-hidden="true" />
          Print Bridge Required
        </p>
        <p>Network printing requires the print bridge running on the same computer as the browser:</p>
        <pre className="mt-2 text-xs bg-black/50 rounded p-2 text-green-400 overflow-x-auto">
          node scripts/print-bridge.js
        </pre>
      </div>

      {/* Printer list */}
      {printers.length === 0 ? (
        <div className="p-6 rounded-xl bg-white border border-brand-grey text-center text-brand-grey">
          No printers configured yet. Add a printer to enable network printing.
        </div>
      ) : (
        <div className="space-y-3">
          {printers.map((printer) => (
            <div
              key={printer.id}
              className={[
                'p-4 rounded-xl border transition-colors',
                printer.enabled
                  ? 'bg-white border-brand-grey'
                  : 'bg-brand-navy border-zinc-800 opacity-60',
              ].join(' ')}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="font-semibold text-white text-base">{printer.name}</span>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-900/60 text-white border border-brand-blue">
                      {PRINTER_TYPE_LABELS[printer.type]}
                    </span>
                    {!printer.enabled && (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-brand-offwhite text-brand-navy/60">
                        Disabled
                      </span>
                    )}
                  </div>
                  <p className="text-brand-navy/60 text-sm font-mono">
                    {printer.ip_address}:{printer.port}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {/* Enable / disable toggle */}
                  <button
                    type="button"
                    onClick={() => { void handleToggleEnabled(printer) }}
                    title={printer.enabled ? 'Disable' : 'Enable'}
                    className={[
                      'relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0',
                      printer.enabled ? 'bg-brand-navy' : 'bg-zinc-600',
                    ].join(' ')}
                    aria-label={printer.enabled ? 'Disable printer' : 'Enable printer'}
                  >
                    <span
                      className={[
                        'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
                        printer.enabled ? 'translate-x-6' : 'translate-x-1',
                      ].join(' ')}
                    />
                  </button>

                  {/* Test print */}
                  <button
                    type="button"
                    onClick={() => { void handleTestPrint(printer) }}
                    disabled={testingId === printer.id || !printer.enabled}
                    className="min-h-[36px] px-3 rounded-lg text-xs font-semibold bg-brand-offwhite hover:bg-zinc-600 text-white transition-colors disabled:opacity-50 flex items-center gap-1"
                  >
                    {testingId === printer.id ? 'Testing…' : <><PrinterIcon size={12} aria-hidden="true" /> Test</>}
                  </button>

                  {/* Edit */}
                  <button
                    type="button"
                    onClick={() => { openEdit(printer) }}
                    className="min-h-[36px] px-3 rounded-lg text-xs font-semibold bg-brand-offwhite hover:bg-zinc-600 text-white transition-colors"
                  >
                    Edit
                  </button>

                  {/* Delete */}
                  <button
                    type="button"
                    onClick={() => { setDeletingId(printer.id); setDeleteError(null) }}
                    className="min-h-[36px] px-3 rounded-lg text-xs font-semibold text-red-400 hover:bg-red-900/40 border border-red-800 hover:border-red-600 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>

              {/* Test print result */}
              {testResult?.id === printer.id && (
                <div
                  className={[
                    'mt-3 p-2 rounded-lg text-xs flex items-center gap-2',
                    testResult.ok
                      ? 'bg-green-900/40 text-green-300 border border-green-700'
                      : 'bg-red-900/40 text-red-300 border border-red-700',
                  ].join(' ')}
                >
                  {testResult.ok
                    ? <CheckCircle2 size={14} aria-hidden="true" />
                    : <AlertTriangle size={14} aria-hidden="true" />}
                  {testResult.msg}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70">
          <div className="w-full max-w-lg bg-brand-navy rounded-t-2xl p-6 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-white">
                {editingId ? 'Edit Printer' : 'Add Printer'}
              </h2>
              <button
                type="button"
                onClick={() => { setShowModal(false) }}
                className="text-brand-navy/60 hover:text-white min-h-[44px] min-w-[44px] flex items-center justify-center"
                aria-label="Close"
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>

            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-brand-navy/80 mb-1">
                Printer Name
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => { setForm((f) => ({ ...f, name: e.target.value })) }}
                placeholder="e.g. Kitchen Printer 1"
                className="w-full bg-white border border-brand-grey rounded-lg px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-brand-gold text-base"
              />
            </div>

            {/* Type */}
            <div>
              <label className="block text-sm font-medium text-brand-navy/80 mb-2">
                Printer Type
              </label>
              <div className="flex gap-2">
                {(['kitchen', 'cashier', 'bar'] as PrinterType[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => { setForm((f) => ({ ...f, type: t })) }}
                    className={[
                      'flex-1 py-2.5 px-3 rounded-xl text-sm font-medium border transition-colors',
                      form.type === t
                        ? 'bg-brand-navy border-brand-blue text-white'
                        : 'bg-white border-brand-grey text-brand-navy/80 hover:bg-brand-offwhite',
                    ].join(' ')}
                  >
                    {PRINTER_TYPE_LABELS[t]}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-brand-grey">
                KOT items route to <em>kitchen</em> (or <em>bar</em> if the menu is tagged bar). Bills route to <em>cashier</em>.
              </p>
            </div>

            {/* IP */}
            <div>
              <label className="block text-sm font-medium text-brand-navy/80 mb-1">
                IP Address
              </label>
              <input
                type="text"
                value={form.ip_address}
                onChange={(e) => { setForm((f) => ({ ...f, ip_address: e.target.value })) }}
                placeholder="192.168.1.100"
                className="w-full bg-white border border-brand-grey rounded-lg px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-brand-gold text-base font-mono"
              />
            </div>

            {/* Port */}
            <div>
              <label className="block text-sm font-medium text-brand-navy/80 mb-1">
                Port (default 9100)
              </label>
              <input
                type="number"
                value={form.port}
                onChange={(e) => { setForm((f) => ({ ...f, port: e.target.value })) }}
                min="1"
                max="65535"
                className="w-full bg-white border border-brand-grey rounded-lg px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-brand-gold text-base"
              />
            </div>

            {/* Enabled */}
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-brand-navy/80">Enabled</span>
              <button
                type="button"
                onClick={() => { setForm((f) => ({ ...f, enabled: !f.enabled })) }}
                className={[
                  'relative inline-flex h-7 w-12 items-center rounded-full transition-colors',
                  form.enabled ? 'bg-brand-navy' : 'bg-zinc-600',
                ].join(' ')}
              >
                <span
                  className={[
                    'inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform',
                    form.enabled ? 'translate-x-6' : 'translate-x-1',
                  ].join(' ')}
                />
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-xl bg-red-900/50 border border-red-700 text-red-200 text-sm flex items-center gap-2">
                <AlertTriangle size={16} aria-hidden="true" />
                {formError}
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => { setShowModal(false) }}
                disabled={saving}
                className="flex-1 min-h-[48px] rounded-xl text-base font-semibold border-2 border-brand-grey text-brand-navy/80 hover:border-zinc-400 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => { void handleSave() }}
                disabled={saving}
                className={[
                  'flex-1 min-h-[48px] rounded-xl text-base font-semibold transition-colors',
                  saving
                    ? 'bg-brand-offwhite text-brand-navy/60 cursor-wait'
                    : 'bg-brand-navy hover:bg-brand-blue text-white',
                ].join(' ')}
              >
                {saving ? 'Saving…' : editingId ? 'Update' : 'Add Printer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deletingId && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70">
          <div className="w-full max-w-lg bg-white rounded-t-2xl p-6 space-y-4">
            <h2 className="text-xl font-semibold text-white">Delete Printer?</h2>
            <p className="text-brand-navy/80 text-base">
              This will remove the printer profile. Print jobs will fall back to browser print.
            </p>
            {deleteError && (
              <div className="p-3 rounded-xl bg-red-900/50 border border-red-700 text-red-200 text-sm flex items-center gap-2">
                <AlertTriangle size={16} aria-hidden="true" />
                {deleteError}
              </div>
            )}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => { setDeletingId(null); setDeleteError(null) }}
                disabled={deleting}
                className="flex-1 min-h-[48px] rounded-xl text-base font-semibold border-2 border-brand-grey text-brand-navy/80 hover:border-zinc-400 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => { void handleDelete(deletingId) }}
                disabled={deleting}
                className={[
                  'flex-1 min-h-[48px] rounded-xl text-base font-semibold transition-colors',
                  deleting
                    ? 'bg-brand-offwhite text-brand-navy/60 cursor-wait'
                    : 'bg-red-700 hover:bg-red-600 text-white',
                ].join(' ')}
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Legacy single-printer note */}
      <div className="mt-8 p-4 rounded-xl bg-white/60 border border-brand-grey text-sm text-brand-grey">
        <p className="font-semibold text-brand-navy/60 mb-1">Legacy Single-Printer Mode</p>
        <p>
          If you previously configured a single printer via the old settings, it still works as a fallback.
          Adding profiles here enables multi-printer routing and takes precedence over the legacy config.
        </p>
      </div>
    </div>
  )
}
