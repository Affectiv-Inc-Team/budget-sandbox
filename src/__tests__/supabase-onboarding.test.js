// Unit tests for the onboarding helpers in src/supabase.js.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetSession = vi.fn();
const mockFrom = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getSession: (...a) => mockGetSession(...a) },
    from: (...a) => mockFrom(...a),
    functions: { invoke: vi.fn() },
    rpc: vi.fn(),
  }),
}));

vi.mock('../lib/posthog.js', () => ({
  default: { capture: vi.fn(), captureException: vi.fn() },
}));

const { completeOnboarding, getProvenance } = await import('../supabase.js');

function fromResult(result) {
  const chain = {
    select: () => chain,
    update: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: () => Promise.resolve(result),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  return chain;
}

beforeEach(() => {
  mockGetSession.mockReset();
  mockFrom.mockReset();
});

// ──────────────────────────────────────────────────────────────────────
// completeOnboarding
// ──────────────────────────────────────────────────────────────────────

describe('completeOnboarding', () => {
  it('returns false with no session, without touching the network', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    expect(await completeOnboarding()).toBe(false);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('updates the caller\'s own row and returns true on success', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'u1', email: 'a@b.co' } } } });
    let capturedUpdate = null;
    mockFrom.mockImplementation(() => {
      const chain = {
        update: (payload) => { capturedUpdate = payload; return chain; },
        eq: () => Promise.resolve({ error: null }),
      };
      return chain;
    });
    expect(await completeOnboarding()).toBe(true);
    expect(capturedUpdate).toHaveProperty('onboarding_completed_at');
    expect(typeof capturedUpdate.onboarding_completed_at).toBe('string');
  });

  it('returns false on a write error', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
    mockFrom.mockImplementation(() => {
      const chain = { update: () => chain, eq: () => Promise.resolve({ error: { message: 'denied' } }) };
      return chain;
    });
    expect(await completeOnboarding()).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────
// getProvenance
// ──────────────────────────────────────────────────────────────────────

describe('getProvenance', () => {
  it('no session → owner (never queries invites)', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    expect(await getProvenance('OWNER')).toEqual({ kind: 'owner' });
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('an invites row for the caller\'s email → invited, with its details', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { user: { email: 'Teammate@Test.Local' } } },
    });
    mockFrom.mockImplementation(() =>
      fromResult({
        data: [{
          invited_by_email: 'owner@test.local',
          org_role: 'REGIONAL_DIRECTOR',
          service_line_scope: 'sl_tsc1',
          created_at: '2026-07-01T00:00:00Z',
        }],
        error: null,
      }),
    );
    const result = await getProvenance('REGIONAL_DIRECTOR');
    expect(result).toEqual({
      kind: 'invited',
      invitedByEmail: 'owner@test.local',
      role: 'REGIONAL_DIRECTOR',
      serviceLineScope: 'sl_tsc1',
    });
  });

  it('no invites row and role !== OWNER → invited (fallback), null inviter', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { email: 'x@test.local' } } } });
    mockFrom.mockImplementation(() => fromResult({ data: [], error: null }));
    const result = await getProvenance('CEO');
    expect(result).toEqual({ kind: 'invited', invitedByEmail: null, role: 'CEO', serviceLineScope: null });
  });

  it('no invites row and role === OWNER → owner', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { email: 'owner@test.local' } } } });
    mockFrom.mockImplementation(() => fromResult({ data: [], error: null }));
    expect(await getProvenance('OWNER')).toEqual({ kind: 'owner' });
  });

  it('query error falls back on role, same as a missing row', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { email: 'x@test.local' } } } });
    mockFrom.mockImplementation(() => fromResult({ data: null, error: { message: 'boom', code: '500' } }));

    const invited = await getProvenance('HOUSE_LEAD');
    expect(invited).toEqual({ kind: 'invited', invitedByEmail: null, role: 'HOUSE_LEAD', serviceLineScope: null });

    const owner = await getProvenance('OWNER');
    expect(owner).toEqual({ kind: 'owner' });
  });
});
