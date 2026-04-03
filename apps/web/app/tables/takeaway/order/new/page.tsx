import { Suspense } from 'react'
import type { JSX } from 'react'
import NewTakeawayOrderClient from './NewTakeawayOrderClient'

/**
 * Page wrapper — keeps this route statically renderable by wrapping the
 * client component (which calls useSearchParams) in a Suspense boundary.
 */
export default function Page(): JSX.Element {
  return (
    <Suspense>
      <NewTakeawayOrderClient />
    </Suspense>
  )
}
