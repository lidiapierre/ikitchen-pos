import type { Metadata } from 'next'
import type { JSX } from 'react'

export const metadata: Metadata = {
  title: 'Kitchen Display — iKitchen',
}

/**
 * Standalone layout for /kitchen — no AppHeader, dark background,
 * optimised for wall-mounted tablets.
 */
export default function KitchenLayout({
  children,
}: {
  children: React.ReactNode
}): JSX.Element {
  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {children}
    </div>
  )
}
