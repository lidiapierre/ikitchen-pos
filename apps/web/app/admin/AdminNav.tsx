'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { JSX } from 'react'
import {
  LayoutDashboard,
  Map,
  UtensilsCrossed,
  DollarSign,
  Users,
  Package,
  BarChart2,
  Printer,
  Monitor,
  KeyRound,
  Store,
  Settings,
  Heart,
  CalendarDays,
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
      { href: '/admin/floor-plan', label: 'Floor Plan', icon: Map },
      { href: '/admin/pricing', label: 'Pricing', icon: DollarSign },
      { href: '/admin/users', label: 'Users', icon: Users },
      { href: '/admin/inventory', label: 'Inventory', icon: Package },
      { href: '/admin/reports', label: 'Reports', icon: BarChart2 },
      { href: '/admin/customers', label: 'Customers', icon: Heart },
      { href: '/admin/reservations', label: 'Reservations', icon: CalendarDays },
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
              <Settings size={14} className="text-brand-grey opacity-70" aria-hidden="true" />
              <span className="text-xs font-semibold uppercase tracking-widest text-brand-grey opacity-70">
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
                    ? 'bg-brand-gold text-brand-navy border-l-4 border-brand-gold'
                    : 'text-white/80 hover:bg-brand-blue hover:text-white',
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
