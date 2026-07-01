# Security Audit — Intrinsic

Date: 2026-07-01

Scope: full repository (React/Vite frontend, Supabase backend, PostHog analytics,
migrations, CI, dependencies). Four parallel deep-dives were run: authentication/
authorization/RLS, injection/input-handling, secrets/config/dependencies, and
crypto/data-exposure/business-logic.

---

## Critical

### 1. Client-side call to the Anthropic API with no key, no auth, no server mediation
**File:** [src/pages/FinancialTool.jsx:1885-1894](../src/pages/FinancialTool.jsx#L1885) (`FAQTab` → `sendMessage`)

```js
const res = await fetch("https://api.anthropic.com/v1/messages", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ model: "claude-sonnet-4-20250514", ..., messages: nextMessages })
});
```

No `x-api-key`/`Authorization` header is sent anywhere in this function or file. As shipped
this just 401s (dead feature), but it also means:

- Whatever a user types into "Ask AI" — which could include a participant's name or ISP
  details — leaves the browser toward a third-party endpoint with none of the PostHog-style
  PHI masking applied elsewhere in the app, and no BAA in scope.
- If anyone "fixes" this by dropping an API key into the frontend, that key ships in the
  bundle and becomes a public, unmetered relay any authenticated user can extract and abuse.

**Fix:** Move this behind a Supabase Edge Function or backend proxy that holds the key
server-side, enforces auth + rate limits, and never forwards it to the client.

---

## High

### 2. Tenant-scoping RLS join is keyed on a mutable, case-sensitive text match
**File:** `supabase/migrations/20260615201552_...sql:61-71, 139-152`

Every access-control function (`has_company_access`, `can_edit_company`) joins on
`p.email = l.name` instead of a real foreign key. `grant update (email) on public.profiles to
authenticated` has no verification tie-in. Once the Track B RLS over-restriction (see #3 below
in the report history) is fixed to actually let editors reach their companies, this becomes a
live path: a user could rename their own `profiles.email` to match another licensee's `name`
string and inherit that licensee's company access. Flagged now specifically because "fixing"
the current bug the naive way reopens this hole — the two need to be fixed together.

**Fix:** Replace the email-string join with a proper `licensee_id`/`user_id` FK populated at
provisioning time, not derived from user-editable email.

### 3. `companies` table granted SELECT to the unauthenticated `anon` role
**File:** `supabase/migrations/20260615201552_...sql:92,436`

Not currently exploitable (RLS predicates evaluate to no-rows for `auth.uid() = null`), but
it's an unnecessary grant with no subquery justification, and a single future policy
regression turns it into an unauthenticated full-table read of business-financial data.

**Fix:** `revoke select on public.companies from anon;`

### 4. Role-tier gating (wage/dollar visibility) is UI-only, not enforced by RLS
**File:** [src/lib/access.js](../src/lib/access.js)

Drives `canSeeCompanyDollars`/wage masking purely in React. RLS on `companies` only checks
licensee-vs-company, never `profiles.role`/tier. Any authenticated user with access to a
company can call `supabase.from('companies').select('config')` directly and get full unmasked
wages/salaries/owner-rate data that their tier is supposed to have hidden in the UI.

**Fix:** Confirm with product whether this is an accepted "soft" internal-visibility feature
or an intended security boundary — if the latter, add a server-side view/RPC that strips
gated fields per `profile_role_tier()`.

### 5. No CSP anywhere in the repo, and no infra config to confirm headers exist at deploy layer
`index.html` has no CSP meta tag, and there's no Dockerfile/nginx/ECS task-def in-repo to
verify headers are set at the ALB/CloudFront layer. Given this app renders PHI-adjacent
financial data client-side, this is worth confirming or adding as defense-in-depth (the
injection audit found no active XSS vector today, but CSP is the backstop for the next one).

**Fix:** Confirm CSP/security headers are set at the ECS/ALB/CloudFront layer; if not, add a
CSP meta tag as a baseline and proper headers at the reverse-proxy layer.

### 6. `saveConfig` is a blind last-write-wins upsert — no optimistic locking
**File:** [src/supabase.js:75-99](../src/supabase.js#L75)

Upserts the full config blob keyed only on `id`, no `updated_at`/version check. Two concurrent
editors on the same company silently clobber each other with no conflict warning and no audit
trail (unlike the referral tracker, which has `referral_audit_log`). This is a data-integrity
risk in a tool whose numbers drive real staffing/billing decisions.

**Fix:** Add an `updated_at`/version column, pass it back on save, and reject/warn on stale
writes.

---

## Medium

### 7. `dompurify` ≤3.4.10 — moderate CVE
GHSA-cmwh-pvxp-8882, attribute-pollution XSS, pulled in transitively via `posthog-js`. Fix
available (`npm audit fix` / bump `posthog-js`).

### 8. `.gitignore` covers only `.env`/`.env.local`, not `.env*`
Nothing stops a future `.env.production` from being committed by accident.

**Fix:** Switch to `.env*` with an explicit `!.env.e2e` allow-line.

### 9. `AdminPanel.jsx` is currently an empty stub with no route wired in `App.jsx`
Not exploitable today, but flagging for Track B: the eventual SuperAdmin route must check
`is_super_admin` server-side, not just client `effectiveRole`/`devRole` state.

### 10. PostHog initializes unconditionally, including in local dev
Dev sessions get sent to the live production PostHog project. Low risk (masking is otherwise
solid: `maskAllInputs`, blanket text masking, no request/response body capture) but worth
gating to prod-only.

---

## Low / Informational

- **Dev-toolchain CVEs** (vitest/vite/esbuild — arbitrary file read via Vitest UI, dev-server
  request forgery, path traversal) are real but confined to `devDependencies`; not reachable
  in the deployed app. Plan as a routine major-version bump, not urgent.
- **Local `.env` password hygiene**: real plaintext password + PostHog key live in the
  developer's untracked `.env` — never committed to git, but was materialized into an audit
  subagent's transcript during this review. Recommend rotating.
- **`Math.random()` fallback for ID generation** (`companyShape.js`) is fine — IDs are display
  identifiers, not access-control capabilities; `crypto.randomUUID()` is used whenever
  available.

---

## Verified clean — no action needed

- **Injection**: zero findings across SQL/RPC injection, XSS, SSRF, open redirect, template
  injection, command injection, CSV injection. Supabase-js usage is consistently parameterized
  (`.eq()`/`.insert()`/`.upsert()`, never string-built `.or()`/`.filter()`); all
  `SECURITY DEFINER` functions pin `search_path` and use typed params, no dynamic SQL.
- **SSN handling**: encrypted at rest via `pgp_sym_encrypt` + Supabase Vault key, never
  touched directly by the client, gated by role-tier check inside the RPC, every reveal/set
  audit-logged. Solid design.
- **Prior privilege-escalation bug already fixed**: `profiles` self-elevation of
  `role`/`is_super_admin` was caught and patched with column-level grants + a trigger +
  `WITH CHECK (auth.uid() = id)`.
- **Git history**: no service-role key, DB password, AWS key, or real JWT secret was ever
  committed (checked via full-history pickaxe search). `.env.e2e`'s committed key is the
  well-known public Supabase CLI local-dev demo key.
- **Frontend/backend key separation**: no service-role key is ever referenced via a
  `VITE_`-prefixed variable; only the anon key reaches the bundle.
- **Session storage**: Supabase's standard `localStorage` SPA pattern — acceptable given no
  httpOnly-cookie bridge exists.

---

## Priority order to fix

1. Anthropic API exposure (#1) — remove or proxy immediately, it's either dead or a live abuse
   vector.
2. RLS tenant-join + anon grant (#2, #3) — fix together before Track B ships working licensee
   access, or the "fix" reopens an escalation path.
3. Role-tier server enforcement decision (#4) and CSP (#5) — architectural decisions worth a
   deliberate call.
4. Optimistic locking on saveConfig (#6) — data-integrity fix.
5. dompurify bump, `.gitignore` wildcard, AdminPanel route guard (#7-9) — quick, low-effort
   fixes.
6. PostHog dev-gating, dev-toolchain CVE bumps, `.env` password rotation — routine hygiene.
