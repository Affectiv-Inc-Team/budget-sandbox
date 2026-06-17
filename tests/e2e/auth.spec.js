import { test, expect } from '@playwright/test';
import { loginAs } from './fixtures/auth.js';
import { E2E_EMAIL, E2E_PASSWORD } from './fixtures/credentials.js';

test.describe('Authentication', () => {
  test('unauthenticated users see the login page, not the tool', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
    // The tool's Sign Out button must NOT be present pre-auth.
    await expect(page.getByRole('button', { name: /sign out/i })).toHaveCount(0);
  });

  test('invalid credentials show an error and stay on the login page', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill('nobody@test.local');
    await page.getByLabel(/password/i).fill('wrong-password');
    await page.getByRole('button', { name: /sign in/i }).click();

    // Supabase returns an "Invalid login credentials" message into .login-error.
    await expect(page.locator('.login-error')).toBeVisible({ timeout: 15000 });
    await expect(page.getByLabel(/email/i)).toBeVisible(); // still on login
    await expect(page.getByRole('button', { name: /sign out/i })).toHaveCount(0);
  });

  test('valid credentials load the financial tool', async ({ page }) => {
    await loginAs(page, E2E_EMAIL, E2E_PASSWORD);
    await expect(page.getByText('Financial Model Builder')).toBeVisible();
    await expect(page.getByRole('button', { name: /🏢 Whole Company/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /sign out/i })).toBeVisible();
  });

  test('signing out returns to the login page', async ({ page }) => {
    await loginAs(page, E2E_EMAIL, E2E_PASSWORD);
    await page.getByRole('button', { name: /sign out/i }).click();
    await expect(page.getByLabel(/email/i)).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: /sign out/i })).toHaveCount(0);
  });
});
