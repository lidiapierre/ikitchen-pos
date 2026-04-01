import type { JSX } from 'react'
import ProvisionRestaurantForm from '@/app/admin/restaurants/new/ProvisionRestaurantForm'

export default function RegisterPage(): JSX.Element {
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-white mb-2">Set up your restaurant</h1>
          <p className="text-zinc-400">iKitchen POS — Super-admin provisioning</p>
        </div>
        <ProvisionRestaurantForm variant="public" />
      </div>
    </div>
  )
}
