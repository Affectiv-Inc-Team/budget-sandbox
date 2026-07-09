// Owner-delegated invitations end to end — tier-gated invite form, scoped
// roster visibility, scoped service-line tab filtering, and SuperAdmin revoke.
//
// Runs against a dedicated company (co_e2e_invites), never the shared seed
// company, so it can run alongside financial-tool.spec.js without either
// resetting the other's state. Uses admin-client fixtures for setup/assertions
// (bypassing RLS) and the real login form for every user-facing step — the
// same split the rest of the e2e suite uses.

import { test, expect } from '@playwright/test';
import { loginAs } from './fixtures/auth.js';
import { E2E_EMAIL, E2E_PASSWORD } from './fixtures/credentials.js';
import { adminClient } from './fixtures/seed.js';
import { createCompany, createServiceLine } from '../../src/lib/companyShape.js';

const PASSWORD = 'e2e-invite-password-123!';
const COMPANY_ID = 'co_e2e_invites';

const OWNER_EMAIL = 'e2e-invite-owner@test.local';
const FINANCE_EMAIL = 'e2e-invite-finance@test.local';
const HOUSE_LEAD_EMAIL = 'e2e-invite-houselead@test.local';
const REGIONAL_EMAIL = 'e2e-invite-regional@test.local'; // accepted, scoped to TSC
const REVOKEE_EMAIL = 'e2e-invite-revokee@test.local'; // stays pending, gets revoked

let admin;
let tscLine;
let resHabLine;

async function findUserId(email) {
  const { data } = await admin.auth.admin.listUsers();
  return data?.users?.find((u) => u.email === email)?.id ?? null;
}

// Creates the auth user + profile role + licensee + membership directly
// (bypassing the invite flow) — used for seeded users whose access predates
// this test run (Owner, Finance, House Lead all start as existing members).
// This spec tests invite/scope mechanics, not onboarding, so onboarding is
// stamped complete here too — otherwise loginAs() would hit the onboarding
// welcome screen instead of the dashboard it expects.
async function seedMember(email, role, accessRole = 'admin') {
  const { data: created, error } = await admin.auth.admin.createUser({
    email, password: PASSWORD, email_confirm: true,
  });
  if (error) throw new Error(`seedMember createUser(${email}) failed: ${error.message}`);
  const { error: roleErr } = await admin.from('profiles')
    .update({ role, onboarding_completed_at: new Date().toISOString() })
    .eq('id', created.user.id);
  if (roleErr) throw new Error(`seedMember set role failed: ${roleErr.message}`);
  const { data: lic, error: licErr } = await admin
    .from('licensees').insert({ name: email }).select('id').single();
  if (licErr) throw new Error(`seedMember createLicensee failed: ${licErr.message}`);
  const { error: assignErr } = await admin
    .from('licensee_companies').insert({ licensee_id: lic.id, company_id: COMPANY_ID, role: accessRole });
  if (assignErr) throw new Error(`seedMember assignCompany failed: ${assignErr.message}`);
  return created.user.id;
}

async function cleanupUserAndLicensee(email) {
  await admin.from('licensees').delete().eq('name', email);
  const id = await findUserId(email);
  if (id) await admin.auth.admin.deleteUser(id);
}

