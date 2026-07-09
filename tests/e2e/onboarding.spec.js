// Onboarding flow end to end — Owner bootstrap walk, invited-teammate short
// walk (bootstrap steps skipped), and Skip setup dropping straight to the
// dashboard and persisting across reload.
//
// Runs against a dedicated company (co_e2e_onboarding), separate from every
// other e2e spec's fixtures, using admin-client setup/assertions plus the
// real login form and real onboarding UI for every user-facing step.

import { test, expect } from '@playwright/test';
import { adminClient } from './fixtures/seed.js';
import { createCompany, createServiceLine } from '../../src/lib/companyShape.js';

const PASSWORD = 'e2e-onboard-password-123!';
const COMPANY_ID = 'co_e2e_onboarding';

const OWNER_EMAIL = 'e2e-onboard-owner@test.local';
const SCHEDULER_EMAIL = 'e2e-onboard-scheduler@test.local';
const SKIPPER_EMAIL = 'e2e-onboard-skipper@test.local';

let admin;

async function findUserId(email) {
  const { data } = await admin.auth.admin.listUsers();
  return data?.users?.find((u) => u.email === email)?.id ?? null;
}

async function createOwnerUser(email, { withCompany } = {}) {
  const { data: created, error } = await admin.auth.admin.createUser({
    email, password: PASSWORD, email_confirm: true,
  });
  if (error) throw new Error(`createUser(${email}) failed: ${error.message}`);
  const { error: roleErr } = await admin.from('profiles')
    .update({ role: 'OWNER' }).eq('id', created.user.id);
  if (roleErr) throw new Error(roleErr.message);

  if (withCompany) {
    const { data: lic, error: licErr } = await admin
      .from('licensees').insert({ name: email }).select('id').single();
    if (licErr) throw new Error(licErr.message);
    const { error: assignErr } = await admin
      .from('licensee_companies').insert({ licensee_id: lic.id, company_id: withCompany, role: 'admin' });
    if (assignErr) throw new Error(assignErr.message);
  }
  return created.user.id;
}

// A "short flow" invited teammate: an invites row (so getProvenance sees
// provenance='invited') + membership + org role, all pre-existing — this
// represents an already-accepted invite, not the acceptance moment itself
// (that path is covered by team-invites.spec.js).
async function createInvitedTeammate(email, role, companyId, inviterEmail) {
  const { data: created, error } = await admin.auth.admin.createUser({
    email, password: PASSWORD, email_confirm: true,
  });
  if (error) throw new Error(error.message);
  await admin.from('profiles').update({ role }).eq('id', created.user.id);
  const { data: lic } = await admin.from('licensees').insert({ name: email }).select('id').single();
  await admin.from('licensee_companies').insert({ licensee_id: lic.id, company_id: companyId, role: 'read_only' });
  await admin.from('invites').insert({
    company_id: companyId, email, org_role: role, service_line_scope: null,
    access_role: 'read_only', invited_by_email: inviterEmail, status: 'sent',
  });
  return created.user.id;
}

async function cleanupUser(email) {
  await admin.from('licensees').delete().eq('name', email);
  const id = await findUserId(email);
  if (id) await admin.auth.admin.deleteUser(id);
}

