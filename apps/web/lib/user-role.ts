import type { SupabaseClient } from '@supabase/supabase-js'

export type UserRole = 'owner' | 'manager' | 'server' | 'kitchen'

export const VALID_ROLES: UserRole[] = ['owner', 'manager', 'server', 'kitchen']

/**
 * Fetches the role of the currently authenticated user from the `users` table.
 * Returns null if the user is not found or an error occurs.
 */
export async function getUserRole(
  supabaseClient: SupabaseClient
): Promise<UserRole | null> {
  const {
    data: { user },
  } = await supabaseClient.auth.getUser()

  if (user === null) {
    return null
  }

  const { data, error } = await supabaseClient
    .from('users')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (error !== null || data === null) {
    return null
  }

  const raw = (data as { role: string }).role
  return VALID_ROLES.includes(raw as UserRole) ? (raw as UserRole) : null
}

/**
 * Fetches both the authenticated user's ID and their role in one pass.
 * Preferred over calling getUserRole + auth.getUser separately, as it avoids
 * making two separate getUser() network requests.
 */
export async function getUserRoleAndId(
  supabaseClient: SupabaseClient,
): Promise<{ role: UserRole | null; userId: string | null }> {
  const {
    data: { user },
  } = await supabaseClient.auth.getUser()

  if (user === null) {
    return { role: null, userId: null }
  }

  const { data, error } = await supabaseClient
    .from('users')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (error !== null || data === null) {
    return { role: null, userId: user.id }
  }

  const raw = (data as { role: string }).role
  const role = VALID_ROLES.includes(raw as UserRole) ? (raw as UserRole) : null
  return { role, userId: user.id }
}

export const ADMIN_ROLES: UserRole[] = ['owner', 'manager']

export function isAdminRole(role: UserRole | null): boolean {
  if (role === null) return false
  return ADMIN_ROLES.includes(role)
}
