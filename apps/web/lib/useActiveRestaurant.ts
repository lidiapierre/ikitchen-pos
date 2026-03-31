'use client'

/**
 * useActiveRestaurant — hook for multi-branch restaurant context.
 *
 * Priority:
 *  1. localStorage.activeRestaurantId  (set by branch switcher)
 *  2. user's primary restaurant_id from the users table
 *
 * Also returns the list of restaurants the current user can access via
 * the user_restaurants junction table, and a switchRestaurant() helper.
 */

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

const LS_KEY = 'activeRestaurantId'

export interface RestaurantOption {
  id: string
  name: string
  branch_name: string | null
  parent_restaurant_id: string | null
}

export interface ActiveRestaurantContext {
  restaurantId: string | null
  restaurantName: string | null
  restaurants: RestaurantOption[]
  loading: boolean
  switchRestaurant: (id: string) => void
}

export function useActiveRestaurant(): ActiveRestaurantContext {
  const [restaurantId, setRestaurantId] = useState<string | null>(null)
  const [restaurantName, setRestaurantName] = useState<string | null>(null)
  const [restaurants, setRestaurants] = useState<RestaurantOption[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load(): Promise<void> {
      // 1. Fetch the current auth user
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || cancelled) return

      // 2. Fetch user row for primary restaurant_id
      const { data: userRow } = await supabase
        .from('users')
        .select('restaurant_id, is_super_admin')
        .eq('id', user.id)
        .single()

      if (cancelled) return

      const primaryRestaurantId = (userRow as { restaurant_id: string | null } | null)?.restaurant_id ?? null
      const isSuperAdmin = (userRow as { is_super_admin: boolean } | null)?.is_super_admin ?? false

      let accessible: RestaurantOption[] = []

      if (isSuperAdmin) {
        // Super-admins see all restaurants
        const { data } = await supabase
          .from('restaurants')
          .select('id, name, branch_name, parent_restaurant_id')
          .order('name')
        accessible = (data as RestaurantOption[] | null) ?? []
      } else {
        // Regular users: check user_restaurants for multi-branch access
        const { data: links } = await supabase
          .from('user_restaurants')
          .select('restaurant_id, restaurants(id, name, branch_name, parent_restaurant_id)')
          .eq('user_id', user.id)

        if (links && links.length > 0) {
          accessible = links
            .map((l: { restaurants: RestaurantOption | RestaurantOption[] | null }) =>
              Array.isArray(l.restaurants) ? l.restaurants[0] : l.restaurants
            )
            .filter((r): r is RestaurantOption => r !== null && r !== undefined)
        }

        // Also include the primary restaurant if not already in the list
        if (primaryRestaurantId && !accessible.find(r => r.id === primaryRestaurantId)) {
          const { data: primaryRestaurant } = await supabase
            .from('restaurants')
            .select('id, name, branch_name, parent_restaurant_id')
            .eq('id', primaryRestaurantId)
            .single()
          if (primaryRestaurant) {
            accessible = [primaryRestaurant as RestaurantOption, ...accessible]
          }
        }
      }

      if (cancelled) return

      setRestaurants(accessible)

      // 3. Determine active restaurant: localStorage → primary → first accessible
      let activeId: string | null = null
      if (typeof window !== 'undefined') {
        activeId = window.localStorage.getItem(LS_KEY)
      }

      // Validate that the stored ID is actually accessible
      if (activeId && !accessible.find(r => r.id === activeId)) {
        activeId = null
        if (typeof window !== 'undefined') {
          window.localStorage.removeItem(LS_KEY)
        }
      }

      activeId = activeId ?? primaryRestaurantId ?? accessible[0]?.id ?? null

      // Persist to localStorage
      if (activeId && typeof window !== 'undefined') {
        window.localStorage.setItem(LS_KEY, activeId)
      }

      setRestaurantId(activeId)
      const activeRestaurant = accessible.find(r => r.id === activeId)
      if (activeRestaurant) {
        setRestaurantName(activeRestaurant.branch_name ?? activeRestaurant.name)
      } else if (primaryRestaurantId) {
        // Fallback: fetch primary restaurant name
        const { data: primary } = await supabase
          .from('restaurants')
          .select('name, branch_name')
          .eq('id', primaryRestaurantId)
          .single()
        if (primary && !cancelled) {
          const r = primary as { name: string; branch_name: string | null }
          setRestaurantName(r.branch_name ?? r.name)
        }
      }

      if (!cancelled) setLoading(false)
    }

    void load()
    return () => { cancelled = true }
  }, [])

  const switchRestaurant = useCallback((id: string): void => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(LS_KEY, id)
      window.location.reload()
    }
  }, [])

  return { restaurantId, restaurantName, restaurants, loading, switchRestaurant }
}
