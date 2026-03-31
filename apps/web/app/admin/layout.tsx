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
    <div className="min-h-screen flex flex-col bg-zinc-900">
      {/* Admin header — indigo to distinguish from POS area */}
      <header className="bg-indigo-900 border-b border-indigo-700 px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold uppercase tracking-widest text-indigo-300 bg-indigo-800 px-2 py-1 rounded">
            Admin
          </span>
          <div className="flex flex-col">
            <span className="text-xl font-bold text-white">iKitchen</span>
            <BranchLabel />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <BranchSwitcher />
          <Link
            href="/tables"
            className="flex items-center min-h-[48px] px-4 py-2 rounded-xl text-base font-medium text-indigo-200 hover:text-white hover:bg-indigo-700 transition-colors"
          >
            ← Back to POS
          </Link>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-56 bg-indigo-800 shrink-0 flex flex-col">
          <AdminNav />
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-auto p-6">
          {children}
        </main>
      </div>
    </div>
    </ActiveRestaurantProvider>
  )
}
