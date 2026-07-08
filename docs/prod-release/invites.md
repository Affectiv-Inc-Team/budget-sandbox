# Prod release runbook — Owner-delegated invitations backend

**Migration:** `supabase/migrations/20260708190000_invites.sql`
**Status:** DRAFT — not yet applied to the hosted project.

## Why a runbook

A migration file committed to this repo does **not** auto-apply to the
Lovable-hosted Supabase project. Lovable-originated migrations are applied by
Lovable to its cloud DB first and then committed; hand-authored migrations (this
one, like `20260702204509_email_infra.sql`) must be applied to the hosted
project manually. CI only runs migrations against the local Docker instance.

## What this migration adds

- `public.invites` table (audit + status of every owner-delegated invite) with
  RLS: readable by super admins, company admins, the inviter, and the recipient
  (own email); writable only via SECURITY DEFINER RPCs.
- `licensee_companies.service_line_scope` (nullable text; NULL = whole company).
- Helpers `role_tier(text)`, `can_invite_role(text)` — the server-side tier
  rule: Owner invites any tier incl. Owner; everyone else strictly below own.
- RPCs: `create_invite`, `revoke_invite`, `get_my_company_scopes`,
  `admin_list_invites`.
- Replaces `set_member_org_role` (adds tier-rule enforcement) and
  `get_company_member_status` (**DROP + CREATE** — return type gains
  `access_role`, `service_line_scope`, `invite_status`, `invited_at`; gate
  loosened from company-admin to any company member).

## Pre-deploy checklist

- [ ] Migration applies cleanly on a fresh `supabase db reset` (verified in CI
      `integration` job on the merge commit).
- [ ] `npm run test:integration` green locally (57 tests incl. 29 invite tests:
      tier rule, scope rule, lifecycle, RLS, roster/scope RPCs).
- [ ] Frontend PRs that consume the new `get_company_member_status` return type
      (TeamPanel rewrite) are merged in the same release window — the old
      TeamPanel tolerates the RPC error but will show an empty roles map until
      then.
- [ ] `/reset-password` is in the hosted project's Auth redirect allow-list
      (needed by the `send-invite` edge function, next PR).

## Apply procedure

1. Open the Supabase dashboard SQL editor for project `qtstzkyycjldlwgiqsgh`
   (or use `supabase db push` with the linked project).
2. Paste and run the **byte-identical** contents of
   `supabase/migrations/20260708190000_invites.sql`. The file is idempotent
   (`IF NOT EXISTS` / `CREATE OR REPLACE` / `DROP POLICY IF EXISTS` guards), so
   re-running it is safe.
3. Record the run (date, operator) at the bottom of this file.

The `send-invite` edge function ships in a follow-up PR and has its own deploy
step (`supabase functions deploy send-invite --project-ref qtstzkyycjldlwgiqsgh`);
until it is deployed, the invites backend is inert in production.

## Post-deploy smoke checks

- [ ] As a company-admin licensee with `profiles.role = 'OWNER'`:
      `select create_invite('<company_id>', 'smoke-test@intrinsic.agency', 'CEO');`
      returns a uuid; the row appears in `invites` with status `pending`;
      the licensee + membership rows exist.
- [ ] As the same user with `profiles.role = 'CEO'`: the same call with
      `p_org_role => 'OWNER'` fails with `insufficient_privilege`.
- [ ] `select * from get_my_company_scopes();` as a licensee returns their rows.
- [ ] `select revoke_invite('<invite_id>');` flips status to `revoked` and
      removes the membership row.
- [ ] Existing flows regress-free: TeamPanel loads, `get_company_member_status`
      returns rows for an admin, saving a company config still works.
- [ ] Clean up the smoke rows (`delete from invites where email like 'smoke-%'`,
      plus the licensee/membership rows).

## Down-migration (tested locally before deploy)

```sql
DROP FUNCTION IF EXISTS public.admin_list_invites();
DROP FUNCTION IF EXISTS public.get_my_company_scopes();
DROP FUNCTION IF EXISTS public.revoke_invite(uuid);
DROP FUNCTION IF EXISTS public.create_invite(text, text, text, text);
DROP FUNCTION IF EXISTS public.can_invite_role(text);
DROP FUNCTION IF EXISTS public.role_tier(text);
DROP FUNCTION IF EXISTS public.get_company_member_status(text);
ALTER TABLE public.licensee_companies DROP COLUMN IF EXISTS service_line_scope;
DROP TABLE IF EXISTS public.invites;
-- Then restore the previous set_member_org_role and get_company_member_status
-- bodies by re-running sections 3 and 4 of
-- supabase/migrations/20260702203339_7b244b22-a1ee-4ea7-be42-a0504abadf1a.sql.
```

## Deploy log

| Date | Operator | Notes |
|---|---|---|
| — | — | not yet applied |
