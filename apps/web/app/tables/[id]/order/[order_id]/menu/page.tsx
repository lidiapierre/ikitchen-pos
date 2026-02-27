import type { JSX } from 'react'
import MenuPageClient from './MenuPageClient'

interface PageProps {
  params: Promise<{ id: string; order_id: string }>
}

export default async function MenuPage({ params }: PageProps): Promise<JSX.Element> {
  const { id, order_id } = await params
  return <MenuPageClient tableId={id} orderId={order_id} />
}
