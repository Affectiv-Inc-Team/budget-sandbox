# Spec: Commit real `email_queue_dispatch()` / `email_queue_wake()` definitions

**Branch:** `fix/email-queue-real-functions` (suggested)
**Depends on:** [PR #42](https://github.com/Affectiv-Inc-Team/budget-sandbox/pull/42) (workaround, should land first)
**Status:** Not started

---

## 1. Background

`supabase/migrations/20260709162106_ae3cab4b-ebc8-497f-9552-3907a7569400.sql` contains
`REVOKE`/`GRANT EXECUTE` statements for `public.email_queue_dispatch()` and
`public.email_queue_wake()`, but neither function is defined by a `CREATE FUNCTION` anywhere
in `supabase/migrations/`. This broke `supabase db reset` locally with:

```
ERROR: function public.email_queue_dispatch() does not exist (SQLSTATE 42883)
```

PR #42 is a **workaround**, not a fix: it comments out the two REVOKE/GRANT pairs so local
`db reset` / `npm run test:integration` succeed. Production still has these two functions —
they were applied directly via the Lovable Management API (see the "POST-MIGRATION STEPS"
comment block at the bottom of
[`20260702204509_email_infra.sql`](../supabase/migrations/20260702204509_email_infra.sql#L282-L303))
and never captured as SQL. This spec is the follow-up: pull the real definitions and commit
them as a proper migration so local schema matches production.

Evidence gathered so far:
- `email_queue_dispatch()` shows up in the Lovable-generated
  `src/integrations/supabase/types.ts:645` (`Args: never; Returns: undefined`) — confirms it's
  real in prod.
- `email_queue_wake()` does **not** appear in `types.ts` — consistent with it being a
  trigger-only function (`RETURNS trigger`), which Supabase's type generator omits. It's grouped
  under "Trigger-only functions: no client access needed" in the REVOKE list.
- Neither function is called from `src/` or `tests/` — confirmed via
  `grep -rln "email_queue_dispatch\|email_queue_wake" tests/ src/ supabase/functions/`. Only
  hit was the generated `types.ts`. So this is purely a cron/trigger-internal pair; no
  app-facing behavior to preserve in tests beyond what the migration itself defines.
- The `email_infra.sql` post-migration comment describes the intended dispatch logic: check
  `email_send_state.retry_after_until` cooldown, check whether `auth_emails` /
  `transactional_emails` pgmq queues have messages, and if so call the `process-email-queue`
  edge function via `net.http_post` using the vault-stored secret
  `email_queue_service_role_key`. `email_queue_wake()` is very likely a trigger attached to
  the enqueue path that fires dispatch immediately instead of waiting for the next 5-second
  `pg_cron` tick — but this is inference, not confirmed. **Do not guess the SQL body from this
  description alone — pull the actual definition (see Step 2).**

## 2. Blocker to resolve first

`supabase/config.toml` has `project_id = "qtstzkyycjldlwgiqsgh"`, but the currently
authenticated `supabase` CLI session only sees one linked project via
`supabase projects list`:

```
● zzuoshcxyiqslvgiwzcn | nsxirokqumefxupauejc | Financial Model Builder
```

These don't match. Before any prod introspection can happen, whoever runs this needs to
confirm which Supabase account/project is actually `budget-sandbox` production, and either:
- switch `supabase login` to the account that owns `qtstzkyycjldlwgiqsgh`, or
- confirm `qtstzkyycjldlwgiqsgh` is stale/wrong in `config.toml` and it should actually be
  `nsxirokqumefxupauejc`.

**This step requires real credentials/access that the assistant does not have — a human (or
an agent explicitly handed the correct project ref/token) must do this part.**

## 3. Steps

1. Resolve the project link mismatch (Section 2).
2. `supabase link --project-ref <correct-ref>` against the confirmed prod project.
3. Pull the real function bodies, read-only (does not modify prod):
   ```
   supabase db dump --linked --schema public -f /tmp/prod_schema.sql
   ```
   or, more targeted, via the Supabase SQL editor / a read-only `psql` session:
   ```sql
   SELECT pg_get_functiondef(oid)
   FROM pg_proc
   WHERE proname IN ('email_queue_dispatch', 'email_queue_wake');
   ```
4. Author a new migration, e.g.
   `supabase/migrations/<new-timestamp>_email_queue_functions.sql`, containing:
   - `CREATE OR REPLACE FUNCTION public.email_queue_dispatch() ...` — exact body pulled in
     step 3, not reconstructed from the comment description.
   - `CREATE OR REPLACE FUNCTION public.email_queue_wake() ...` — same.
   - The REVOKE/GRANT pairs for both functions (move them here rather than uncommenting in
     `20260709162106_...sql` in place — this migration will sort after that one
     chronologically, so the functions must exist before any grants targeting them run).
5. In `20260709162106_ae3cab4b-ebc8-497f-9552-3907a7569400.sql`, delete the now-redundant
   commented-out REVOKE/GRANT lines and their explanatory comments (added in PR #42) — the new
   migration supersedes them.
6. Verify:
   - `supabase db reset` completes cleanly with no `42883`/`42710` errors.
   - `npm run test:integration` — all existing tests still pass (63 as of PR #42).
   - Optionally add a lightweight regression test asserting both functions exist post-reset
     (e.g. query `pg_proc` for `proname IN ('email_queue_dispatch','email_queue_wake')`) so a
     future squash/reset can't silently drop them again without CI noticing.
7. Open a PR referencing this spec and PR #42.

## 4. Out of scope

- Do not re-architect the email dispatch/cron mechanism — this is purely about capturing the
  existing production behavior as a migration.
- Do not expand BH rate catalog, touch RLS policies unrelated to these two functions, or touch
  `read_email_batch` / `enqueue_email` / `delete_email` / `move_to_dlq` (already correctly
  defined in `email_infra.sql`).
