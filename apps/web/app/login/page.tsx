'use client'

import { useState, type FormEvent, type JSX } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function LoginPage(): JSX.Element {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (signInError !== null) {
      setError('Invalid email or password. Please try again.')
      setLoading(false)
      return
    }

    router.refresh()
    router.push('/tables')
  }

  return (
    <main className="min-h-screen bg-zinc-950 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="mb-10 text-center">
          <h1 className="text-3xl font-bold text-white tracking-tight">
            Lahore by iKitchen
          </h1>
          <p className="text-zinc-400 text-base mt-2">Staff portal — sign in to continue</p>
        </div>

        <form
          onSubmit={(e) => { void handleSubmit(e) }}
          className="bg-zinc-900 rounded-2xl p-8 space-y-6 shadow-xl"
        >
          <div className="space-y-2">
            <label
              htmlFor="email"
              className="block text-sm font-medium text-zinc-300"
            >
              Email address
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => { setEmail(e.target.value) }}
              className="w-full min-h-[48px] px-4 py-3 text-base bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="you@example.com"
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="password"
              className="block text-sm font-medium text-zinc-300"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => { setPassword(e.target.value) }}
              className="w-full min-h-[48px] px-4 py-3 text-base bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="••••••••"
            />
          </div>

          {error !== null && (
            <p role="alert" className="text-red-400 text-base bg-red-950/40 rounded-xl px-4 py-3">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full min-h-[48px] bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 disabled:cursor-not-allowed text-white text-lg font-semibold rounded-xl transition-colors"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </main>
  )
}
