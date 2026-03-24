import { defineConfig, devices } from '@playwright/test';
import path from 'path';

export const STORAGE_STATE = path.join(__dirname, 'e2e/.auth/admin.json');

export default defineConfig({
  testDir: './e2e',
  globalSetup: './global-setup.ts',
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://dmaogdwtgohrhbytxjqu.supabase.co',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_IzsBL3KELStvo6bioFKWhA_dMj81UxH',
    },
  },
  use: {
    baseURL: 'http://localhost:3000',
    viewport: { width: 1280, height: 800 },
    // All tests run as the authenticated test admin by default
    storageState: STORAGE_STATE,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
