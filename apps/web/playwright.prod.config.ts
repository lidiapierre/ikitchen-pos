import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/qa-prod.spec.ts',
  timeout: 120000,
  retries: 0,
  workers: 1,
  reporter: [['list'], ['json', { outputFile: '/tmp/qa-results.json' }]],
  use: {
    baseURL: 'https://ikitchen-pos-jsrbjkknw-lidiapierres-projects.vercel.app',
    headless: true,
    viewport: { width: 1280, height: 800 },
    screenshot: 'only-on-failure',
    video: 'off',
    // NO storageState — each test handles its own auth
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
