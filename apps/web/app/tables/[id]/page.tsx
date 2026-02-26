import type { JSX } from 'react'
import Link from 'next/link'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function TableDetailPage({ params }: PageProps): Promise<JSX.Element> {
  const { id } = await params

  return (
    <main className="min-h-screen bg-zinc-900 p-6">
      <Link
        href="/tables"
        className="inline-block text-zinc-400 hover:text-white text-base mb-8 min-h-[48px] min-w-[48px] flex items-center gap-2"
      >
        ← Back to Tables
      </Link>
      <h1 className="text-2xl font-bold text-white">Table {id}</h1>
      <p className="text-zinc-400 mt-4 text-base">Table detail — coming soon.</p>
    </main>
  )
}
