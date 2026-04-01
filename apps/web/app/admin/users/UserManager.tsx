'use client'

import { useState, useEffect, useRef } from 'react'
import type { JSX } from 'react'
import { fetchAdminUsers, fetchRestaurantId } from './userAdminData'
import type { AdminUser } from './userAdminData'
import { callCreateUser, callToggleUserActive } from './userAdminApi'
import { getUserRole } from '@/lib/user-role'
import type { UserRole } from '@/lib/user-role'
import { createBrowserClient } from '@supabase/ssr'
import { useUser } from '@/lib/user-context'

interface CreateFormValues {
  email: string
  name: string
  role: string
}

interface CreateFormErrors {
  email?: string
  role?: string
}

type FeedbackType = 'success' | 'error'

interface Feedback {
  type: FeedbackType
  message: string
}

const EMPTY_FORM: CreateFormValues = { email: '', name: '', role: '' }

const ROLE_OPTIONS = [
  { value: 'manager', label: 'Manager' },
  { value: 'server', label: 'Server' },
  { value: 'kitchen', label: 'Kitchen' },
]

function validateCreateForm(form: CreateFormValues, callerRole: UserRole | null): CreateFormErrors {
  const errors: CreateFormErrors = {}
  if (!form.email.trim() || !form.email.includes('@')) {
    errors.email = 'A valid email is required'
  }
  if (!form.role) {
    errors.role = 'Role is required'
  } else if (callerRole === 'manager' && form.role === 'manager') {
    errors.role = 'Managers cannot create manager accounts'
  }
  return errors
}

function availableRoles(callerRole: UserRole | null): typeof ROLE_OPTIONS {
  if (callerRole === 'owner') return ROLE_OPTIONS
  // manager can only create server / kitchen
  return ROLE_OPTIONS.filter((r) => r.value !== 'manager')
}

function roleBadgeClass(role: string): string {
  switch (role) {
    case 'owner':
      return 'bg-purple-900 text-purple-200'
    case 'manager':
      return 'bg-indigo-900 text-indigo-200'
    case 'server':
      return 'bg-blue-900 text-blue-200'
    case 'kitchen':
      return 'bg-amber-900 text-amber-200'
    default:
      return 'bg-zinc-700 text-zinc-200'
  }
}

