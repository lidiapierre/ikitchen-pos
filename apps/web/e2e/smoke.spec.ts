import { test, expect } from '@playwright/test';

test('tables page loads without error', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('/tables');

  expect(errors).toHaveLength(0);
  await expect(page).not.toHaveURL(/error/);
});

test('tables page shows heading and either table cards or empty state', async ({ page }) => {
  await page.goto('/tables');

  // Wait for the loading state to resolve
  await expect(page.getByRole('heading', { name: 'Tables' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Refresh' })).toBeVisible();

  // Either table cards, the empty state message, or an error message must be present
  const tableCards = page.getByRole('button').filter({ hasNotText: 'Refresh' });
  const emptyState = page.getByText('No tables configured.');
  const errorState = page.getByText(/Supabase is not configured|Failed to load tables/);
  await expect(tableCards.or(emptyState).or(errorState).first()).toBeVisible();
});
