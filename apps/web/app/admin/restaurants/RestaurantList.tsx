'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import type { JSX } from 'react'
import { fetchAdminRestaurants, fetchIsSuperAdmin } from './restaurantAdminData'
import type { AdminRestaurant } from './restaurantAdminData'
import { useUser } from '@/lib/user-context'

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

export default function RestaurantList(): JSX.Element {
  const { accessToken } = useUser()
  const [restaurants, setRestaurants] = useState<AdminRestaurant[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)

  useEffect(() => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    if (!supabaseUrl || !supabaseKey) {
      setFetchError('API not configured')
      setLoading(false)
      return
    }
    if (!accessToken) {
      // Wait for the token to hydrate before fetching
      return
    }

    Promise.all([
      fetchAdminRestaurants(supabaseUrl, supabaseKey),
      fetchIsSuperAdmin(supabaseUrl, supabaseKey, accessToken),
    ])
      .then(([data, superAdmin]) => {
        setRestaurants(data)
        setIsSuperAdmin(superAdmin)
      })
      .catch((err: unknown) => {
        setFetchError(err instanceof Error ? err.message : 'Failed to load restaurants')
      })
      .finally(() => setLoading(false))
  }, [accessToken])

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-bold text-white">Restaurants</h1>
        <p className="text-zinc-400 text-base">Loading…</p>
      </div>
    )
  }

  if (!isSuperAdmin) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-bold text-white">Restaurants</h1>
        <div className="bg-red-900/40 border border-red-700 rounded-2xl p-6">
          <p className="text-red-200 text-base font-medium">Access Denied</p>
          <p className="text-red-300 text-sm mt-1">
            Only iKitchen super-admins can manage restaurants.
          </p>
        </div>
      </div>
    )
  }

  if (fetchError !== null) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-bold text-white">Restaurants</h1>
        <p className="text-red-400 text-base">Unable to load restaurants. Please try again.</p>
        <p className="text-red-300 text-sm font-mono">{fetchError}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Page header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Restaurants</h1>
          <p className="text-sm text-zinc-400 mt-1">All provisioned restaurants on iKitchen</p>
        </div>
        <Link
          href="/admin/restaurants/new"
          className="min-h-[48px] px-5 py-2 rounded-xl text-base font-medium bg-indigo-600 text-white hover:bg-indigo-500 transition-colors flex items-center"
        >
          + New Restaurant
        </Link>
      </div>

      {/* Super-admin badge */}
      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-purple-900/50 border border-purple-700 w-fit">
        <span className="text-xs font-bold uppercase tracking-wider text-purple-300">
          ⚡ Super Admin
        </span>
      </div>

      {/* List */}
      {restaurants.length === 0 ? (
        <p className="text-zinc-500 text-base">
          No restaurants provisioned yet.{' '}
          <Link href="/admin/restaurants/new" className="text-indigo-400 hover:underline">
            Provision the first one →
          </Link>
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {/* Column headers */}
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-4 px-5 py-2 text-sm font-medium text-zinc-400 uppercase tracking-wide">
            <span>Restaurant</span>
            <span className="w-48 text-left">Owner</span>
            <span className="w-28 text-left">Timezone</span>
            <span className="w-28 text-right">Created</span>
          </div>

          {restaurants.map((r) => (
            <div
              key={r.id}
              className="bg-zinc-800 border border-zinc-700 rounded-2xl px-5 py-4 grid grid-cols-[1fr_auto_auto_auto] gap-4 items-center"
            >
              {/* Name + slug */}
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-base font-semibold text-white truncate">{r.name}</span>
                {r.slug && (
                  <span className="text-sm text-zinc-400 font-mono truncate">/{r.slug}</span>
                )}
              </div>

              {/* Owner email */}
              <div className="w-48 min-w-0">
                {r.owner_email ? (
                  <span className="text-sm text-zinc-300 truncate block">{r.owner_email}</span>
                ) : (
                  <span className="text-sm text-zinc-600 italic">No owner</span>
                )}
              </div>

              {/* Timezone */}
              <div className="w-28">
                <span className="text-xs text-zinc-400 font-mono">{r.timezone}</span>
              </div>

              {/* Created date */}
              <div className="w-28 text-right">
                <span className="text-sm text-zinc-400">{formatDate(r.created_at)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
