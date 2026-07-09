# Prod release runbook — onboarding persistence rail

**Migration:** `supabase/migrations/20260709120000_onboarding_state.sql`
**Status:** DRAFT — not yet applied to the hosted project.

## Why a runbook

Same reason as [invites.md](invites.md): a migration file committed to this
repo does not auto-apply to the Lovable-hosted Supabase project. This is a
tiny, low-risk hand-authored migration, but it still needs a manual apply step.

## What this migration adds

- `profiles.onboarding_completed_at timestamptz` — nullable, no default.
  Set once by the client (`completeOnboarding()` in `src/supabase.js`) when a
  user finishes or skips the onboarding flow.
- A column-level `GRANT UPDATE (onboarding_completed_at) ON public.profiles TO
  authenticated`. Additive only — migration `20260616184515` already revoked
  table-wide UPDATE and granted `(email)`; this adds one more column to that
  grant list. The `prevent_profile_privilege_escalation` trigger (which guards
  only `role`/`is_super_admin`) is untouched.

No new RLS policy is needed: `"profiles: own row update"` (`auth.uid() = id`)
already scopes this write to the caller's own row.

## Pre-deploy checklist

- [ ] Migration applies cleanly on a fresh `supabase db reset`.
- [ ] `npm run test:integration` green locally (`tests/integration/onboarding.test.js`
      — column exists, own-row write, cross-user write blocked, `role`/
      `is_super_admin` still blocked, invites self-read RLS for `getProvenance`).
- [ ] Frontend PR consuming this column (`getProfile()` select list,
      `completeOnboarding()`, `getProvenance()`) is merged in the same release
      window — until then the column exists but nothing writes to it.

## Apply procedure

1. Open the Supabase dashboard SQL editor for project `qtstzkyycjldlwgiqsgh`
   (or `supabase db push` against the linked project).
2. Run the two-line SQL from `20260709120000_onboarding_state.sql` verbatim.
   It's idempotent (`ADD COLUMN IF NOT EXISTS`), so re-running it is safe.
3. Record the run below.

## Post-deploy smoke checks

- [ ] As any authenticated user: `update profiles set onboarding_completed_at
      = now() where id = auth.uid();` succeeds.
- [ ] The same call against a different user's `id` affects 0 rows.
- [ ] Existing profile flows regress-free: login, `getProfile()` in the app,
      TeamPanel/AdminPanel roster loads (they don't touch this column, but
      confirm no unrelated breakage from the release).

## Down-migration (tested locally before deploy)

```sql
REVOKE UPDATE (onboarding_completed_at) ON public.profiles FROM authenticated;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS onboarding_completed_at;
```

## Deploy log

| Date | Operator | Notes |
|---|---|---|
| — | — | not yet applied |
