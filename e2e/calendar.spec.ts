import { test, expect } from '@playwright/test';

// Assumes a logged-in admin session helper exists. If not, add one
// here that programmatically creates a Supabase session cookie before each test.

test.describe('Calendar tab', () => {
  test('navigates to calendar from sidebar', async ({ page }) => {
    await page.goto('/dashboard');
    await page.getByRole('link', { name: 'Calendar' }).click();
    await expect(page).toHaveURL(/\/dashboard\/calendar/);
    await expect(page.getByRole('button', { name: /new job/i })).toBeVisible();
  });

  test('opens new job modal when clicking +New job', async ({ page }) => {
    await page.goto('/dashboard/calendar');
    await page.getByRole('button', { name: /new job/i }).click();
    await expect(page.getByText('New job', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: /cancel/i }).click();
  });

  test('switches between month / week / day views', async ({ page }) => {
    await page.goto('/dashboard/calendar');
    await page.getByRole('button', { name: 'week' }).click();
    await expect(page.locator('.rbc-time-view')).toBeVisible();
    await page.getByRole('button', { name: 'day' }).click();
    await expect(page.locator('.rbc-time-view')).toBeVisible();
    await page.getByRole('button', { name: 'month' }).click();
    await expect(page.locator('.rbc-month-view')).toBeVisible();
  });
});