export default function UserManager(): JSX.Element {
  const { accessToken } = useUser()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState<string | null>(null) // tracks which action is in-flight

  const supabaseConfig = useRef<{ url: string } | null>(null)
  const restaurantIdRef = useRef<string>('')
  const [callerRole, setCallerRole] = useState<UserRole | null>(null)

  const [showCreateForm, setShowCreateForm] = useState(false)
  const [createForm, setCreateForm] = useState<CreateFormValues>(EMPTY_FORM)
  const [createFormErrors, setCreateFormErrors] = useState<CreateFormErrors>({})

  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    if (!supabaseUrl || !supabaseKey) {
      setFetchError('API not configured')
      setLoading(false)
      return
    }
    // Wait for the user's JWT before fetching RLS-protected data
    if (!accessToken) return
    supabaseConfig.current = { url: supabaseUrl }

    // Identify caller's role for role-hierarchy enforcement in the UI
    const supabaseClient = createBrowserClient(supabaseUrl, supabaseKey)

    Promise.all([
      fetchRestaurantId(supabaseUrl, supabaseKey, accessToken),
      fetchAdminUsers(supabaseUrl, supabaseKey, accessToken),
      getUserRole(supabaseClient),
    ])
      .then(([restaurantId, data, role]) => {
        restaurantIdRef.current = restaurantId
        setUsers(data)
        setCallerRole(role)
      })
      .catch((err: unknown) => {
        setFetchError(err instanceof Error ? err.message : 'Failed to load users')
      })
      .finally(() => {
        setLoading(false)
      })
  }, [accessToken])

  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current)
    }
  }, [])

  function showFeedback(type: FeedbackType, message: string): void {
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current)
    setFeedback({ type, message })
    feedbackTimerRef.current = setTimeout(() => setFeedback(null), 4000)
  }

  async function handleCreateUser(): Promise<void> {
    const errors = validateCreateForm(createForm, callerRole)
    if (Object.keys(errors).length > 0) {
      setCreateFormErrors(errors)
      return
    }
    const config = supabaseConfig.current
    if (!config || !callerRole) return
    setSubmitting('create')
    try {
      const newUser = await callCreateUser(config.url, accessToken ?? '', {
        email: createForm.email.trim().toLowerCase(),
        name: createForm.name.trim() || undefined,
        role: createForm.role,
        restaurantId: restaurantIdRef.current,
        callerRole,
      })
      setUsers((prev) => [...prev, newUser])
      setCreateForm(EMPTY_FORM)
      setCreateFormErrors({})
      setShowCreateForm(false)
      showFeedback('success', `User "${newUser.email}" created. An invite email has been sent.`)
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : 'Failed to create user.')
    } finally {
      setSubmitting(null)
    }
  }

  async function handleToggleActive(user: AdminUser): Promise<void> {
    const config = supabaseConfig.current
    if (!config) return
    const newActive = !user.is_active
    setSubmitting(`toggle-${user.id}`)
    try {
      await callToggleUserActive(config.url, accessToken ?? '', user.id, newActive)
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, is_active: newActive } : u)),
      )
      showFeedback(
        'success',
        `${user.email} ${newActive ? 'reactivated' : 'deactivated'}.`,
      )
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : 'Failed to update user status.')
    } finally {
      setSubmitting(null)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-bold text-white">Staff Accounts</h1>
        <p className="text-zinc-400 text-base">Loading users…</p>
      </div>
    )
  }

  if (fetchError !== null) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-bold text-white">Staff Accounts</h1>
        <p className="text-red-400 text-base">Unable to load user data. Please try again.</p>
        <p className="text-red-300 text-sm font-mono">{fetchError}</p>
      </div>
    )
  }

  const roles = availableRoles(callerRole)

  return (
    <div className="flex flex-col gap-6">
      {/* Page header */}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-white">Staff Accounts</h1>
        <button
          onClick={() => {
            setShowCreateForm((v) => !v)
            setCreateForm(EMPTY_FORM)
            setCreateFormErrors({})
          }}
          disabled={submitting !== null}
          className="min-h-[48px] px-5 py-2 rounded-xl text-base font-medium bg-indigo-600 text-white hover:bg-indigo-500 transition-colors disabled:opacity-50"
        >
          + Add Staff
        </button>
      </div>

      {/* Feedback banner */}
      {feedback && (
        <div
          role="status"
          className={[
            'px-5 py-3 rounded-xl text-base font-medium',
            feedback.type === 'success' ? 'bg-green-800 text-green-100' : 'bg-red-800 text-red-100',
          ].join(' ')}
        >
          {feedback.message}
        </div>
      )}

      {/* Create user inline form */}
      {showCreateForm && (
        <div className="bg-zinc-800 border border-zinc-700 rounded-2xl p-5 flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-white">New Staff Account</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Email */}
            <div className="flex flex-col gap-1">
              <label htmlFor="create-email" className="text-sm font-medium text-zinc-300">
                Email <span className="text-red-400">*</span>
              </label>
              <input
                id="create-email"
                type="email"
                value={createForm.email}
                onChange={(e) => {
                  setCreateForm((f) => ({ ...f, email: e.target.value }))
                  setCreateFormErrors((err) => ({ ...err, email: undefined }))
                }}
                className="min-h-[48px] px-4 py-2 rounded-xl bg-zinc-900 text-white border border-zinc-600 focus:border-indigo-500 focus:outline-none text-base"
                placeholder="staff@restaurant.com"
              />
              {createFormErrors.email && (
                <span className="text-sm text-red-400">{createFormErrors.email}</span>
              )}
            </div>

            {/* Name (optional) */}
            <div className="flex flex-col gap-1">
              <label htmlFor="create-name" className="text-sm font-medium text-zinc-300">
                Name <span className="text-zinc-500 font-normal">(optional)</span>
              </label>
              <input
                id="create-name"
                type="text"
                value={createForm.name}
                onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                className="min-h-[48px] px-4 py-2 rounded-xl bg-zinc-900 text-white border border-zinc-600 focus:border-indigo-500 focus:outline-none text-base"
                placeholder="e.g. Ali Hassan"
              />
            </div>

            {/* Role */}
            <div className="flex flex-col gap-1">
              <label htmlFor="create-role" className="text-sm font-medium text-zinc-300">
                Role <span className="text-red-400">*</span>
              </label>
              <select
                id="create-role"
                value={createForm.role}
                onChange={(e) => {
                  setCreateForm((f) => ({ ...f, role: e.target.value }))
                  setCreateFormErrors((err) => ({ ...err, role: undefined }))
                }}
                className="min-h-[48px] px-4 py-2 rounded-xl bg-zinc-900 text-white border border-zinc-600 focus:border-indigo-500 focus:outline-none text-base"
              >
                <option value="">Select a role…</option>
                {roles.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
              {createFormErrors.role && (
                <span className="text-sm text-red-400">{createFormErrors.role}</span>
              )}
            </div>
          </div>

          <p className="text-sm text-zinc-400">
            The new user will receive an invite email with a link to set their password.
          </p>

          <div className="flex gap-3">
            <button
              onClick={() => { void handleCreateUser() }}
              disabled={submitting !== null}
              className="min-h-[48px] px-5 py-2 rounded-xl bg-indigo-600 text-white text-base font-medium hover:bg-indigo-500 transition-colors disabled:opacity-50"
            >
              {submitting === 'create' ? 'Creating…' : 'Create Account'}
            </button>
            <button
              onClick={() => {
                setShowCreateForm(false)
                setCreateForm(EMPTY_FORM)
                setCreateFormErrors({})
              }}
              disabled={submitting === 'create'}
              className="min-h-[48px] px-5 py-2 rounded-xl bg-zinc-700 text-white text-base font-medium hover:bg-zinc-600 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Users table */}
      {users.length === 0 ? (
        <p className="text-zinc-500 text-base">No staff accounts yet. Add a user to get started.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {/* Column header */}
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-4 px-5 py-2 text-sm font-medium text-zinc-400 uppercase tracking-wide">
            <span>User</span>
            <span className="w-24 text-center">Role</span>
            <span className="w-24 text-center">Status</span>
            <span className="w-32" />
          </div>

          {users.map((user) => {
            const isTogglingThisUser = submitting === `toggle-${user.id}`

            return (
              <div
                key={user.id}
                className={[
                  'bg-zinc-800 border rounded-2xl px-5 py-4 grid grid-cols-[1fr_auto_auto_auto] gap-4 items-center',
                  user.is_active ? 'border-zinc-700' : 'border-zinc-700 opacity-60',
                ].join(' ')}
              >
                {/* Name + email */}
                <div className="flex flex-col gap-0.5 min-w-0">
                  {user.name ? (
                    <>
                      <span className="text-base font-semibold text-white truncate">
                        {user.name}
                      </span>
                      <span className="text-sm text-zinc-400 truncate">{user.email}</span>
                    </>
                  ) : (
                    <span className="text-base font-semibold text-white truncate">{user.email}</span>
                  )}
                </div>

                {/* Role badge */}
                <span className="w-24 text-center">
                  <span
                    className={[
                      'inline-block px-2 py-1 rounded-lg text-sm font-medium capitalize',
                      roleBadgeClass(user.role),
                    ].join(' ')}
                  >
                    {user.role}
                  </span>
                </span>

                {/* Active / Inactive badge */}
                <span className="w-24 text-center">
                  {user.is_active ? (
                    <span className="inline-block px-2 py-1 rounded-lg text-sm font-medium bg-green-900 text-green-200">
                      Active
                    </span>
                  ) : (
                    <span className="inline-block px-2 py-1 rounded-lg text-sm font-medium bg-zinc-700 text-zinc-300">
                      Inactive
                    </span>
                  )}
                </span>

                {/* Toggle button */}
                <div className="w-32 flex justify-end">
                  {user.role !== 'owner' && (
                    <button
                      onClick={() => { void handleToggleActive(user) }}
                      disabled={submitting !== null}
                      aria-label={user.is_active ? `Deactivate ${user.email}` : `Reactivate ${user.email}`}
                      className={[
                        'min-h-[48px] px-4 py-2 rounded-xl text-base font-medium transition-colors disabled:opacity-50',
                        user.is_active
                          ? 'bg-red-900 text-red-200 hover:bg-red-800'
                          : 'bg-green-900 text-green-200 hover:bg-green-800',
                      ].join(' ')}
                    >
                      {isTogglingThisUser
                        ? '…'
                        : user.is_active
                        ? 'Deactivate'
                        : 'Reactivate'}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
