import type { JSX } from 'react'
import OrderDetailClient from './OrderDetailClient'

interface PageProps {
  params: Promise<{ id: string; order_id: string }>
}

export default async function OrderDetailPage({ params }: PageProps): Promise<JSX.Element> {
  const { id, order_id } = await params
  return <OrderDetailClient tableId={id} orderId={order_id} />
}