test.describe('Onboarding', () => {
  test.beforeAll(() => { admin = adminClient(); });

  test.afterAll(async () => {
    for (const email of [OWNER_EMAIL, SCHEDULER_EMAIL, SKIPPER_EMAIL]) await cleanupUser(email);
    await admin.from('companies').delete().eq('id', COMPANY_ID);
  });

  test('Owner full flow: welcome -> awaiting company -> bootstrap -> tour -> first line -> invite -> done', async ({ page }) => {
    await createOwnerUser(OWNER_EMAIL); // no company yet

    // Sign in via the raw form: this account has no company and no
    // onboarding_completed_at, so it lands on Welcome, which has no Sign Out
    // button — loginAs()'s success check doesn't apply here.
    await page.goto('/login');
    await page.getByLabel(/email/i).fill(OWNER_EMAIL);
    await page.getByLabel(/password/i).fill(PASSWORD);
    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(page.getByText(/welcome to intrinsic/i)).toBeVisible({ timeout: 15000 });
    expect(await page.getByText(/you see everything, unfiltered/i).isVisible()).toBe(true);
    await page.getByRole('button', { name: /^continue$/i }).click();

    // No company yet -> awaiting_company, with the pulsing "awaiting" row.
    await expect(page.getByText(/workspace is being set up/i)).toBeVisible();
    await expect(page.getByText(/awaiting company assignment/i)).toBeVisible();

    // Assign a company (with one active TSC line already, so first_line is
    // skipped for THIS pass — exercised separately by the picker's own tests;
    // here we're proving the awaiting_company -> access_granted transition).
    const tsc = createServiceLine('TSC', { name: 'TSC' });
    const company = createCompany('Sawtooth Onboard E2E', { id: COMPANY_ID, serviceLines: [tsc] });
    await admin.from('companies').upsert({
      id: company.id, name: company.name, archived: false,
      config: { shared: company.shared, serviceLines: company.serviceLines },
    });
    const ownerId = await findUserId(OWNER_EMAIL);
    const { data: lic } = await admin.from('licensees').insert({ name: OWNER_EMAIL }).select('id').single();
    await admin.from('licensee_companies').insert({ licensee_id: lic.id, company_id: COMPANY_ID, role: 'admin' });

    await page.getByRole('button', { name: /check again/i }).click();

    // Company now exists -> the resume effect jumps straight to access_granted.
    await expect(page.getByText(/you're in/i)).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/role · owner/i)).toBeVisible();
    await page.getByRole('button', { name: /enter workspace/i }).click();

    // Tour: single company (no switcher stop) -> shared, strip, save.
    await expect(page.getByRole('dialog', { name: /guided tour/i })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/shared inputs/i)).toBeVisible();
    await page.getByRole('button', { name: /^next$/i }).click();
    await expect(page.getByText(/service line strip/i)).toBeVisible();
    await page.getByRole('button', { name: /^next$/i }).click();
    await expect(page.getByRole('button', { name: /^finish$/i })).toBeVisible();
    await page.getByRole('button', { name: /^finish$/i }).click();

    // Company already has TSC -> first_line/line_result skip -> invite_team
    // (Owner can invite any tier).
    await expect(page.getByRole('heading', { name: /invite your team/i })).toBeVisible();
    await page.getByText(/do this later/i).click();

    await expect(page.getByText(/you're set up/i)).toBeVisible();
    await expect(page.getByText(/configured your first service line/i)).toBeVisible();
    await page.getByRole('button', { name: /go to my dashboard/i }).click();

    // Real dashboard: Sign Out exists now, TSC tab visible, no onboarding UI.
    await expect(page.getByRole('button', { name: /sign out/i })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: /^TSC/ })).toBeVisible();
    await expect(page.getByRole('dialog', { name: /guided tour/i })).toHaveCount(0);

    // Reload: server flag is set, so onboarding never runs again.
    await page.reload();
    await expect(page.getByRole('button', { name: /sign out/i })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/welcome to intrinsic/i)).toHaveCount(0);
  });

  test('invited teammate short flow: bootstrap steps never render', async ({ page }) => {
    await createInvitedTeammate(SCHEDULER_EMAIL, 'SCHEDULER', COMPANY_ID, OWNER_EMAIL);

    await page.goto('/login');
    await page.getByLabel(/email/i).fill(SCHEDULER_EMAIL);
    await page.getByLabel(/password/i).fill(PASSWORD);
    await page.getByRole('button', { name: /sign in/i }).click();

    // Welcome, tier-appropriate copy for a read-only tier.
    await expect(page.getByText(/welcome to intrinsic/i)).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/budgets show as percentages/i)).toBeVisible();
    await page.getByRole('button', { name: /^continue$/i }).click();

    // Straight to access_granted — awaiting_company never renders for an
    // invited teammate, even though this flow never touches company
    // assignment at all.
    await expect(page.getByText(/you're in/i)).toBeVisible();
    await expect(page.getByText(new RegExp(`invited by ${OWNER_EMAIL}`, 'i'))).toBeVisible();
    await expect(page.getByText(/workspace is being set up/i)).toHaveCount(0);
    await page.getByRole('button', { name: /enter workspace/i }).click();

    // Tour renders (real dashboard mounted underneath).
    await expect(page.getByRole('dialog', { name: /guided tour/i })).toBeVisible({ timeout: 15000 });
    await page.getByText(/skip tour/i).click();

    // first_line/line_result never render for an invited teammate — lands
    // directly on invite_team (Scheduler can still invite House Lead) or done.
    await expect(page.getByText(/set up your first service line/i)).toHaveCount(0);
    await expect(page.getByRole('heading', { name: /invite your team/i })).toBeVisible({ timeout: 15000 });
    await page.getByText(/do this later/i).click();

    // Read-only tier gets the "nothing to save" next step, not "add a line".
    await expect(page.getByText(/nothing to save/i)).toBeVisible();
    await page.getByRole('button', { name: /go to my dashboard/i }).click();
    await expect(page.getByRole('button', { name: /^TSC/ })).toBeVisible({ timeout: 15000 });
  });

  test('Skip setup drops to the dashboard immediately and persists across reload', async ({ page }) => {
    await createOwnerUser(SKIPPER_EMAIL, { withCompany: COMPANY_ID });

    await page.goto('/login');
    await page.getByLabel(/email/i).fill(SKIPPER_EMAIL);
    await page.getByLabel(/password/i).fill(PASSWORD);
    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(page.getByText(/welcome to intrinsic/i)).toBeVisible({ timeout: 15000 });
    await page.getByText(/skip setup/i).click();

    await expect(page.getByRole('button', { name: /sign out/i })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/welcome to intrinsic/i)).toHaveCount(0);

    await page.reload();
    await expect(page.getByRole('button', { name: /sign out/i })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/welcome to intrinsic/i)).toHaveCount(0);
  });
});
