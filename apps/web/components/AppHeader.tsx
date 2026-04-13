'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import type { JSX } from 'react'
import { Receipt } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useUser } from '@/lib/user-context'

export default function AppHeader(): JSX.Element | null {
  const pathname = usePathname()
  const router = useRouter()
  const { isAdmin, loading } = useUser()

  if (pathname === '/login') {
    return null
  }

  async function handleLogout(): Promise<void> {
    const { error } = await supabase.auth.signOut()
    if (error !== null) {
      console.warn('Sign-out error:', error.message)
    }
    router.refresh()
    router.push('/login')
  }

  const isReceipts = pathname === '/receipts'

  return (
    <header className="bg-brand-navy border-b border-brand-blue px-6 py-3 flex items-center justify-between min-h-[56px]">
      {/* White logo text on dark navy background */}
      <span className="text-white text-lg font-semibold tracking-tight font-heading">
        Lahore by iKitchen
      </span>
      <div className="flex items-center gap-3">
        {/* Receipts link — visible to all authenticated users (staff + admin) */}
        {!loading && (
          <Link
            href="/receipts"
            className={[
              'min-h-[48px] px-4 py-2 text-sm font-medium rounded-xl border transition-colors inline-flex items-center gap-2',
              isReceipts
                ? 'bg-brand-gold text-brand-navy border-brand-gold'
                : 'text-white/80 hover:text-white bg-brand-blue hover:bg-brand-blue/80 border-brand-blue hover:border-brand-gold',
            ].join(' ')}
          >
            <Receipt size={16} aria-hidden="true" />
            Receipts
          </Link>
        )}
        {!loading && isAdmin && (
          <Link
            href="/admin"
            className="min-h-[48px] px-5 py-2 text-base font-medium text-white/80 hover:text-white bg-brand-blue hover:bg-brand-blue/80 rounded-xl border border-brand-blue hover:border-brand-gold transition-colors inline-flex items-center"
          >
            Admin
          </Link>
        )}
        <button
          type="button"
          onClick={() => { void handleLogout() }}
          className="min-h-[48px] px-5 py-2 text-base font-medium text-white/80 hover:text-white bg-brand-blue hover:bg-brand-blue/80 rounded-xl border border-brand-blue hover:border-brand-gold transition-colors"
        >
          Logout
        </button>
      </div>
    </header>
  )
}
