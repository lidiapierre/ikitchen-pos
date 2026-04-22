/**
 * Supabase admin client (secret key).
 *
 * This client bypasses Row Level Security and must ONLY be used in server-side
 * code (API routes, edge functions, server actions). Never import this from
 * any client-side component.
 *
 * Uses the new Supabase key format: SUPABASE_SECRET_KEY (replaces the legacy
 * SUPABASE_SERVICE_ROLE_KEY).
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
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false } }
  )
  return _client
}
