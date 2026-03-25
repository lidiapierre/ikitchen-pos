import { describe, it, expect } from 'vitest'
import { filterMenuItems } from './menuSearch'
import type { MenuCategory } from './menuData'

const categories: MenuCategory[] = [
  {
    name: 'Burgers',
    items: [
      { id: '1', name: 'Classic Burger', price_cents: 1000, modifiers: [] },
      { id: '2', name: 'Veggie Burger', price_cents: 900, modifiers: [] },
      { id: '3', name: 'Chicken Sandwich', price_cents: 1100, modifiers: [] },
    ],
  },
  {
    name: 'Drinks',
    items: [
      { id: '4', name: 'Cola', price_cents: 300, modifiers: [] },
      { id: '5', name: 'Lemonade', price_cents: 400, modifiers: [] },
    ],
  },
  {
    name: 'Sides',
    items: [
      { id: '6', name: 'French Fries', price_cents: 500, modifiers: [] },
      { id: '7', name: 'Onion Rings', price_cents: 550, modifiers: [] },
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
        items: [{ id: 'a', name: 'Spicy Chicken', price_cents: 1200, modifiers: [] }],
      },
      {
        name: 'Starters',
        items: [{ id: 'b', name: 'Chicken Wings', price_cents: 800, modifiers: [] }],
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
        items: [{ id: 'x', name: 'Mega Burger', price_cents: 1500, modifiers: [] }],
      },
    ]
    const results = filterMenuItems(overlapping, 'burger')
    expect(results).toHaveLength(1)
    expect(results[0].item.id).toBe('x')
  })
})
