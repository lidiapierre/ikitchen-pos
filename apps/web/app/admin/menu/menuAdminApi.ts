export interface ModifierInput {
  name: string
  price_delta_cents: number
}

function generateId(): string {
  return `mock-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export async function callCreateMenu(
  _supabaseUrl: string,
  _apiKey: string,
  _restaurantId: string,
  _name: string,
): Promise<string> {
  return generateId()
}

export async function callUpdateMenu(
  _supabaseUrl: string,
  _apiKey: string,
  _menuId: string,
  _name: string,
): Promise<void> {
  // mock: no-op
}

export async function callDeleteMenu(
  _supabaseUrl: string,
  _apiKey: string,
  _menuId: string,
): Promise<void> {
  // mock: no-op
}

export async function callCreateMenuItem(
  _supabaseUrl: string,
  _apiKey: string,
  _menuId: string,
  _name: string,
  _priceCents: number,
  _modifiers: ModifierInput[],
): Promise<string> {
  return generateId()
}

export async function callUpdateMenuItem(
  _supabaseUrl: string,
  _apiKey: string,
  _menuItemId: string,
  _name: string,
  _priceCents: number,
  _modifiers: ModifierInput[],
): Promise<void> {
  // mock: no-op
}

export async function callDeleteMenuItem(
  _supabaseUrl: string,
  _apiKey: string,
  _menuItemId: string,
): Promise<void> {
  // mock: no-op
}
