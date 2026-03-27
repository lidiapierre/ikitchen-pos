import { describe, it, expect } from 'vitest'
import { filterMenuItems, filterMenuItemsWithFilters } from './menuSearch'
import type { MenuCategory, MenuItem } from './menuData'

function mkItem(partial: Omit<MenuItem, 'allergens' | 'dietary_badges' | 'spicy_level'>): MenuItem {
  return { ...partial, allergens: [], dietary_badges: [], spicy_level: 'none' }
}

const categories: MenuCategory[] = [
  {
    name: 'Burgers',
    items: [
      mkItem({ id: '1', name: 'Classic Burger', price_cents: 1000, available: true, modifiers: [] }),
      mkItem({ id: '2', name: 'Veggie Burger', price_cents: 900, available: true, modifiers: [] }),
      mkItem({ id: '3', name: 'Chicken Sandwich', price_cents: 1100, available: true, modifiers: [] }),
    ],
  },
  {
    name: 'Drinks',
    items: [
      mkItem({ id: '4', name: 'Cola', price_cents: 300, available: true, modifiers: [] }),
      mkItem({ id: '5', name: 'Lemonade', price_cents: 400, available: true, modifiers: [] }),
    ],
  },
  {
    name: 'Sides',
    items: [
      mkItem({ id: '6', name: 'French Fries', price_cents: 500, available: true, modifiers: [] }),
      mkItem({ id: '7', name: 'Onion Rings', price_cents: 550, available: true, modifiers: [] }),
    ],
  },
]

describe('filterMenuItems', () => {
  it('returns empty array when query is empty string', () => {
    expect(filterMenuItems(categories, '')).toEqual([])
  })

  it('returns empty array when query is only whitespace', () => {
    expect(filterMenuItems(categories, '   ')).toEqual([])
  })

  it('matches items by name (case-insensitive) and all items in matching category', () => {
    // "burger" matches both the category "Burgers" and individual item names,
    // so all 3 items in the Burgers category are returned
    const results = filterMenuItems(categories, 'burger')
    expect(results).toHaveLength(3)
    expect(results.map((r) => r.item.id)).toEqual(['1', '2', '3'])
  })

  it('matches only item name when category name does not match', () => {
    // "veggie" matches only the item name, not the category "Burgers"
    const results = filterMenuItems(categories, 'veggie')
    expect(results).toHaveLength(1)
    expect(results[0].item.id).toBe('2')
  })

  it('matches items by name with mixed case', () => {
    const results = filterMenuItems(categories, 'COLA')
    expect(results).toHaveLength(1)
    expect(results[0].item.id).toBe('4')
  })

  it('matches all items in a category when category name matches', () => {
    const results = filterMenuItems(categories, 'drinks')
    expect(results).toHaveLength(2)
    expect(results.map((r) => r.item.id)).toEqual(['4', '5'])
  })

  it('matches category name case-insensitively', () => {
    const results = filterMenuItems(categories, 'SIDES')
    expect(results).toHaveLength(2)
    expect(results.map((r) => r.item.id)).toEqual(['6', '7'])
  })

  it('returns empty array when no items or categories match', () => {
    const results = filterMenuItems(categories, 'pizza')
    expect(results).toEqual([])
  })

  it('returns correct categoryName for each result', () => {
    const results = filterMenuItems(categories, 'lemonade')
    expect(results).toHaveLength(1)
    expect(results[0].categoryName).toBe('Drinks')
  })

  it('handles partial name match', () => {
    const results = filterMenuItems(categories, 'lem')
    expect(results).toHaveLength(1)
    expect(results[0].item.name).toBe('Lemonade')
  })

  it('matches across multiple categories when item name matches in both', () => {
    const crossCategories: MenuCategory[] = [
      {
        name: 'Mains',
        items: [mkItem({ id: 'a', name: 'Spicy Chicken', price_cents: 1200, available: true, modifiers: [] })],
      },
      {
        name: 'Starters',
        items: [mkItem({ id: 'b', name: 'Chicken Wings', price_cents: 800, available: true, modifiers: [] })],
      },
    ]
    const results = filterMenuItems(crossCategories, 'chicken')
    expect(results).toHaveLength(2)
    expect(results.map((r) => r.item.id)).toEqual(['a', 'b'])
  })

  it('trims whitespace from query before matching', () => {
    const results = filterMenuItems(categories, '  fries  ')
    expect(results).toHaveLength(1)
    expect(results[0].item.name).toBe('French Fries')
  })

  it('returns empty array when categories list is empty', () => {
    expect(filterMenuItems([], 'burger')).toEqual([])
  })

  it('does not duplicate items when both category and item name match', () => {
    const overlapping: MenuCategory[] = [
      {
        name: 'Burger Specials',
        items: [mkItem({ id: 'x', name: 'Mega Burger', price_cents: 1500, available: true, modifiers: [] })],
      },
    ]
    const results = filterMenuItems(overlapping, 'burger')
    expect(results).toHaveLength(1)
    expect(results[0].item.id).toBe('x')
  })
})

describe('filterMenuItemsWithFilters — dietary filter', () => {
  const dietaryCategories: MenuCategory[] = [
    {
      name: 'Mains',
      items: [
        { ...mkItem({ id: '1', name: 'Chicken Biryani', price_cents: 1200, available: true, modifiers: [] }), dietary_badges: ['halal'] },
        { ...mkItem({ id: '2', name: 'Paneer Tikka', price_cents: 900, available: true, modifiers: [] }), dietary_badges: ['vegetarian', 'halal'] },
        { ...mkItem({ id: '3', name: 'Beef Burger', price_cents: 1000, available: true, modifiers: [] }), dietary_badges: [] },
      ],
    },
  ]

  it('filters by halal', () => {
    const results = filterMenuItemsWithFilters(dietaryCategories, { query: '', dietary: 'halal', allergenFree: '' })
    expect(results.map((r) => r.item.id)).toEqual(['1', '2'])
  })

  it('filters by vegetarian', () => {
    const results = filterMenuItemsWithFilters(dietaryCategories, { query: '', dietary: 'vegetarian', allergenFree: '' })
    expect(results.map((r) => r.item.id)).toEqual(['2'])
  })
})

describe('filterMenuItemsWithFilters — allergen-free filter', () => {
  const allergenCategories: MenuCategory[] = [
    {
      name: 'Starters',
      items: [
        { ...mkItem({ id: '1', name: 'Bruschetta', price_cents: 600, available: true, modifiers: [] }), allergens: ['gluten', 'dairy'] },
        { ...mkItem({ id: '2', name: 'Salad', price_cents: 500, available: true, modifiers: [] }), allergens: [] },
        { ...mkItem({ id: '3', name: 'Peanut Soup', price_cents: 700, available: true, modifiers: [] }), allergens: ['nuts'] },
      ],
    },
  ]

  it('excludes items containing the specified allergen', () => {
    const results = filterMenuItemsWithFilters(allergenCategories, { query: '', dietary: '', allergenFree: 'nuts' })
    expect(results.map((r) => r.item.id)).toEqual(['1', '2'])
  })

  it('excludes items with dairy allergen', () => {
    const results = filterMenuItemsWithFilters(allergenCategories, { query: '', dietary: '', allergenFree: 'dairy' })
    expect(results.map((r) => r.item.id)).toEqual(['2', '3'])
  })
})
