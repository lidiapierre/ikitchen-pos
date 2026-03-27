import type { JSX } from 'react'
import KitchenDisplay from './KitchenDisplay'

/**
 * /kitchen — Kitchen Display Screen (KDS)
 * No standard auth required — managed by PIN gate in KitchenDisplay component.
 */
export default function KitchenPage(): JSX.Element {
  return <KitchenDisplay />
}
