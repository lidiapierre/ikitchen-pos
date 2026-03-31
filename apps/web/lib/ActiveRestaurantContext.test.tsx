import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { JSX } from 'react'
import { ActiveRestaurantProvider, useActiveRestaurantContext } from './ActiveRestaurantContext'

// Mock useActiveRestaurant
vi.mock('./useActiveRestaurant', () => ({
  useActiveRestaurant: () => ({
    restaurantId: 'rest-001',
    restaurantName: 'Test Branch',
    restaurants: [],
    loading: false,
    switchRestaurant: vi.fn(),
  }),
}))

function TestConsumer(): JSX.Element {
  const { restaurantId, restaurantName } = useActiveRestaurantContext()
  return <div data-testid="result">{restaurantId}:{restaurantName}</div>
}

describe('ActiveRestaurantContext', () => {
  it('provides value to consumers', () => {
    render(
      <ActiveRestaurantProvider>
        <TestConsumer />
      </ActiveRestaurantProvider>,
    )
    expect(screen.getByTestId('result').textContent).toBe('rest-001:Test Branch')
  })

  it('throws when used outside provider', () => {
    // Suppress React error output
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<TestConsumer />)).toThrow(
      'useActiveRestaurantContext must be used inside ActiveRestaurantProvider',
    )
    spy.mockRestore()
  })
})
