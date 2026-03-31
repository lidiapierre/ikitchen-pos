'use client'

import type { JSX } from 'react'
import { Building2 } from 'lucide-react'
import { useActiveRestaurant } from '@/lib/useActiveRestaurant'

/**
 * BranchLabel — shows the current active branch name in the admin header.
 * Rendered below the "iKitchen" title if a branch name is available.
 */
export default function BranchLabel(): JSX.Element | null {
  const { restaurantName, loading } = useActiveRestaurant()

  if (loading || !restaurantName) return null

  return (
    <span className="flex items-center gap-1 text-xs text-indigo-300 font-medium mt-0.5">
      <Building2 size={11} className="shrink-0 opacity-70" aria-hidden="true" />
      {restaurantName}
    </span>
  )
}
