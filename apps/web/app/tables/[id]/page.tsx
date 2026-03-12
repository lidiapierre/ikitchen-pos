import type { JSX } from 'react'
import TableDetailClient from './TableDetailClient'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function TableDetailPage({ params }: PageProps): Promise<JSX.Element> {
  const { id } = await params
  return <TableDetailClient tableId={id} />
}
