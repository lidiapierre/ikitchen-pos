import type { SupabaseClient } from '@supabase/supabase-js'

export type UserRole = 'owner' | 'manager' | 'server' | 'kitchen'

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
    .single()

  if (error !== null || data === null) {
    return null
  }

  return (data as { role: UserRole }).role ?? null
}

export const ADMIN_ROLES: UserRole[] = ['owner', 'manager']

export function isAdminRole(role: UserRole | null): boolean {
  if (role === null) return false
  return ADMIN_ROLES.includes(role)
}
