// Provisions the E2E identity before any spec runs, and resets the seed
// company so each run starts from a known baseline. (Per-test resets live in a
// beforeEach via resetSeedCompany — see fixtures/seed.js.)
//
// Uses the Supabase service_role key (bypasses RLS, can manage auth users),
// injected by the `test:e2e` npm script from `supabase status`. Mirrors the
// safety model of tests/integration/setup.js: refuses any non-local URL.

import { E2E_EMAIL, E2E_PASSWORD } from './fixtures/credentials.js';
import { adminClient, resetSeedCompany } from './fixtures/seed.js';

export default async function globalSetup() {
  // adminClient() enforces the local-URL guard and service-key presence.
  const admin = adminClient();

  // Idempotent: remove a stale E2E user from a prior run, then recreate.
  const { data: list } = await admin.auth.admin.listUsers();
  const existing = list?.users?.find((u) => u.email === E2E_EMAIL);
  if (existing) await admin.auth.admin.deleteUser(existing.id);

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: E2E_EMAIL,
    password: E2E_PASSWORD,
    email_confirm: true,
  });
  if (createErr) throw new Error(`E2E createUser failed: ${createErr.message}`);

  // Super-admin so the user can load/save the unassigned seed company (the
  // Phase 3 RLS gap blocks regular licensees from reading any company).
  // Also mark onboarding complete: this fixture is reused across many specs
  // that assume the dashboard renders immediately after login (e.g.
  // auth.spec.js, financial-tool.spec.js) — it represents a pre-existing
  // account, not a first-time login, so onboarding shouldn't intercept it.
  const { error: adminErr } = await admin
    .from('profiles')
    .update({ is_super_admin: true, onboarding_completed_at: new Date().toISOString() })
    .eq('id', created.user.id);
  if (adminErr) throw new Error(`E2E makeSuperAdmin failed: ${adminErr.message}`);

  // Reset the seed company to baseline (upsert in case db reset wasn't run).
  await resetSeedCompany(admin);
}
