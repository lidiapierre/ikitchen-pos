'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { JSX } from 'react'

interface NavLink {
  href: string
  label: string
}

const NAV_LINKS: NavLink[] = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/menu', label: 'Menu' },
  { href: '/admin/tables', label: 'Tables' },
  { href: '/admin/pricing', label: 'Pricing' },
  { href: '/admin/users', label: 'Users' },
]

export default function AdminNav(): JSX.Element {
  const pathname = usePathname()

  return (
    <nav className="flex flex-col gap-1 p-4">
      {NAV_LINKS.map(({ href, label }) => {
        const isActive = pathname === href
        return (
          <Link
            key={href}
            href={href}
            className={[
              'flex items-center px-4 py-3 rounded-xl text-lg font-medium transition-colors min-h-[48px]',
              isActive
                ? 'bg-indigo-600 text-white'
                : 'text-indigo-100 hover:bg-indigo-700 hover:text-white',
            ].join(' ')}
          >
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
