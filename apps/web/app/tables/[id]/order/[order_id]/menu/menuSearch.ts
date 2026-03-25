import type { MenuCategory, MenuItem } from './menuData'

export interface SearchResult {
  item: MenuItem
  categoryName: string
}

export function filterMenuItems(
  categories: MenuCategory[],
  query: string,
): SearchResult[] {
  const q = query.trim().toLowerCase()
  if (!q) return []

  const results: SearchResult[] = []
  for (const category of categories) {
    const categoryMatches = category.name.toLowerCase().includes(q)
    for (const item of category.items) {
      if (categoryMatches || item.name.toLowerCase().includes(q)) {
        results.push({ item, categoryName: category.name })
      }
    }
  }
  return results
}
