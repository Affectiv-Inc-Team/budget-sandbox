import { createClient } from '@supabase/supabase-js';
import posthog from './lib/posthog.js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─── Config persistence ───────────────────────────────────────────────────────
// The v2 config blob is split across rows in `companies`. Each company gets its
// own row: { id, name, archived, config: { shared, serviceLines } }.
// UI navigation state (selectedCompanyId, selectedServiceLineId) is NOT persisted
// to Supabase — it's derived client-side on load (default to first company).

/**
 * Load all companies the current user has access to.
 * Returns them shaped as a v2 config blob so FinancialTool.jsx needs no changes.
 */
export async function loadConfig() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;

  const { data, error } = await supabase
    .from('companies')
    .select('id, name, archived, config')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('loadConfig error:', error);
    posthog.captureException(error, { endpoint: 'loadConfig', error_code: error.code });
    posthog.capture('config_load_failed', { error_message: error.message, error_code: error.code });
    return null;
  }

  if (!data || data.length === 0) return null;

  const companies = data.map(row => ({
    id: row.id,
    name: row.name,
    archived: row.archived,
    shared: row.config.shared ?? {},
    serviceLines: row.config.serviceLines ?? [],
  }));

  return {
    version: 2,
    selectedCompanyId: companies[0].id,
    selectedServiceLineId: null,
    companies,
  };
}

/**
 * Load the current user's profile row from `profiles`.
 * Returns null if not signed in or row missing.
 * Note: `role` column is Track B — will be undefined until then.
 */
export async function getProfile() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;
  const { data } = await supabase
    .from('profiles')
    .select('id, email, is_super_admin, role, onboarding_completed_at')
    .eq('id', session.user.id)
    .single();
  return data ?? null;
}

// ─── Onboarding ─────────────────────────────────────────────────────────────

/**
 * Mark the current user's onboarding as complete (own-row write; RLS-scoped).
 * Returns true on success.
 */
export async function completeOnboarding() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return false;
  const { error } = await supabase
    .from('profiles')
    .update({ onboarding_completed_at: new Date().toISOString() })
    .eq('id', session.user.id);
  if (error) {
    console.error('completeOnboarding error:', error);
    posthog.captureException(error, { endpoint: 'completeOnboarding', error_code: error.code });
    return false;
  }
  return true;
}

/**
 * How the current user came to have access — the signal onboarding uses to
 * tell an Owner bootstrapping a brand-new company from a teammate invited
 * into one that already exists.
 *
 * Primary signal: an `invites` row for the caller's own email (self-read RLS
 * — see the invites migration). Its presence means someone invited this
 * person into an existing company; Owners are SuperAdmin-provisioned and are
 * never the subject of an invites row.
 *
 * Fallback (query error, or a pre-Phase-1 account with no invites row):
 * derived role !== OWNER. Bootstrap onboarding steps are additionally gated
 * on live state (company count, service-line count), so a misclassification
 * here is benign — worst case is a step that re-validates itself away.
 *
 * Returns { kind: 'owner' } or { kind: 'invited', invitedByEmail, role, serviceLineScope }.
 */
export async function getProvenance(derivedRole) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user?.email) return { kind: 'owner' };

  const { data, error } = await supabase
    .from('invites')
    .select('invited_by_email, org_role, service_line_scope, created_at')
    .eq('email', session.user.email.toLowerCase())
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) {
    console.error('getProvenance error:', error);
    posthog.captureException(error, { endpoint: 'getProvenance', error_code: error.code });
    return derivedRole !== 'OWNER'
      ? { kind: 'invited', invitedByEmail: null, role: derivedRole, serviceLineScope: null }
      : { kind: 'owner' };
  }

  const invite = data?.[0];
  if (invite) {
    return {
      kind: 'invited',
      invitedByEmail: invite.invited_by_email,
      role: invite.org_role,
      serviceLineScope: invite.service_line_scope,
    };
  }

  return derivedRole !== 'OWNER'
    ? { kind: 'invited', invitedByEmail: null, role: derivedRole, serviceLineScope: null }
    : { kind: 'owner' };
}

