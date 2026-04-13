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
import { getUserRole, isAdminRole, type UserRole } from '@/lib/user-role'

interface UserContextValue {
  role: UserRole | null
  isAdmin: boolean
  loading: boolean
  accessToken: string | null
}

const UserContext = createContext<UserContextValue>({
  role: null,
  isAdmin: false,
  loading: true,
  accessToken: null,
})

export function UserProvider({ children }: { children: ReactNode }): JSX.Element {
  const [role, setRole] = useState<UserRole | null>(null)
  const [loading, setLoading] = useState(true)
  const [accessToken, setAccessToken] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function fetchRoleAndToken(): Promise<void> {
      const [fetchedRole, { data: { session } }] = await Promise.all([
        getUserRole(supabase),
        supabase.auth.getSession(),
      ])
      if (!cancelled) {
        setRole(fetchedRole)
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
  }

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>
}

export function useUser(): UserContextValue {
  return useContext(UserContext)
}
