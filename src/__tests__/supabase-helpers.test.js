// Unit tests for the invitation helpers in src/supabase.js — the module-level
// client is replaced by mocking @supabase/supabase-js before import.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockInvoke = vi.fn();
const mockRpc = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    functions: { invoke: mockInvoke },
    rpc: mockRpc,
    auth: { getSession: vi.fn() },
    from: vi.fn(),
  }),
}));

vi.mock('../lib/posthog.js', () => ({
  default: { capture: vi.fn(), captureException: vi.fn() },
}));

const { sendInvite, getMyCompanyScopes } = await import('../supabase.js');

beforeEach(() => {
  mockInvoke.mockReset();
  mockRpc.mockReset();
});

// ──────────────────────────────────────────────────────────────────────
// sendInvite
// ──────────────────────────────────────────────────────────────────────

describe('sendInvite', () => {
  it('normalizes the email and posts the expected body to send-invite', async () => {
    mockInvoke.mockResolvedValue({
      data: { invite_id: 'uuid-1', email_action: 'invite' },
      error: null,
    });

    const result = await sendInvite({
      companyId: 'co_1',
      email: '  Casey.L@Sawtooth.ORG ',
      orgRole: 'REGIONAL_DIRECTOR',
      serviceLineScope: 'sl_tsc1',
    });

    expect(mockInvoke).toHaveBeenCalledWith('send-invite', {
      body: {
        company_id: 'co_1',
        email: 'casey.l@sawtooth.org',
        org_role: 'REGIONAL_DIRECTOR',
        service_line_scope: 'sl_tsc1',
      },
    });
    expect(result).toEqual({ ok: true, inviteId: 'uuid-1', emailAction: 'invite' });
  });

  it('defaults service_line_scope to null for whole-company invites', async () => {
    mockInvoke.mockResolvedValue({ data: { invite_id: 'x', email_action: 'invite' }, error: null });
    await sendInvite({ companyId: 'co_1', email: 'a@b.co', orgRole: 'CEO' });
    expect(mockInvoke.mock.calls[0][1].body.service_line_scope).toBeNull();
  });

  it('surfaces the JSON error body from a non-2xx response', async () => {
    mockInvoke.mockResolvedValue({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code',
        context: { json: async () => ({ error: 'your role cannot invite tier 1 (OWNER)' }) },
      },
    });

    const result = await sendInvite({ companyId: 'co_1', email: 'a@b.co', orgRole: 'OWNER' });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('your role cannot invite tier 1 (OWNER)');
  });

  it('falls back to the generic message when no JSON body is available', async () => {
    mockInvoke.mockResolvedValue({
      data: null,
      error: { message: 'Failed to send a request to the Edge Function' },
    });

    const result = await sendInvite({ companyId: 'co_1', email: 'a@b.co', orgRole: 'CEO' });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('Failed to send a request to the Edge Function');
  });

  it('redacts the invitee email from the PostHog capture but keeps it in the returned error', async () => {
    const posthog = (await import('../lib/posthog.js')).default;
    mockInvoke.mockResolvedValue({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code',
        context: {
          json: async () => ({
            error: 'invite recorded but the email failed to send: unable to deliver to casey.l@sawtooth.org',
          }),
        },
      },
    });

    const result = await sendInvite({ companyId: 'co_1', email: 'Casey.L@Sawtooth.org', orgRole: 'CEO' });

    expect(result.error).toContain('casey.l@sawtooth.org'); // caller still sees the full message
    const [, payload] = posthog.capture.mock.calls.at(-1);
    expect(payload.error_message).not.toContain('casey.l@sawtooth.org');
    expect(payload.error_message).toContain('[redacted-email]');
  });
});

// ──────────────────────────────────────────────────────────────────────
// getMyCompanyScopes
// ──────────────────────────────────────────────────────────────────────

describe('getMyCompanyScopes', () => {
  it('maps RPC rows into a companyId-keyed object', async () => {
    mockRpc.mockResolvedValue({
      data: [
        { company_id: 'co_1', access_role: 'editor', service_line_scope: 'sl_tsc1' },
        { company_id: 'co_2', access_role: 'admin', service_line_scope: null },
      ],
      error: null,
    });

    const scopes = await getMyCompanyScopes();
    expect(mockRpc).toHaveBeenCalledWith('get_my_company_scopes');
    expect(scopes).toEqual({
      co_1: { accessRole: 'editor', serviceLineScope: 'sl_tsc1' },
      co_2: { accessRole: 'admin', serviceLineScope: null },
    });
  });

  it('returns an empty object on RPC error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'boom', code: '500' } });
    expect(await getMyCompanyScopes()).toEqual({});
  });

  it('returns an empty object for an empty membership list', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    expect(await getMyCompanyScopes()).toEqual({});
  });
});
