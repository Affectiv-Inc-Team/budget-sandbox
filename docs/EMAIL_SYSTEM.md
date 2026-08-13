# Email System

**Status:** Active
**Last updated:** 2026-07-13
**Owners:** Platform / Auth
**Related:** [`AUTH_IMPLEMENTATION.md`](./AUTH_IMPLEMENTATION.md),
[`onboarding-invitation-action-items.md`](./onboarding-invitation-action-items.md),
[`email-queue-functions-migration-spec.md`](./email-queue-functions-migration-spec.md)

This document describes how the app sends every user-facing email — auth
(signup, recovery, magic link, invite, email change, reauth) and app-triggered
team invitations. It is the reference to consult before changing any edge
function, template, migration, or DB helper in the email path.

---

## 1. Sender identity

| Setting | Value |
|---|---|
| Product name (`SITE_NAME`) | `budget-playpen` |
| Root domain (`ROOT_DOMAIN`) | `budget.intrinsic.agency` |
| Sender / bounce domain (`SENDER_DOMAIN`) | `notify.budget.intrinsic.agency` |
| From address | `budget-playpen <noreply@notify.budget.intrinsic.agency>` |
| Provider | Lovable Emails (queue → `sendLovableEmail`) |

DNS for `notify.budget.intrinsic.agency` is managed by Lovable Cloud (SPF /
DKIM / DMARC). Domain status is visible under **Cloud → Emails**. Verification
is required for live delivery; templates can be edited even while DNS is still
verifying.

---

## 2. Architecture at a glance

```
                ┌───────────────────────────────────┐
Auth event ───▶ │ Supabase auth (email/webhook)     │
(signup,        │  → POSTs to auth-email-hook       │
 recovery, …)   └────────────────┬──────────────────┘
                                 │  render React Email → html/text
                                 ▼
App invite ──▶ send-invite  ─┐   pgmq queues:
Manual link ─▶ request-setup-link ─┤ ─ auth_emails
                                 │ ─ transactional_emails
                                 ▼
                       enqueue_email(queue, payload)  (SECURITY DEFINER RPC)
                                 │
                                 │  triggers email_queue_wake() → schedules
                                 │  pg_cron 'process-email-queue' every 5s
                                 │  AND kicks a one-shot net.http_post
                                 ▼
                       process-email-queue edge function
                                 │  read batch → sendLovableEmail → log/DLQ
                                 ▼
                       Lovable Emails → recipient inbox
```

The queue is the single choke point: **every outbound email flows through
`pgmq`** so retries, DLQs, rate limits, and observability are uniform.

---

## 3. Components

### 3.1 Edge functions

All live under `supabase/functions/`.

