// Integration tests for the persistence layer (src/supabase.js) against a live
// local Supabase instance.
//
// IMPORTANT — these tests assert the schema's ACTUAL behavior.
//
//   GAP 1 (FIXED 2026-07-02) — regular users previously could not SELECT or
//   UPDATE companies at all (the policies' EXISTS subqueries read tables the
//   user couldn't see under RLS). The 2026-07-02 migrations made membership
//   visible (SECURITY DEFINER helpers + scoped SELECT policies on
//   `licensee_companies`/`licensees`), so loadConfig() now returns the
//   assigned companies for a regular licensee.
//
//   GAP 2 (still open) — saveConfig() uses upsert (INSERT ... ON CONFLICT).
//   Regular users still have no INSERT policy on companies, so the upsert is
//   RLS-denied outright and saveConfig() returns false for non-super-admins,
//   even for companies they could UPDATE directly. The test below pins this
//   so the regression surfaces the day an INSERT path (or UPDATE-based save)
//   lands.
//
// The signed-in entity MUST be src/supabase.js's module-level `supabase` client
// (loadConfig/saveConfig read its session). Fixtures are created via adminClient.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig, saveConfig, supabase } from '../../src/supabase.js';
import {
  adminClient,
  makeSuperAdmin,
  createLicenseeFor,
  createCompany,
  assignCompany,
  uniqueEmail,
  uniqueCompanyId,
  cleanupUser,
  cleanupCompany,
  cleanupLicensee,
} from './setup.js';

const PASSWORD = 'test-password-123!';

// Track what each test creates so afterEach can tear it down.
let created;

beforeEach(() => {
  created = { emails: [], companyIds: [], licenseeIds: [] };
});

afterEach(async () => {
  await supabase.auth.signOut().catch(() => {});
  for (const id of created.companyIds) await cleanupCompany(id);
  for (const id of created.licenseeIds) await cleanupLicensee(id);
  for (const email of created.emails) await cleanupUser(email);
});

// Create an auth user and sign the MODULE client in as them.
async function signInModuleClientAsNewUser({ superAdmin = false } = {}) {
  const email = uniqueEmail(superAdmin ? 'admin' : 'user');
  const { data, error } = await adminClient.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) throw new Error(`createUser failed: ${error.message}`);
  created.emails.push(email);
  if (superAdmin) await makeSuperAdmin(data.user.id);
  const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password: PASSWORD });
  if (signInErr) throw new Error(`signIn failed: ${signInErr.message}`);
  return { email, userId: data.user.id };
}

async function makeCompany(config) {
  const id = uniqueCompanyId();
  await createCompany({ id, name: 'IO Test Co', config });
  created.companyIds.push(id);
  return id;
}

const sampleConfig = () => ({
  shared: { wage: 18, occupancy: 95 },
  serviceLines: [{ id: 'sl_abc', type: 'TSC', name: 'TSC', config: {} }],
});

describe('loadConfig', () => {
  it('returns null when unauthenticated', async () => {
    await supabase.auth.signOut();
    expect(await loadConfig()).toBeNull();
  });

  it('returns null for a signed-in user with no companies', async () => {
    await signInModuleClientAsNewUser();
    expect(await loadConfig()).toBeNull();
  });

  it('returns a v2 blob for a regular licensee assigned a company (GAP 1 fixed 2026-07-02)', async () => {
    // A correctly-provisioned editor: licensee named = email, company, assignment.
    const { email } = await signInModuleClientAsNewUser();
    const licenseeId = await createLicenseeFor(email);
    created.licenseeIds.push(licenseeId);
    const companyId = await makeCompany(sampleConfig());
    await assignCompany(licenseeId, companyId, 'editor');

    const config = await loadConfig();
    expect(config).not.toBeNull();
    expect(config.version).toBe(2);
    expect(config.companies.some((c) => c.id === companyId)).toBe(true);
  });

  it('returns a v2 config blob for a super-admin who can see companies', async () => {
    await signInModuleClientAsNewUser({ superAdmin: true });
    const companyId = await makeCompany(sampleConfig());

    const config = await loadConfig();
    expect(config).not.toBeNull();
    expect(config.version).toBe(2);
    expect(Array.isArray(config.companies)).toBe(true);
    expect(config.companies.some((c) => c.id === companyId)).toBe(true);
  });

  it('returns a well-formed v2 shape', async () => {
    await signInModuleClientAsNewUser({ superAdmin: true });
    const companyId = await makeCompany(sampleConfig());

    const config = await loadConfig();
    expect(config.version).toBe(2);
    expect(config.selectedServiceLineId).toBeNull();
    expect(config.selectedCompanyId).toBe(config.companies[0].id);
    const mine = config.companies.find((c) => c.id === companyId);
    expect(mine).toMatchObject({ id: companyId });
    expect(typeof mine.shared).toBe('object');
    expect(Array.isArray(mine.serviceLines)).toBe(true);
    expect(mine.shared.wage).toBe(18);
  });
});

