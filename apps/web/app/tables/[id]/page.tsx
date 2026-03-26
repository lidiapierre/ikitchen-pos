import { redirect } from 'next/navigation'

interface PageProps {
  params: Promise<{ id: string }>
}

// There is no standalone table detail page — tables only exist in the context of an order.
// Redirect to the tables list so users never land on a dead-end.
export default async function TableDetailPage({ params }: PageProps): Promise<never> {
  await params
  redirect('/tables')
}
