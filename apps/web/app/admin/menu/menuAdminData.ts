export interface AdminModifier {
  id: string
  name: string
  price_delta_cents: number
}

export interface AdminMenuItem {
  id: string
  name: string
  price_cents: number
  modifiers: AdminModifier[]
}

export interface AdminMenu {
  id: string
  name: string
  restaurant_id: string
  items: AdminMenuItem[]
}

export interface MenuAdminData {
  restaurantId: string
  menus: AdminMenu[]
}

const MOCK_RESTAURANT_ID = 'mock-restaurant-1'

const MOCK_MENUS: AdminMenu[] = [
  {
    id: 'menu-starters',
    name: 'Starters',
    restaurant_id: MOCK_RESTAURANT_ID,
    items: [
      { id: 'item-1', name: 'Garlic Bread', price_cents: 450, modifiers: [] },
      {
        id: 'item-2',
        name: 'Soup of the Day',
        price_cents: 650,
        modifiers: [
          { id: 'mod-1', name: 'Add croutons', price_delta_cents: 50 },
        ],
      },
    ],
  },
  {
    id: 'menu-mains',
    name: 'Mains',
    restaurant_id: MOCK_RESTAURANT_ID,
    items: [
      {
        id: 'item-3',
        name: 'Grilled Chicken',
        price_cents: 1450,
        modifiers: [
          { id: 'mod-2', name: 'Extra sauce', price_delta_cents: 100 },
          { id: 'mod-3', name: 'Gluten-free', price_delta_cents: 0 },
        ],
      },
      { id: 'item-4', name: 'Veggie Burger', price_cents: 1250, modifiers: [] },
    ],
  },
  {
    id: 'menu-desserts',
    name: 'Desserts',
    restaurant_id: MOCK_RESTAURANT_ID,
    items: [
      { id: 'item-5', name: 'Chocolate Brownie', price_cents: 695, modifiers: [] },
    ],
  },
  {
    id: 'menu-drinks',
    name: 'Drinks',
    restaurant_id: MOCK_RESTAURANT_ID,
    items: [
      { id: 'item-6', name: 'Sparkling Water', price_cents: 250, modifiers: [] },
      { id: 'item-7', name: 'House Wine', price_cents: 595, modifiers: [] },
    ],
  },
]

export async function fetchMenuAdminData(): Promise<MenuAdminData> {
  return { restaurantId: MOCK_RESTAURANT_ID, menus: MOCK_MENUS }
}