test.describe('Owner-delegated invitations', () => {
  test.beforeAll(async () => {
    admin = adminClient();

    tscLine = createServiceLine('TSC', { name: 'TSC' });
    resHabLine = createServiceLine('RES_HAB_DAILY', { name: 'Res Hab Daily' });
    const company = createCompany('Sawtooth E2E', {
      id: COMPANY_ID,
      serviceLines: [tscLine, resHabLine],
    });

    const { error: coErr } = await admin.from('companies').upsert({
      id: company.id, name: company.name, archived: false,
      config: { shared: company.shared, serviceLines: company.serviceLines },
    });
    if (coErr) throw new Error(`company upsert failed: ${coErr.message}`);

    await seedMember(OWNER_EMAIL, 'OWNER', 'admin');
    await seedMember(FINANCE_EMAIL, 'FINANCE', 'admin');
    await seedMember(HOUSE_LEAD_EMAIL, 'HOUSE_LEAD', 'read_only');
  });

  test.afterAll(async () => {
    for (const email of [OWNER_EMAIL, FINANCE_EMAIL, HOUSE_LEAD_EMAIL, REGIONAL_EMAIL, REVOKEE_EMAIL]) {
      await cleanupUserAndLicensee(email);
    }
    await admin.from('companies').delete().eq('id', COMPANY_ID);
  });

  test('Owner invites a Regional Director scoped to TSC; roster shows it as Invited', async ({ page }) => {
    await loginAs(page, OWNER_EMAIL, PASSWORD);
    await page.goto('/team');
    await expect(page.getByRole('heading', { name: /team & invitations/i })).toBeVisible();

    await page.getByLabel('Invite email').fill(REGIONAL_EMAIL);
    await page.getByLabel('Invite tier').selectOption({ label: 'Regional Director (T4)' });
    await page.getByLabel('Service line scope').selectOption({ label: 'TSC' });
    await page.getByRole('button', { name: /send invite/i }).click();

    await expect(page.getByText(new RegExp(`Invite sent to ${REGIONAL_EMAIL}`, 'i'))).toBeVisible({ timeout: 15000 });

    const row = page.locator('tr', { hasText: REGIONAL_EMAIL });
    // Owner is a company admin, so this row's tier renders as an editable
    // select (not the read-only chip) — assert its value, not visible text,
    // since every tier label exists among the select's own <option>s.
    await expect(row.getByLabel(`Tier for ${REGIONAL_EMAIL}`)).toHaveValue('REGIONAL_DIRECTOR');
    await expect(row).toContainText('TSC');
    await expect(row).toContainText('Invited');
  });

  test('Owner invites a second teammate who will later be revoked', async ({ page }) => {
    await loginAs(page, OWNER_EMAIL, PASSWORD);
    await page.goto('/team');

    await page.getByLabel('Invite email').fill(REVOKEE_EMAIL);
    await page.getByLabel('Invite tier').selectOption({ label: 'HR Manager (T6)' });
    await page.getByLabel('Service line scope').selectOption({ label: 'Res Hab Daily' });
    await page.getByRole('button', { name: /send invite/i }).click();

    await expect(page.getByText(new RegExp(`Invite sent to ${REVOKEE_EMAIL}`, 'i'))).toBeVisible({ timeout: 15000 });
  });

  test('Finance cannot invite Owner, CEO, or Finance — only strictly lower tiers', async ({ page }) => {
    await loginAs(page, FINANCE_EMAIL, PASSWORD);
    await page.goto('/team');

    const tierSelect = page.getByLabel('Invite tier');
    await expect(tierSelect).toBeVisible();
    const optionTexts = await tierSelect.locator('option').allTextContents();
    expect(optionTexts.join(' ')).not.toMatch(/Owner \(T1\)/);
    expect(optionTexts.join(' ')).not.toMatch(/CEO \(T2\)/);
    expect(optionTexts.join(' ')).not.toMatch(/Finance \(T3\)/);
    expect(optionTexts.join(' ')).toMatch(/Regional Director \(T4\)/);
    expect(optionTexts.join(' ')).toMatch(/House Lead \(T8\)/);
  });

  test('House Lead sees the locked panel with no invite form at all', async ({ page }) => {
    await loginAs(page, HOUSE_LEAD_EMAIL, PASSWORD);
    await page.goto('/team');

    await expect(page.getByText(/no tier below it to invite/i)).toBeVisible();
    await expect(page.getByLabel('Invite email')).toHaveCount(0);
    // The roster itself is still visible to every tier.
    await expect(page.getByText(OWNER_EMAIL)).toBeVisible();
  });

  test('accepted teammate sees only their scoped service line, Whole Company stays', async ({ page }) => {
    // Simulate acceptance: set a password + confirm the email on the invited
    // auth user directly (skips the real email link — inviteUserByEmail
    // already created the auth user, but leaves it unconfirmed until the
    // invitee clicks that link; email_confirm mirrors what clicking it does)
    // then sign in through the real login form.
    const userId = await findUserId(REGIONAL_EMAIL);
    expect(userId).toBeTruthy();
    const { error } = await admin.auth.admin.updateUserById(userId, { password: PASSWORD, email_confirm: true });
    if (error) throw new Error(`updateUserById failed: ${error.message}`);
    // This spec tests scope filtering, not onboarding — skip the welcome
    // screen loginAs() below would otherwise hit.
    await admin.from('profiles').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', userId);

    await loginAs(page, REGIONAL_EMAIL, PASSWORD);
    await expect(page.getByRole('button', { name: /🏢 Whole Company/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^TSC/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Res Hab Daily/i })).toHaveCount(0);
  });

  test('SuperAdmin sees the invite and can revoke a not-yet-accepted one', async ({ page }) => {
    // revokeInvite() gates on window.confirm(); Playwright auto-dismisses
    // native dialogs unless a handler accepts them.
    page.on('dialog', (dialog) => dialog.accept());

    await loginAs(page, E2E_EMAIL, E2E_PASSWORD); // existing global super-admin fixture
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: /super admin panel/i })).toBeVisible();

    // The email also appears in AdminPanel's Licensees and Assignments
    // tables — scope to the Invitations table specifically (found via its
    // heading) rather than filtering on the Revoke button, which disappears
    // once revoked and would make the locator go stale mid-test.
    const invitationsTable = page.getByRole('heading', { name: /Invitations \(/ })
      .locator('xpath=following-sibling::table[1]');
    const row = invitationsTable.locator('tr', { hasText: REVOKEE_EMAIL });
    await expect(row).toBeVisible();
    await expect(row).toContainText('Sawtooth E2E');
    await expect(row).toContainText('sent');

    await row.getByRole('button', { name: /revoke/i }).click();
    await expect(row).toContainText('revoked');
    await expect(row.getByRole('button', { name: /revoke/i })).toHaveCount(0);

    // Membership was deleted by revoke_invite — confirm at the data layer.
    // (Not a UI "no companies assigned" check: migrateConfig(null) currently
    // seeds a local scratch company whenever loadConfig() returns null, so
    // that empty state isn't reachable in the UI yet — fixed by the Phase 2
    // onboarding work, out of scope here.)
    const { data: membership } = await admin
      .from('licensee_companies')
      .select('*')
      .eq('company_id', COMPANY_ID)
      .in('licensee_id', (await admin.from('licensees').select('id').eq('name', REVOKEE_EMAIL)).data.map((l) => l.id));
    expect(membership).toHaveLength(0);

    // Their account still works, but with no company: ToolPage now shows the
    // real AwaitingCompany screen for this (post-onboarding, no company)
    // case — no Sign Out button there, so this doesn't use loginAs(), same
    // as the empty-state check this replaced before AwaitingCompany existed.
    // Stamp onboarding complete: this spec tests invite/scope mechanics, not
    // onboarding, and an unstamped revokee would otherwise hit the onboarding
    // welcome screen instead of this (also Sign-Out-less) status screen.
    const revokeeId = await findUserId(REVOKEE_EMAIL);
    const { error } = await admin.auth.admin.updateUserById(revokeeId, { password: PASSWORD, email_confirm: true });
    if (error) throw new Error(`updateUserById failed: ${error.message}`);
    await admin.from('profiles').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', revokeeId);

    await page.goto('/app'); // AdminPanel has no Sign Out button
    await page.getByRole('button', { name: /sign out/i }).click();
    await expect(page.getByLabel(/email/i)).toBeVisible({ timeout: 15000 });

    await page.getByLabel(/email/i).fill(REVOKEE_EMAIL);
    await page.getByLabel(/password/i).fill(PASSWORD);
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page.getByText(/workspace is being set up/i)).toBeVisible({ timeout: 15000 });
  });
});
