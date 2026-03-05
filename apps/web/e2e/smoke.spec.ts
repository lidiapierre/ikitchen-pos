import { test, expect } from '@playwright/test';

test('tables page loads without error', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('/tables');

  expect(errors).toHaveLength(0);
  await expect(page).not.toHaveURL(/error/);
});
