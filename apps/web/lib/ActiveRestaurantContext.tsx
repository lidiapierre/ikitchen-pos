'use client'

import { createContext, useContext, type ReactNode } from 'react'
import type { JSX } from 'react'
import { useActiveRestaurant, type ActiveRestaurantContext as ActiveRestaurantState } from './useActiveRestaurant'

const ActiveRestaurantContext = createContext<ActiveRestaurantState | null>(null)

export function ActiveRestaurantProvider({ children }: { children: ReactNode }): JSX.Element {
  const value = useActiveRestaurant()
  return (
    <ActiveRestaurantContext.Provider value={value}>
      {children}
    </ActiveRestaurantContext.Provider>
  )
}

export function useActiveRestaurantContext(): ActiveRestaurantState {
  const ctx = useContext(ActiveRestaurantContext)
  if (!ctx) {
    throw new Error('useActiveRestaurantContext must be used inside ActiveRestaurantProvider')
  }
  return ctx
}
