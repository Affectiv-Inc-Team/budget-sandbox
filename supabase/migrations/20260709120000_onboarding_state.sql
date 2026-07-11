-- Onboarding completion flag.
--
-- Column-level UPDATE grants are additive: migration 20260616184515 revoked
-- table-wide UPDATE on public.profiles and granted (email) only, and the
-- prevent_profile_privilege_escalation trigger guards only role/is_super_admin
-- — neither needs to change for this new column. RLS ("profiles: own row
-- update", auth.uid() = id) already scopes writes to the caller's own row: a
-- user forging their own onboarding_completed_at only skips their own
-- onboarding, which is harmless.
--
-- Hand-authored (idempotent), like 20260702204509_email_infra.sql and
-- 20260708190000_invites.sql. See docs/prod-release/invites.md's deploy
-- procedure — this file does not auto-apply to the Lovable-hosted project.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz;
GRANT UPDATE (onboarding_completed_at) ON public.profiles TO authenticated;
