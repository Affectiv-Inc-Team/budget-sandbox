import { test, expect } from '@playwright/test';

// Public marketing pages — no auth required.
test.describe('Public landing pages', () => {
  test('home page renders the hero and both CTAs', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    // Primary "Request a Demo" + secondary "Sign In" both present pre-auth.
    // Demo CTA is a button since 2026-07-02 — it opens DemoRequestModal in-page.
    await expect(page.getByRole('button', { name: /request a demo/i }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /^sign in$/i }).first()).toBeVisible();
    // The login form must NOT be on the public home page.
    await expect(page.getByLabel(/password/i)).toHaveCount(0);
  });

  test('features page renders and header nav links between pages', async ({ page }) => {
    await page.goto('/features');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.getByRole('link', { name: /^home$/i }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  test('Sign In link routes to the login form', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /^sign in$/i }).first().click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByLabel(/email/i)).toBeVisible();
  });

  test('unknown routes redirect to the home page', async ({ page }) => {
    await page.goto('/does-not-exist');
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
});
