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
  // serviceLineScope accepts a single id, an array of ids, or null. Multiple
  // ids are persisted as a comma-separated list in invites.service_line_scope.
  const scope = Array.isArray(serviceLineScope)
    ? (serviceLineScope.filter(Boolean).join(',') || null)
    : (serviceLineScope || null);
  const { data, error } = await supabase.functions.invoke('send-invite', {
    body: {
      company_id: companyId,
      email: normalizedEmail,
      org_role: orgRole,
      service_line_scope: scope,
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
    const waitSeconds = Number(data.retryAfterSeconds);
    return {
      ok: false,
      error:
        data.reason === 'not_provisioned'
          ? 'That address has no access yet — assign them to a company first.'
          : data.reason === 'rate_limited'
            ? `An email was already requested. Wait ${Number.isFinite(waitSeconds) ? waitSeconds : 60} seconds, then try again.`
          : 'Unable to send the setup link.',
    };
  }

  return { ok: true };
}

/**
 * Invite/resend email history. RLS limits rows to companies the caller admins
 * (super admins see everything). Optional filters: companyId, email.
 * Returns an array of log rows, newest first.
 */
export async function fetchInviteEmailHistory({ companyId = null, email = null, limit = 200 } = {}) {
  let q = supabase
    .from('invite_email_log')
    .select('id, email, company_id, kind, email_action, status, error_message, triggered_by_email, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (companyId) q = q.eq('company_id', companyId);
  if (email) q = q.eq('email', String(email).trim().toLowerCase());

  const { data, error } = await q;
  if (error) {
    console.error('fetchInviteEmailHistory error:', error);
    return { rows: [], error: error.message };
  }
  return { rows: data || [], error: null };
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
 *
 * Uses UPDATE (not upsert) per company: companies are provisioned by super
 * admins, so normal members only ever hold UPDATE rights under RLS. An upsert
 * asks PostgREST for INSERT rights too, which made every save fail for
 * non-super-admin editors (e.g. Program Managers editing a home mix).
 *
 * Rows the caller cannot edit are skipped silently by RLS (0 rows affected);
 * that is not treated as an error so a read-only company in the portfolio
 * doesn't block saving the ones they can edit.
 */
export async function saveConfig(config) {
  if (!config?.companies) return false;

  const results = await Promise.all(
    config.companies.map(co =>
      supabase
        .from('companies')
        .update({
          name: co.name,
          archived: co.archived ?? false,
          config: { shared: co.shared, serviceLines: co.serviceLines },
        })
        .eq('id', co.id)
        .select('id'),
    ),
  );

  const failure = results.find(r => r.error);
  if (failure) {
    console.error('saveConfig error:', failure.error);
    posthog.captureException(failure.error, { endpoint: 'saveConfig', error_code: failure.error.code });
    return false;
  }

  // Nothing was writable at all — surface it rather than showing a false "Saved".
  const wrote = results.reduce((n, r) => n + (r.data?.length ?? 0), 0);
  if (wrote === 0) {
    console.error('saveConfig: no company rows were writable for this user');
    return false;
  }

  return true;
}

/**
 * Latest delivery record per recipient from the mail send log.
 * Admin-scoped server-side (super admins see all; company admins see their
 * members). Returns a map keyed by lowercased email:
 *   { status, templateName, errorMessage, sentAt }
 */
export async function fetchEmailDeliveryStatus() {
  const { data, error } = await supabase.rpc('admin_email_delivery_status');
  if (error) return {};
  const map = {};
  for (const row of data ?? []) {
    map[String(row.email).toLowerCase()] = {
      status: row.status,
      templateName: row.template_name,
      errorMessage: row.error_message,
      sentAt: row.sent_at,
    };
  }
  return map;
}

/**
 * Admin-initiated password reset for a member.
 * mode: 'email' — send them a reset code/link
 *       'temp'  — generate a one-time password, returned once as tempPassword
 * Authorization is enforced server-side (super admin, or company admin of a
 * company the target belongs to). Returns { ok, tempPassword?, error }.
 */
export async function adminResetPassword({ email, mode, companyId = null }) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) return { ok: false, error: 'An email address is required.' };

  const { data, error } = await supabase.functions.invoke('admin-reset-password', {
    body: { email: normalizedEmail, mode, company_id: companyId || undefined },
  });

  if (error) {
    let message = error.message;
    try {
      const body = await error.context?.json?.();
      if (body?.error) message = body.error;
    } catch { /* keep the generic message */ }
    posthog.capture('admin_password_reset_failed', { mode });
    return { ok: false, error: message };
  }

  posthog.capture('admin_password_reset', { mode });
  return { ok: true, tempPassword: data?.tempPassword };
}
