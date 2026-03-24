'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import type { JSX } from 'react'
import { supabase } from '@/lib/supabase'
import { useUser } from '@/lib/user-context'

export default function AppHeader(): JSX.Element | null {
  const pathname = usePathname()
  const router = useRouter()
  const { isAdmin } = useUser()

  if (pathname === '/login') {
    return null
  }

  async function handleLogout(): Promise<void> {
    const { error } = await supabase.auth.signOut()
    if (error !== null) {
      console.error('Sign-out error:', error.message)
    }
    router.refresh()
    router.push('/login')
  }

  return (
    <header className="bg-zinc-900 border-b border-zinc-800 px-6 py-3 flex items-center justify-between min-h-[56px]">
      <span className="text-white text-lg font-semibold tracking-tight">
        Lahore by iKitchen
      </span>
      <div className="flex items-center gap-3">
        {isAdmin && (
          <Link
            href="/admin"
            className="min-h-[48px] px-5 py-2 text-base font-medium text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded-xl border border-zinc-700 hover:border-zinc-500 transition-colors inline-flex items-center"
          >
            Admin
          </Link>
        )}
        <button
          type="button"
          onClick={() => { void handleLogout() }}
          className="min-h-[48px] px-5 py-2 text-base font-medium text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded-xl border border-zinc-700 hover:border-zinc-500 transition-colors"
        >
          Logout
        </button>
      </div>
    </header>
  )
}
