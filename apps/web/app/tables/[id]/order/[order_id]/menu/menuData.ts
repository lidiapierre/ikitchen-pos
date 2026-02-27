export interface MenuItem {
  id: string
  name: string
  price_cents: number
}

export interface MenuCategory {
  name: string
  items: MenuItem[]
}

export const MENU_CATEGORIES: MenuCategory[] = [
  {
    name: 'Starters',
    items: [
      { id: '00000000-0000-0000-0000-000000000301', name: 'Bruschetta', price_cents: 850 },
      { id: '00000000-0000-0000-0000-000000000302', name: 'Caesar Salad', price_cents: 1050 },
      { id: '00000000-0000-0000-0000-000000000303', name: 'Soup of the Day', price_cents: 750 },
    ],
  },
  {
    name: 'Mains',
    items: [
      { id: '00000000-0000-0000-0000-000000000304', name: 'Grilled Salmon', price_cents: 1850 },
      { id: '00000000-0000-0000-0000-000000000305', name: 'Ribeye Steak', price_cents: 2650 },
      { id: '00000000-0000-0000-0000-000000000306', name: 'Mushroom Risotto', price_cents: 1450 },
    ],
  },
  {
    name: 'Drinks',
    items: [
      { id: '00000000-0000-0000-0000-000000000307', name: 'House Wine', price_cents: 950 },
      { id: '00000000-0000-0000-0000-000000000308', name: 'Craft Beer', price_cents: 750 },
      { id: '00000000-0000-0000-0000-000000000309', name: 'Fresh Lemonade', price_cents: 450 },
    ],
  },
]
