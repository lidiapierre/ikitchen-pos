import type { MenuCategory, MenuItem } from './menuData'

export interface SearchResult {
  item: MenuItem
  categoryName: string
}

export interface MenuFilters {
  /** Text search query */
  query: string
  /** Only show items with this dietary badge (e.g. 'halal', 'vegetarian', 'vegan') — empty means no filter */
  dietary: string
  /** Only show items that do NOT contain this allergen (e.g. 'nuts', 'dairy') — empty means no filter */
  allergenFree: string
}

export const EMPTY_FILTERS: MenuFilters = { query: '', dietary: '', allergenFree: '' }

export function filterMenuItems(
  categories: MenuCategory[],
  query: string,
): SearchResult[] {
  return filterMenuItemsWithFilters(categories, { query, dietary: '', allergenFree: '' })
}

export function filterMenuItemsWithFilters(
  categories: MenuCategory[],
  filters: MenuFilters,
): SearchResult[] {
  const q = filters.query.trim().toLowerCase()
  const dietary = filters.dietary.trim().toLowerCase()
  const allergenFree = filters.allergenFree.trim().toLowerCase()

  // If all filters are empty, return nothing (caller shows full menu)
  if (!q && !dietary && !allergenFree) return []

  const results: SearchResult[] = []

  for (const category of categories) {
    const categoryMatchesQuery = q ? category.name.toLowerCase().includes(q) : true

    for (const item of category.items) {
      // Text match
      const textMatch = !q || categoryMatchesQuery || item.name.toLowerCase().includes(q)
      if (!textMatch) continue

      // Dietary badge filter
      if (dietary) {
        const hasBadge = item.dietary_badges.some((b) => b.toLowerCase() === dietary)
        if (!hasBadge) continue
      }

      // Allergen-free filter: exclude items that contain the allergen
      if (allergenFree) {
        const hasAllergen = item.allergens.some((a) => a.toLowerCase() === allergenFree)
        if (hasAllergen) continue
      }

      results.push({ item, categoryName: category.name })
    }
  }

  return results
}

/** Return true when any non-empty filter is active */
export function hasActiveFilters(filters: MenuFilters): boolean {
  return filters.query.trim() !== '' || filters.dietary !== '' || filters.allergenFree !== ''
}
