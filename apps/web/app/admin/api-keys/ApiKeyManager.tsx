'use client'

import { useState, useEffect, useRef } from 'react'
import type { JSX } from 'react'
import { useUser } from '@/lib/user-context'
import { fetchApiKeys, createApiKey, revokeApiKey } from './apiKeysApi'
import type { ApiKeyRow, CreatedApiKey } from './apiKeysApi'

type FeedbackType = 'success' | 'error'
interface Feedback {
  type: FeedbackType
  message: string
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function PermissionBadge({ perm }: { perm: string }): JSX.Element {
  const cls =
    perm === 'write'
      ? 'bg-amber-900 text-amber-200'
      : 'bg-teal-900 text-teal-200'
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${cls}`}>
      {perm}
    </span>
  )
}

function NewKeyBanner({ createdKey }: { createdKey: CreatedApiKey }): JSX.Element {
  const [copied, setCopied] = useState(false)

  function handleCopy(): void {
    navigator.clipboard.writeText(createdKey.key).catch(() => undefined)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="mb-6 p-4 rounded-xl bg-emerald-900 border border-emerald-600">
      <p className="text-emerald-200 font-semibold mb-1">
        ✅ API key created — copy it now. It will not be shown again.
      </p>
      <div className="flex items-center gap-3 mt-2">
        <code className="flex-1 font-mono text-sm text-white bg-zinc-800 px-3 py-2 rounded break-all select-all">
          {createdKey.key}
        </code>
        <button
          onClick={handleCopy}
          className="px-3 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-medium transition-colors min-w-[72px]"
        >
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>
    </div>
  )
}

export default function ApiKeyManager(): JSX.Element {
  const { accessToken } = useUser()
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''

  const [keys, setKeys] = useState<ApiKeyRow[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const [showForm, setShowForm] = useState(false)
  const [formLabel, setFormLabel] = useState('')
  const [formPerms, setFormPerms] = useState<'read' | 'write'>('read')
  const [formSubmitting, setFormSubmitting] = useState(false)

  const [newlyCreated, setNewlyCreated] = useState<CreatedApiKey | null>(null)
  const [revokingId, setRevokingId] = useState<string | null>(null)

  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!supabaseUrl || !accessToken) {
      setFetchError('Not authenticated')
      setLoading(false)
      return
    }
    fetchApiKeys(supabaseUrl, accessToken)
      .then(setKeys)
      .catch((err: unknown) => {
        setFetchError(err instanceof Error ? err.message : 'Failed to load API keys')
      })
      .finally(() => setLoading(false))
  }, [supabaseUrl, accessToken])

  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current)
    }
  }, [])

  function showFeedback(type: FeedbackType, message: string): void {
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current)
    setFeedback({ type, message })
    feedbackTimerRef.current = setTimeout(() => setFeedback(null), 5000)
  }

  async function handleCreate(): Promise<void> {
    if (!formLabel.trim()) {
      showFeedback('error', 'Label is required')
      return
    }
    if (!supabaseUrl || !accessToken) return
    setFormSubmitting(true)
    try {
      const created = await createApiKey(supabaseUrl, accessToken, formLabel.trim(), formPerms)
      setNewlyCreated(created)
      // Add to list as a display row (without the plaintext key)
      setKeys((prev) => [
        {
          id: created.id,
          label: created.label,
          permissions: created.permissions,
          key_prefix: created.key_prefix,
          created_at: created.created_at,
          last_used_at: null,
        },
        ...prev,
      ])
      setFormLabel('')
      setFormPerms('read')
      setShowForm(false)
      showFeedback('success', `API key "${created.label}" created`)
    } catch (err: unknown) {
      showFeedback('error', err instanceof Error ? err.message : 'Failed to create API key')
    } finally {
      setFormSubmitting(false)
    }
  }

  async function handleRevoke(key: ApiKeyRow): Promise<void> {
    if (!supabaseUrl || !accessToken) return
    if (!window.confirm(`Revoke API key "${key.label}"? This cannot be undone.`)) return
    setRevokingId(key.id)
    try {
      await revokeApiKey(supabaseUrl, accessToken, key.id)
      setKeys((prev) => prev.filter((k) => k.id !== key.id))
      if (newlyCreated?.id === key.id) setNewlyCreated(null)
      showFeedback('success', `Key "${key.label}" revoked`)
    } catch (err: unknown) {
      showFeedback('error', err instanceof Error ? err.message : 'Failed to revoke key')
    } finally {
      setRevokingId(null)
    }
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">API Keys</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Manage REST API keys for external system integrations
          </p>
        </div>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-colors min-h-[44px]"
          >
            + New Key
          </button>
        )}
      </div>

      {/* Feedback banner */}
      {feedback && (
        <div
          className={`mb-4 px-4 py-3 rounded-xl text-sm font-medium ${
            feedback.type === 'success'
              ? 'bg-emerald-900 text-emerald-200 border border-emerald-700'
              : 'bg-red-900 text-red-200 border border-red-700'
          }`}
        >
          {feedback.message}
        </div>
      )}

      {/* Newly created key banner */}
      {newlyCreated && <NewKeyBanner createdKey={newlyCreated} />}

      {/* Create form */}
      {showForm && (
        <div className="mb-6 p-5 rounded-xl bg-zinc-800 border border-zinc-700">
          <h2 className="text-lg font-semibold text-white mb-4">Create New API Key</h2>
          <div className="flex flex-col gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">Label</label>
              <input
                type="text"
                value={formLabel}
                onChange={(e) => setFormLabel(e.target.value)}
                placeholder="e.g. My POS Integration"
                className="w-full px-3 py-2 rounded-lg bg-zinc-700 border border-zinc-600 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                maxLength={80}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">Permissions</label>
              <div className="flex gap-3">
                {(['read', 'write'] as const).map((p) => (
                  <label key={p} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="permissions"
                      value={p}
                      checked={formPerms === p}
                      onChange={() => setFormPerms(p)}
                      className="accent-indigo-500"
                    />
                    <span className="text-zinc-200 capitalize">{p}</span>
                    <span className="text-zinc-500 text-xs">
                      {p === 'read' ? '(orders, menu, reports)' : '(read + future write ops)'}
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => { void handleCreate() }}
                disabled={formSubmitting}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium transition-colors min-h-[44px]"
              >
                {formSubmitting ? 'Creating…' : 'Create Key'}
              </button>
              <button
                onClick={() => { setShowForm(false); setFormLabel(''); setFormPerms('read') }}
                disabled={formSubmitting}
                className="px-4 py-2 rounded-xl bg-zinc-700 hover:bg-zinc-600 text-zinc-300 font-medium transition-colors min-h-[44px]"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Keys table */}
      {loading ? (
        <p className="text-zinc-400">Loading…</p>
      ) : fetchError ? (
        <p className="text-red-400">{fetchError}</p>
      ) : keys.length === 0 ? (
        <div className="text-center py-16 text-zinc-500">
          <p className="text-lg">No API keys yet</p>
          <p className="text-sm mt-1">Create a key to allow external systems to access your data</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-zinc-700">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-zinc-800 text-zinc-400 text-left">
                <th className="px-4 py-3 font-medium">Label</th>
                <th className="px-4 py-3 font-medium">Prefix</th>
                <th className="px-4 py-3 font-medium">Permissions</th>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3 font-medium">Last Used</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {keys.map((key, i) => (
                <tr
                  key={key.id}
                  className={[
                    'border-t border-zinc-700 transition-colors',
                    i % 2 === 0 ? 'bg-zinc-900' : 'bg-zinc-850',
                    'hover:bg-zinc-800',
                  ].join(' ')}
                >
                  <td className="px-4 py-3 text-white font-medium">{key.label}</td>
                  <td className="px-4 py-3">
                    <code className="font-mono text-zinc-300 bg-zinc-800 px-2 py-0.5 rounded text-xs">
                      {key.key_prefix}…
                    </code>
                  </td>
                  <td className="px-4 py-3">
                    <PermissionBadge perm={key.permissions} />
                  </td>
                  <td className="px-4 py-3 text-zinc-400">{formatDate(key.created_at)}</td>
                  <td className="px-4 py-3 text-zinc-400">{formatDate(key.last_used_at)}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => { void handleRevoke(key) }}
                      disabled={revokingId === key.id}
                      className="px-3 py-1.5 rounded-lg bg-red-900 hover:bg-red-800 disabled:opacity-50 text-red-200 text-xs font-medium transition-colors"
                    >
                      {revokingId === key.id ? 'Revoking…' : 'Revoke'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* API docs link */}
      <div className="mt-8 p-4 rounded-xl bg-zinc-800 border border-zinc-700 text-sm text-zinc-400">
        <p>
          <span className="text-zinc-200 font-medium">Base URL:</span>{' '}
          <code className="font-mono text-indigo-300">{supabaseUrl}/functions/v1/api</code>
        </p>
        <p className="mt-1">
          <span className="text-zinc-200 font-medium">Auth:</span>{' '}
          <code className="font-mono text-zinc-300">Authorization: Bearer &lt;key&gt;</code>
          {' '}or{' '}
          <code className="font-mono text-zinc-300">X-API-Key: &lt;key&gt;</code>
        </p>
        <p className="mt-1">
          View the full{' '}
          <a
            href="/api/openapi.yaml"
            target="_blank"
            rel="noreferrer"
            className="text-indigo-400 hover:underline"
          >
            OpenAPI spec
          </a>
          .
        </p>
      </div>
    </div>
  )
}
