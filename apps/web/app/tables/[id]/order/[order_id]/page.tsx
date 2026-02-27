import type { JSX } from 'react'
import Link from 'next/link'

interface PageProps {
  params: Promise<{ id: string; order_id: string }>
}

export default async function OrderDetailPage({ params }: PageProps): Promise<JSX.Element> {
  const { id, order_id } = await params

  return (
    <main className="min-h-screen bg-zinc-900 p-6">
      <Link
        href="/tables"
        className="inline-flex items-center gap-2 text-zinc-400 hover:text-white text-base mb-8 min-h-[48px] min-w-[48px]"
      >
        ← Back to tables
      </Link>
      <h1 className="text-2xl font-bold text-white mb-6">Order</h1>
      <dl className="space-y-3 text-base mb-8">
        <div className="flex gap-3">
          <dt className="text-zinc-500">Table</dt>
          <dd className="font-semibold text-white">{id}</dd>
        </div>
        <div className="flex gap-3">
          <dt className="text-zinc-500">Order ID</dt>
          <dd className="font-mono text-sm text-zinc-300">{order_id}</dd>
        </div>
      </dl>
      <section>
        <h2 className="text-lg font-semibold text-white mb-4">Items</h2>
        <p className="text-zinc-500 text-sm">No items yet — order items will appear here once the menu and cart are implemented.</p>
      </section>
    </main>
  )
}
