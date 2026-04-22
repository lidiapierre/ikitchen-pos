/**
 * Supabase admin client (service-role key).
 *
 * This client bypasses Row Level Security and must ONLY be used in server-side
 * code (API routes, edge functions, server actions). Never import this from
 * any client-side component.
 *
 * Follows the same "single shared client" pattern as @/lib/supabase, but for
 * server-side operations that require elevated privileges.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let _client: SupabaseClient | null = null

export function getSupabaseAdmin(): SupabaseClient {
  if (_client) return _client
  _client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
  return _client
}
