import Link from 'next/link'
import type { JSX } from 'react'
import AdminNav from './AdminNav'
import BranchSwitcher from './BranchSwitcher'
import BranchLabel from './BranchLabel'
import { ActiveRestaurantProvider } from '@/lib/ActiveRestaurantContext'

export default function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>): JSX.Element {
  return (
    <ActiveRestaurantProvider>
    <div className="min-h-screen flex flex-col bg-brand-offwhite">
      {/* Admin header — brand navy */}
      <header className="bg-brand-navy border-b border-brand-blue px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold uppercase tracking-widest text-brand-gold bg-brand-blue px-2 py-1 rounded">
            Admin
          </span>
          <div className="flex flex-col">
            <span className="text-xl font-bold text-white font-heading">iKitchen</span>
            <BranchLabel />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <BranchSwitcher />
          <Link
            href="/tables"
            className="flex items-center min-h-[48px] px-4 py-2 rounded-xl text-base font-medium text-white/80 hover:text-white hover:bg-brand-blue transition-colors"
          >
            ← Back to POS
          </Link>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar — brand navy */}
        <aside className="w-56 bg-brand-navy shrink-0 flex flex-col">
          <AdminNav />
        </aside>

        {/* Main content — off-white background */}
        <main className="flex-1 overflow-auto p-6">
          {children}
        </main>
      </div>
    </div>
    </ActiveRestaurantProvider>
  )
}
