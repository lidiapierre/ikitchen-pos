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
}

const UserContext = createContext<UserContextValue>({
  role: null,
  isAdmin: false,
})

export function UserProvider({ children }: { children: ReactNode }): JSX.Element {
  const [role, setRole] = useState<UserRole | null>(null)

  useEffect(() => {
    let cancelled = false

    async function fetchRole(): Promise<void> {
      const fetchedRole = await getUserRole(supabase)
      if (!cancelled) {
        setRole(fetchedRole)
      }
    }

    void fetchRole()

    // Re-fetch role when auth state changes (login/logout)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      void fetchRole()
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [])

  const value: UserContextValue = {
    role,
    isAdmin: isAdminRole(role),
  }

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>
}

export function useUser(): UserContextValue {
  return useContext(UserContext)
}
