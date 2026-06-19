import { expect } from '@playwright/test';

// Logs in through the real form and waits for the tool to render.
//
// NOTE: the login form lives at /login. On success App.jsx's /login route
// redirects to /app (via onAuthStateChange setting the session). We wait on a
// tool-only element (the Sign Out button) rather than asserting the URL.
export async function loginAs(page, email, password) {
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page.getByRole('button', { name: /sign out/i })).toBeVisible({ timeout: 15000 });
}

// Adds a service line via the header picker, given its full label
// (e.g. /targeted service coordination/i), then opens its tab.
export async function addServiceLine(page, labelRegex) {
  await page.getByRole('button', { name: /\+ add service line/i }).click();
  await page.getByRole('button', { name: labelRegex }).click();
}