| Function | `verify_jwt` | Purpose |
|---|---|---|
| `auth-email-hook` | `false` | Receives Supabase auth email events, renders the React Email template, enqueues on `auth_emails`. Also exposes `/preview` for template previews (auth'd with `LOVABLE_API_KEY`). |
| `send-invite` | `true` | App-side team invitation. Calls `create_invite` RPC as the caller (SQL enforces tier/scope), then triggers Supabase Admin `inviteUserByEmail` (or `resetPasswordForEmail` if the account already exists). Both paths land on `/reset-password`. |
| `request-setup-link` | `false` | Self-serve "email me a setup link" for provisioned licensees who have not yet created a password. Guards on: valid email, allowlisted redirect host, licensee row exists. Falls back to recovery if invite fails. |
| `process-email-queue` | `true` | Cron/wake-driven dispatcher. Reads batches from `auth_emails` and `transactional_emails`, calls `sendLovableEmail`, handles 429 (rate limit → `email_send_state.retry_after_until` cooldown) and 403 (→ DLQ), writes `email_send_log` rows. |

### 3.2 Templates

React Email under `supabase/functions/_shared/email-templates/`:
`signup.tsx`, `invite.tsx`, `magic-link.tsx`, `recovery.tsx`,
`email-change.tsx`, `reauthentication.tsx`. Shared styling in `_styles.ts`.

The auth hook selects the template by `payload.data.action_type` (`signup`,
`invite`, `magiclink`, `recovery`, `email_change`, `reauthentication`) and
passes `siteName`, `siteUrl`, `recipient`, `confirmationUrl`, `token`,
`email`, `oldEmail`, `newEmail`.

Subjects are keyed by action type in `EMAIL_SUBJECTS` inside
`auth-email-hook/index.ts`. Update both the template and this map together.

### 3.3 Database objects

| Object | Role |
|---|---|
| `pgmq.q_auth_emails`, `pgmq.q_transactional_emails` | Primary send queues |
| `pgmq.q_auth_emails_dlq`, `pgmq.q_transactional_emails_dlq` | Dead letter (403s, exhausted retries) |
| `public.email_send_log` | Per-message audit (`pending`, `sent`, `failed`, `dlq`) |
| `public.email_send_state` (single row `id=1`) | Global cooldown timer (`retry_after_until`) honored by dispatch to back off on 429s |
| `public.enqueue_email(queue, payload)` | Wraps `pgmq.send`; auto-creates the queue on first use |
| `public.read_email_batch(queue, size, vt)` | Wraps `pgmq.read` with the same auto-create guard |
| `public.delete_email(queue, msg_id)` | Wraps `pgmq.delete` |
| `public.move_to_dlq(src, dlq, id, payload)` | Atomic move + auto-create DLQ |
| `public.email_queue_dispatch()` | Cron job body — checks cooldown, calls `process-email-queue` via `net.http_post`, unschedules itself when both queues drain |
| `public.email_queue_wake()` | Trigger — arms the cron job and fires an immediate one-shot dispatch whenever a message is enqueued. Serialized against `dispatch` via a shared advisory lock so an enqueue racing an unschedule always re-arms |
| `vault.decrypted_secrets` → `email_queue_service_role_key` | Bearer used by dispatch/wake to authenticate to `process-email-queue` |

`email_queue_dispatch` and `email_queue_wake` are currently applied via the
Management API rather than a checked-in migration — see
[`email-queue-functions-migration-spec.md`](./email-queue-functions-migration-spec.md)
for the pending capture-into-SQL work.

### 3.4 Secrets

Read from Edge Function env by the code above; no manual config required in
normal operation.

- `LOVABLE_API_KEY` — auth for `sendLovableEmail`, webhook signature secret
  for `auth-email-hook`, and bearer expected by `process-email-queue`
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` — standard
- `SITE_URL` (optional in `send-invite`, defaults to
  `https://budget.intrinsic.agency`)
- Vault: `email_queue_service_role_key` — used by SQL to call the dispatcher

---

## 4. End-to-end flows

### 4.1 Auth emails (signup / recovery / magic link / email change / reauth)

1. Supabase auth generates the action (e.g. `resetPasswordForEmail` in
   `LoginPage.jsx`).
2. Supabase posts to `auth-email-hook` with a signed webhook payload.
3. The hook verifies signature + timestamp (`@lovable.dev/webhooks-js`),
   renders the matching React Email to HTML **and** plain text, and inserts a
   `pending` row in `email_send_log`.
4. It calls `enqueue_email('auth_emails', payload)`; the `email_queue_wake`
   trigger arms the cron and pings the dispatcher.
5. `process-email-queue` reads the batch, calls `sendLovableEmail`, updates
   `email_send_log` to `sent`/`failed`/`dlq`, and honors any `Retry-After`
   from Lovable Emails by writing `email_send_state.retry_after_until`.

### 4.2 Team invitations (`send-invite`)

Used by the Team management UI. Design intent — the TS layer adds **no
trust**; SQL is the sole authorizer.

1. Caller (with a real session) POSTs `{ company_id, email, org_role,
   service_line_scope }`.
2. The function calls `create_invite(...)` on a **user-scoped** client so the
   tier rule, scope rule, and membership check in
   [`docs/access-levels-and-rights.md`](./access-levels-and-rights.md) all
   execute as the caller.
3. On success, the **service-role** client calls
   `auth.admin.inviteUserByEmail` (new user) or falls back to
   `resetPasswordForEmail` when GoTrue returns `email_exists` /
   `user_already_exists` (existing user or resend). The fallback regex is a
   last-resort backstop against wording changes.
4. Both links land on `/reset-password` (`REDIRECT_TO`). The row in `invites`
   is stamped `sent` (with `email_sent_at`) or `failed`.
5. GoTrue triggers the auth webhook → the rest is the flow in 4.1 with the
   `invite` or `recovery` template.

### 4.3 Self-service setup link (`request-setup-link`)

Shown on `LoginPage` for users who have been provisioned as licensees but
have not yet created a password.

1. Caller POSTs `{ email, redirectTo }`.
2. Function normalizes the email, restricts `redirectTo` to the allowlist
   (`budget.intrinsic.agency`, the preview host, and localhost) with a
   `/reset-password` path, and only proceeds if a matching row exists in
   `public.licensees`. Unknown emails receive `{ ok: false, reason:
   'not_provisioned' }` — no user enumeration.
3. Tries `inviteUserByEmail`, falls back to `resetPasswordForEmail` on
   failure. Both paths route through the auth webhook (§4.1).

---

## 5. Observability & operations

- **Per-message audit:** `select * from public.email_send_log order by
  created_at desc limit 50;`
- **Queue depth:** `select count(*) from pgmq.q_auth_emails;` (same for the
  transactional and DLQ queues).
- **Cooldown active?** `select retry_after_until from public.email_send_state
  where id = 1;` — a future timestamp means dispatch is paused.
- **DLQ inspection:** `select * from pgmq.q_auth_emails_dlq;` — 403s or
  messages that exceeded `MAX_RETRIES = 5` land here with the failure reason
  captured in the matching `email_send_log` row (`status = 'dlq'`).
- **Domain status:** Lovable Cloud → Emails dashboard, or the
  `email_domain--check_email_domain_status` tool.

### Common failure modes

| Symptom | Likely cause | Fix |
|---|---|---|
| Emails stuck `pending` in `email_send_log` | Cron not armed, or `retry_after_until` in the future | Re-enqueue any message to trigger `email_queue_wake`, or wait out the cooldown. Verify the pg_cron `process-email-queue` job exists. |
| Auth hook 500s with `Server configuration error` | `LOVABLE_API_KEY` missing | Restore secret; redeploy `auth-email-hook`. |
| `send-invite` returns 403 | `create_invite` raised `insufficient_privilege` | Caller lacks tier/scope to invite that role. Check `access-levels-and-rights.md`. |
| `send-invite` returns 502 "invite recorded but the email failed" | GoTrue rejected the address, or Lovable Emails 4xx | Inspect edge function logs; the invite row will be `failed` and can be resent. |
| Every send returns 429 → DLQ | Rate limit; cooldown should engage automatically | Confirm `email_send_state.retry_after_until` is being written; if not, the retry-after parsing on the SDK error is stale. |
| Recipient never receives email but log shows `sent` | DNS not verified for `notify.budget.intrinsic.agency` | Check Cloud → Emails; complete DNS. |

---

## 6. Change checklist

When touching this system, update in the same PR:

- Templates in `supabase/functions/_shared/email-templates/` (with a
  `/preview` sanity check via `auth-email-hook`).
- `EMAIL_SUBJECTS` / `EMAIL_TEMPLATES` / `SAMPLE_DATA` in
  `auth-email-hook/index.ts` if you add or rename an action type.
- Any grant/RPC changes in a real migration (do **not** rely on Management
  API edits — see `email-queue-functions-migration-spec.md`).
- This document.

## Invite email history (audit log)

Every invitation and resend attempt is recorded in `public.invite_email_log`:

| Column | Meaning |
|---|---|
| `email` | recipient |
| `company_id` | company the invite/resend was for (null for self-service login-page requests) |
| `kind` | `invite` (first send via `send-invite`) or `resend` (via `request-setup-link`) |
| `email_action` | `invite` or `recovery` — which auth email GoTrue actually sent |
| `status` | `sent`, `failed`, or `skipped` (address not provisioned) |
| `error_message` | provider/auth error when the send failed |
| `triggered_by` / `triggered_by_email` | the signed-in admin who clicked; `self-service` when the recipient requested it from the login page |
| `created_at` | timestamp of the attempt |

Writes happen in the edge functions with the service role and are best-effort —
a logging failure never blocks the email. Reads are RLS-gated: super admins see
everything, company admins see rows for their companies' people.

UI: `src/components/InviteEmailHistory.jsx` — rendered at the bottom of the
Admin panel (all companies) and the Team panel (scoped to the selected company),
with recipient/sender search, outcome filter, and refresh.
