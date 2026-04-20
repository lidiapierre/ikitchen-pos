import { defineConfig } from 'vitest/config'

/**
 * Root Vitest config — used when running edge-function unit tests directly
 * (e.g. `npx vitest run supabase/functions/...`).
 *
 * The alias maps the Deno JSR import specifier used in edge functions to the
 * equivalent npm package available in node_modules so Vitest (Node.js) can
 * resolve it during testing.
 */
export default defineConfig({
  resolve: {
    alias: {
      'jsr:@supabase/supabase-js@2': '@supabase/supabase-js',
    },
  },
  test: {
    environment: 'node',
  },
})