// ─── Team invitations ────────────────────────────────────────────────────────

/**
 * Send an owner-delegated invite via the send-invite edge function.
 * The tier rule / scope rule / membership check are enforced server-side by
 * the create_invite RPC (as the caller); the function then emails the invitee.
 * Returns { ok, inviteId, emailAction, error } — error is a human-readable
 * message when ok is false.
 */
export async function sendInvite({ companyId, email, orgRole, serviceLineScope = null }) {
  const normalizedEmail = email.trim().toLowerCase();
  const { data, error } = await supabase.functions.invoke('send-invite', {
    body: {
      company_id: companyId,
      email: normalizedEmail,
      org_role: orgRole,
      service_line_scope: serviceLineScope,
    },
  });

  if (error) {
    // Non-2xx responses carry the real message in the JSON body.
    let message = error.message;
    try {
      const body = await error.context?.json?.();
      if (body?.error) message = body.error;
    } catch { /* keep the generic message */ }
    // GoTrue error text can embed the invitee's email (e.g. "unable to send
    // invite to x@y.com") — this project has no PostHog BAA, so no PII may
    // reach it. Redact before capturing; the full message still goes to the
    // caller for on-screen display.
    const emailPattern = new RegExp(normalizedEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    posthog.capture('invite_send_failed', {
      error_message: message.replace(emailPattern, '[redacted-email]'),
    });
    return { ok: false, error: message };
  }

  return { ok: true, inviteId: data?.invite_id, emailAction: data?.email_action };
}

/**
 * Resend the account-setup / sign-in email to somebody who already has access
 * (a provisioned licensee or an invited teammate) but never got the first one.
 * Uses the request-setup-link edge function: invite email for accounts that
 * don't exist yet, recovery link for ones that do.
 * Returns { ok, error }.
 */
export async function resendSetupLink(email, companyId = null) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) return { ok: false, error: 'An email address is required.' };

  const redirectTo =
    typeof window !== 'undefined' ? `${window.location.origin}/reset-password` : undefined;

  const { data, error } = await supabase.functions.invoke('request-setup-link', {
    body: { email: normalizedEmail, redirectTo, companyId: companyId || undefined },
  });


  if (error) {
    let message = error.message;
    try {
      const body = await error.context?.json?.();
      if (body?.error) message = body.error;
    } catch { /* keep the generic message */ }
    posthog.capture('setup_link_resend_failed', { error_message: message });
    return { ok: false, error: message };
  }

  if (data && data.ok === false) {
    return {
      ok: false,
      error:
        data.reason === 'not_provisioned'
          ? 'That address has no access yet — assign them to a company first.'
          : 'Unable to send the setup link.',
    };
  }

  return { ok: true };
}

/**
 * The caller's own company memberships: access level + service-line scope.
 * Returns { [companyId]: { accessRole, serviceLineScope } }.
 * serviceLineScope null = whole company.
 */
export async function getMyCompanyScopes() {
  const { data, error } = await supabase.rpc('get_my_company_scopes');
  if (error) {
    console.error('getMyCompanyScopes error:', error);
    posthog.captureException(error, { endpoint: 'getMyCompanyScopes', error_code: error.code });
    return {};
  }
  return Object.fromEntries(
    (data ?? []).map((row) => [
      row.company_id,
      { accessRole: row.access_role, serviceLineScope: row.service_line_scope },
    ]),
  );
}

/**
 * Save the full v2 config blob back to Supabase.
 * Upserts each company row individually.
 */
export async function saveConfig(config) {
  if (!config?.companies) return false;

  const rows = config.companies.map(co => ({
    id: co.id,
    name: co.name,
    archived: co.archived ?? false,
    config: {
      shared: co.shared,
      serviceLines: co.serviceLines,
    },
  }));

  const { error } = await supabase
    .from('companies')
    .upsert(rows, { onConflict: 'id' });

  if (error) {
    console.error('saveConfig error:', error);
    posthog.captureException(error, { endpoint: 'saveConfig', error_code: error.code });
    return false;
  }

  return true;
}