describe('saveConfig', () => {
  it('GAP 2: returns false for a regular editor (upsert INSERT path is RLS-denied)', async () => {
    const { email } = await signInModuleClientAsNewUser();
    const licenseeId = await createLicenseeFor(email);
    created.licenseeIds.push(licenseeId);
    const companyId = uniqueCompanyId();
    created.companyIds.push(companyId);
    await createCompany({ id: companyId, name: 'IO Test Co', config: sampleConfig() });
    await assignCompany(licenseeId, companyId, 'editor');

    const ok = await saveConfig({
      version: 2,
      companies: [{ id: companyId, name: 'Renamed', shared: { wage: 99 }, serviceLines: [] }],
    });
    expect(ok).toBe(false);
  });

  it('upserts and returns true for a super-admin', async () => {
    await signInModuleClientAsNewUser({ superAdmin: true });
    const companyId = uniqueCompanyId();
    created.companyIds.push(companyId);

    const ok = await saveConfig({
      version: 2,
      companies: [{ id: companyId, name: 'Saved Co', shared: { wage: 21 }, serviceLines: [] }],
    });
    expect(ok).toBe(true);

    // Verify the row landed, via the admin client (bypasses RLS).
    const { data } = await adminClient.from('companies').select('name, config').eq('id', companyId).single();
    expect(data.name).toBe('Saved Co');
    expect(data.config.shared.wage).toBe(21);
  });

  it('overwrites on a second save with different data', async () => {
    await signInModuleClientAsNewUser({ superAdmin: true });
    const companyId = uniqueCompanyId();
    created.companyIds.push(companyId);

    await saveConfig({ version: 2, companies: [{ id: companyId, name: 'V1', shared: { wage: 10 }, serviceLines: [] }] });
    await saveConfig({ version: 2, companies: [{ id: companyId, name: 'V2', shared: { wage: 20 }, serviceLines: [] }] });

    const { data } = await adminClient.from('companies').select('name, config').eq('id', companyId).single();
    expect(data.name).toBe('V2');
    expect(data.config.shared.wage).toBe(20);
  });

  it('round-trips: saveConfig then loadConfig returns equivalent data', async () => {
    await signInModuleClientAsNewUser({ superAdmin: true });
    const companyId = uniqueCompanyId();
    created.companyIds.push(companyId);
    const cfg = sampleConfig();

    await saveConfig({
      version: 2,
      companies: [{ id: companyId, name: 'RoundTrip Co', shared: cfg.shared, serviceLines: cfg.serviceLines }],
    });

    const loaded = await loadConfig();
    const mine = loaded.companies.find((c) => c.id === companyId);
    expect(mine.name).toBe('RoundTrip Co');
    expect(mine.shared).toEqual(cfg.shared);
    expect(mine.serviceLines).toEqual(cfg.serviceLines);
  });

  it('upserts multiple companies independently', async () => {
    await signInModuleClientAsNewUser({ superAdmin: true });
    const idA = uniqueCompanyId();
    const idB = uniqueCompanyId();
    created.companyIds.push(idA, idB);

    const ok = await saveConfig({
      version: 2,
      companies: [
        { id: idA, name: 'Co A', shared: { wage: 1 }, serviceLines: [] },
        { id: idB, name: 'Co B', shared: { wage: 2 }, serviceLines: [] },
      ],
    });
    expect(ok).toBe(true);

    const { data } = await adminClient.from('companies').select('id, name').in('id', [idA, idB]);
    expect(data.map((r) => r.name).sort()).toEqual(['Co A', 'Co B']);
  });
});
