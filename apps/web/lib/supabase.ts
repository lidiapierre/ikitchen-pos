import { createBrowserClient } from '@supabase/ssr'

// Use empty strings as fallback so Next.js can build without env vars set.
// At runtime in the browser, real values must be present via env.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ''

export const supabase = createBrowserClient(supabaseUrl, supabaseKey)
