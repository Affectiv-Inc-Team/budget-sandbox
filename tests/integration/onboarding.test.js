// Onboarding persistence rail — profiles.onboarding_completed_at column +
// grant scope, and the invites self-read RLS path getProvenance() relies on
// (migrations 20260708190000_invites.sql, 20260709120000_onboarding_state.sql).

import { describe, it, expect, afterEach } from 'vitest';
import {
  adminClient,
  uniqueEmail,
  createTestSession,
  cleanupUser,
  provisionLicenseeWithCompany,
  teardownAll,
} from './setup.js';

describe('onboarding_completed_at column', () => {
  const trash = [];
  afterEach(async () => {
    for (const email of trash.splice(0)) await cleanupUser(email);
  });

  it('exists after a fresh reset and defaults to null', async () => {
    const email = uniqueEmail('onboard');
    trash.push(email);
    const { userId } = await createTestSession(email);
    const { data, error } = await adminClient
      .from('profiles').select('onboarding_completed_at').eq('id', userId).single();
    expect(error).toBeNull();
    expect(data.onboarding_completed_at).toBeNull();
  });

  it('an authed user can update their own onboarding_completed_at', async () => {
    const email = uniqueEmail('onboard');
    trash.push(email);
    const { client, userId } = await createTestSession(email);
    const stamp = new Date().toISOString();

    const { error } = await client
      .from('profiles').update({ onboarding_completed_at: stamp }).eq('id', userId);
    expect(error).toBeNull();

    const { data } = await adminClient
      .from('profiles').select('onboarding_completed_at').eq('id', userId).single();
    expect(new Date(data.onboarding_completed_at).toISOString()).toBe(stamp);
  });

  it('an authed user cannot update another user\'s onboarding_completed_at', async () => {
    const emailA = uniqueEmail('onboardA');
    const emailB = uniqueEmail('onboardB');
    trash.push(emailA, emailB);
    const { client: clientA } = await createTestSession(emailA);
    const { userId: userIdB } = await createTestSession(emailB);

    await clientA.from('profiles')
      .update({ onboarding_completed_at: new Date().toISOString() })
      .eq('id', userIdB);

    const { data } = await adminClient
      .from('profiles').select('onboarding_completed_at').eq('id', userIdB).single();
    expect(data.onboarding_completed_at).toBeNull(); // RLS scoped the update to 0 rows
  });

  it('regression: the new column grant does not widen access to role/is_super_admin', async () => {
    const email = uniqueEmail('onboard');
    trash.push(email);
    const { client, userId } = await createTestSession(email);

    const roleAttempt = await client.from('profiles').update({ role: 'OWNER' }).eq('id', userId);
    const adminAttempt = await client.from('profiles').update({ is_super_admin: true }).eq('id', userId);
    // Column-level grants make these either an explicit permission error or a
    // silent no-op (0 rows affected) — never a generic/unexpected failure —
    // and never actually change the row (asserted below).
    for (const attempt of [roleAttempt, adminAttempt]) {
      if (attempt.error) {
        expect(attempt.error.code).toMatch(/^(42501|PGRST)/); // permission denied / PostgREST-shaped
      } else {
        expect(attempt.data ?? attempt.count ?? 0).toBeFalsy(); // no rows actually updated
      }
    }

    const { data } = await adminClient
      .from('profiles').select('role, is_super_admin').eq('id', userId).single();
    expect(data.role).toBeNull();
    expect(data.is_super_admin).toBe(false);
  });
});

describe('getProvenance data path: invites self-read RLS', () => {
  let owner;
  const trash = [];

  afterEach(async () => {
    for (const email of trash.splice(0)) await cleanupUser(email);
    await teardownAll(owner);
    owner = null;
  });

  // SKIPPED 2026-07-13: invites.invited_by_email doesn't exist on Lovable's
  // simpler invites table (supabase/migrations/20260713145349_...sql), and
  // its RLS only grants company admins SELECT — not the invitee reading their
  // own row by email, which this self-read path depends on. The hand-authored
  // migration that added both was deleted (never applied to production; it
  // hard-conflicted with Lovable's version on replay). getProvenance() in
  // src/supabase.js still falls back to derivedRole !== 'OWNER' when this
  // query comes back empty, so onboarding degrades rather than breaks.
  it.skip('a recipient can select their own invite by email (enables client-side getProvenance)', async () => {
    owner = await provisionLicenseeWithCompany({ role: 'admin', emailPrefix: 'provowner' });
    await adminClient.from('profiles').update({ role: 'OWNER' }).eq('id', owner.userId);

    const inviteeEmail = uniqueEmail('provinvitee');
    trash.push(inviteeEmail);

    // Tier ≤3 needs no service-line scope, so a plain (no service lines)
    // fixture company works — this test only cares about the self-read path.
    const { error: createErr } = await owner.client.rpc('create_invite', {
      p_company_id: owner.companyId,
      p_email: inviteeEmail,
      p_org_role: 'FINANCE',
      p_service_line_scope: null,
    });
    expect(createErr).toBeNull();

    const { client: inviteeClient } = await createTestSession(inviteeEmail);
    const { data: ownRows, error: readErr } = await inviteeClient
      .from('invites').select('id, org_role, invited_by_email').eq('email', inviteeEmail);
    expect(readErr).toBeNull();
    expect(ownRows.length).toBeGreaterThanOrEqual(1);
    expect(ownRows[0].invited_by_email).toBe(owner.email);
  });

  it('a stranger cannot read another email\'s invite row', async () => {
    owner = await provisionLicenseeWithCompany({ role: 'admin', emailPrefix: 'provowner2' });
    await adminClient.from('profiles').update({ role: 'OWNER' }).eq('id', owner.userId);

    const inviteeEmail = uniqueEmail('provinvitee2');
    trash.push(inviteeEmail);
    await owner.client.rpc('create_invite', {
      p_company_id: owner.companyId,
      p_email: inviteeEmail,
      p_org_role: 'CEO',
      p_service_line_scope: null,
    });

    const strangerEmail = uniqueEmail('stranger');
    trash.push(strangerEmail);
    const { client: strangerClient } = await createTestSession(strangerEmail);

    const { data, error } = await strangerClient
      .from('invites').select('id').eq('email', inviteeEmail);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });
});
