'use client'

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
  type JSX,
} from 'react'
import { supabase } from '@/lib/supabase'
import { getUserRoleAndId, isAdminRole, type UserRole } from '@/lib/user-role'

interface UserContextValue {
  role: UserRole | null
  isAdmin: boolean
  loading: boolean
  accessToken: string | null
  /** Authenticated user's UUID from auth.getUser(). Available when loading = false. */
  userId: string | null
}

const UserContext = createContext<UserContextValue>({
  role: null,
  isAdmin: false,
  loading: true,
  accessToken: null,
  userId: null,
})

export function UserProvider({ children }: { children: ReactNode }): JSX.Element {
  const [role, setRole] = useState<UserRole | null>(null)
  const [loading, setLoading] = useState(true)
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function fetchRoleAndToken(): Promise<void> {
      const [{ role: fetchedRole, userId: fetchedUserId }, { data: { session } }] =
        await Promise.all([
          getUserRoleAndId(supabase),
          supabase.auth.getSession(),
        ])
      if (!cancelled) {
        setRole(fetchedRole)
        setUserId(fetchedUserId)
        setAccessToken(session?.access_token ?? null)
        setLoading(false)
      }
    }

    void fetchRoleAndToken()

    // Re-fetch role and token when auth state changes (login/logout/token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setAccessToken(session?.access_token ?? null)
      setLoading(true)
      void fetchRoleAndToken()
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [])

  const value: UserContextValue = {
    role,
    isAdmin: isAdminRole(role),
    loading,
    accessToken,
    userId,
  }

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>
}

export function useUser(): UserContextValue {
  return useContext(UserContext)
}
