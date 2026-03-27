'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { JSX } from 'react'
import {
  LayoutDashboard,
  UtensilsCrossed,
  LayoutGrid,
  DollarSign,
  Users,
  Package,
  BarChart2,
  Printer,
  Monitor,
  KeyRound,
  Store,
  Settings,
  type LucideIcon,
} from 'lucide-react'

interface NavLink {
  href: string
  label: string
  icon: LucideIcon
}

interface NavSection {
  title?: string
  links: NavLink[]
}

const NAV_SECTIONS: NavSection[] = [
  {
    links: [
      { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/admin/menu', label: 'Menu', icon: UtensilsCrossed },
      { href: '/admin/tables', label: 'Tables', icon: LayoutGrid },
      { href: '/admin/pricing', label: 'Pricing', icon: DollarSign },
      { href: '/admin/users', label: 'Users', icon: Users },
      { href: '/admin/inventory', label: 'Inventory', icon: Package },
      { href: '/admin/reports', label: 'Reports', icon: BarChart2 },
      { href: '/admin/api-keys', label: 'API Keys', icon: KeyRound },
    ],
  },
  {
    title: 'Settings',
    links: [
      { href: '/admin/settings/restaurant', label: 'Restaurant', icon: Store },
      { href: '/admin/settings/printer', label: 'Printer', icon: Printer },
      { href: '/admin/settings/kds', label: 'KDS', icon: Monitor },
    ],
  },
]

export default function AdminNav(): JSX.Element {
  const pathname = usePathname()

  return (
    <nav className="flex flex-col gap-4 p-4">
      {NAV_SECTIONS.map((section, si) => (
        <div key={si} className="flex flex-col gap-1">
          {section.title && (
            <div className="flex items-center gap-2 px-4 pt-2 pb-1">
              <Settings size={14} className="text-indigo-300 opacity-70" aria-hidden="true" />
              <span className="text-xs font-semibold uppercase tracking-widest text-indigo-300 opacity-70">
                {section.title}
              </span>
            </div>
          )}
          {section.links.map(({ href, label, icon: Icon }) => {
            const isActive = pathname === href
            return (
              <Link
                key={href}
                href={href}
                className={[
                  'flex items-center gap-3 px-4 py-3 rounded-xl text-lg font-medium transition-colors min-h-[48px]',
                  isActive
                    ? 'bg-indigo-600 text-white'
                    : 'text-indigo-100 hover:bg-indigo-700 hover:text-white',
                ].join(' ')}
              >
                <Icon size={20} aria-hidden="true" />
                {label}
              </Link>
            )
          })}
        </div>
      ))}
    </nav>
  )
}
