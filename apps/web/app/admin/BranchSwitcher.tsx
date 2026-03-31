'use client'

import { useState, useRef, useEffect } from 'react'
import type { JSX } from 'react'
import { Building2, ChevronDown } from 'lucide-react'
import { useActiveRestaurant } from '@/lib/useActiveRestaurant'

/**
 * BranchSwitcher — shown in the admin header when the user has access to
 * multiple restaurants. Selecting a branch updates localStorage and reloads.
 * Hidden when only one restaurant is accessible.
 */
export default function BranchSwitcher(): JSX.Element | null {
  const { restaurantId, restaurantName, restaurants, loading, switchRestaurant } = useActiveRestaurant()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent): void {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  // Don't render until loaded, or if only one (or zero) restaurants
  if (loading || restaurants.length <= 1) return null

  const current = restaurants.find(r => r.id === restaurantId)
  const displayName = current?.branch_name ?? current?.name ?? restaurantName ?? 'Select branch'

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-3 py-2 rounded-xl bg-indigo-800 hover:bg-indigo-700 border border-indigo-600 text-indigo-100 hover:text-white text-sm font-medium transition-colors min-h-[48px] min-w-[48px]"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Switch branch"
      >
        <Building2 size={16} className="shrink-0 text-indigo-300" aria-hidden="true" />
        <span className="max-w-[160px] truncate">{displayName}</span>
        <ChevronDown
          size={14}
          className={`shrink-0 text-indigo-300 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Select branch"
          className="absolute right-0 top-full mt-2 z-50 min-w-[200px] bg-indigo-900 border border-indigo-700 rounded-xl shadow-lg overflow-hidden"
        >
          <div className="px-3 py-2 border-b border-indigo-700">
            <span className="text-xs font-semibold uppercase tracking-widest text-indigo-400">
              Switch Branch
            </span>
          </div>
          <ul className="py-1">
            {restaurants.map(r => {
              const isActive = r.id === restaurantId
              const label = r.branch_name ?? r.name
              return (
                <li key={r.id} role="option" aria-selected={isActive}>
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false)
                      if (!isActive) switchRestaurant(r.id)
                    }}
                    className={[
                      'w-full text-left flex items-center gap-2 px-4 py-3 text-sm transition-colors',
                      isActive
                        ? 'bg-indigo-700 text-white font-semibold'
                        : 'text-indigo-100 hover:bg-indigo-800 hover:text-white',
                    ].join(' ')}
                  >
                    <Building2 size={14} className="shrink-0 opacity-60" aria-hidden="true" />
                    <span className="truncate">{label}</span>
                    {isActive && (
                      <span className="ml-auto text-xs text-indigo-300 font-normal">Active</span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
