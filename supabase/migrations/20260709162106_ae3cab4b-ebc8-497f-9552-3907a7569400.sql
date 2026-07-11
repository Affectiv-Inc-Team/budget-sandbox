
-- 1) Lock down EXECUTE on SECURITY DEFINER functions
-- App/RLS helpers: authenticated users only
REVOKE EXECUTE ON FUNCTION public.referral_set_ssn(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.referral_set_ssn(uuid, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.add_company_member(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_company_member(text, text, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_super_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.set_member_org_role(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_member_org_role(text, text, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.referral_reveal_ssn(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.referral_reveal_ssn(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_company_admin(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_company_admin(text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_company_member_org_roles(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_company_member_org_roles(text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_company_member_status(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_company_member_status(text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.can_edit_company(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_edit_company(text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.has_company_access(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_company_access(text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.profile_role_tier() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.profile_role_tier() TO authenticated;

-- Email queue helpers: service_role only (called from edge functions / cron)
-- NOTE: email_queue_dispatch() exists in production (applied directly via the
-- Lovable Management API alongside the pg_cron job in email_infra.sql's
-- post-migration steps) but its CREATE FUNCTION was never committed to a
-- migration. The REVOKE/GRANT below is commented out so `supabase db reset`
-- doesn't fail on a function that doesn't exist locally. Nothing in src/ or
-- tests/ calls this RPC directly. Re-enable once a migration defining it lands.
-- REVOKE EXECUTE ON FUNCTION public.email_queue_dispatch() FROM PUBLIC, anon, authenticated;
-- GRANT EXECUTE ON FUNCTION public.email_queue_dispatch() TO service_role;

REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) TO service_role;

REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) TO service_role;

REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_email(text, bigint) TO service_role;

REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) TO service_role;

-- Trigger-only functions: no client access needed
REVOKE EXECUTE ON FUNCTION public.referral_activity_touch_parent() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_profile_privilege_escalation() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.referrals_audit() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_referral_child_company() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.referrals_log_stage_change() FROM PUBLIC, anon, authenticated;
-- NOTE: email_queue_wake() exists in production but was never committed as a
-- migration (see email_queue_dispatch note above) — commented out so
-- `supabase db reset` doesn't fail on a function that doesn't exist locally.
-- REVOKE EXECUTE ON FUNCTION public.email_queue_wake() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.referrals_touch_timestamps() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;

-- 2) Recreate RLS policies to target `authenticated` instead of `public`

-- companies
DROP POLICY IF EXISTS "companies: licensee editor write access" ON public.companies;
CREATE POLICY "companies: licensee editor write access" ON public.companies
  FOR UPDATE TO authenticated
  USING (can_edit_company(id)) WITH CHECK (can_edit_company(id));

DROP POLICY IF EXISTS "companies: licensee read access" ON public.companies;
CREATE POLICY "companies: licensee read access" ON public.companies
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM licensee_companies lc
      JOIN licensees l ON l.id = lc.licensee_id
      JOIN profiles p ON p.email = l.name
    WHERE lc.company_id = companies.id AND p.id = auth.uid()
  ));

DROP POLICY IF EXISTS "companies: super admin full access" ON public.companies;
CREATE POLICY "companies: super admin full access" ON public.companies
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_super_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_super_admin = true));

-- referrals
DROP POLICY IF EXISTS "referrals: tenant delete" ON public.referrals;
CREATE POLICY "referrals: tenant delete" ON public.referrals
  FOR DELETE TO authenticated USING (can_edit_company(company_id));

DROP POLICY IF EXISTS "referrals: tenant insert" ON public.referrals;
CREATE POLICY "referrals: tenant insert" ON public.referrals
  FOR INSERT TO authenticated WITH CHECK (can_edit_company(company_id));

DROP POLICY IF EXISTS "referrals: tenant read" ON public.referrals;
CREATE POLICY "referrals: tenant read" ON public.referrals
  FOR SELECT TO authenticated USING (has_company_access(company_id));

DROP POLICY IF EXISTS "referrals: tenant update" ON public.referrals;
CREATE POLICY "referrals: tenant update" ON public.referrals
  FOR UPDATE TO authenticated
  USING (can_edit_company(company_id)) WITH CHECK (can_edit_company(company_id));

-- referral_contacts
DROP POLICY IF EXISTS "referral_contacts: tenant delete" ON public.referral_contacts;
CREATE POLICY "referral_contacts: tenant delete" ON public.referral_contacts
  FOR DELETE TO authenticated USING (can_edit_company(company_id));

DROP POLICY IF EXISTS "referral_contacts: tenant insert" ON public.referral_contacts;
CREATE POLICY "referral_contacts: tenant insert" ON public.referral_contacts
  FOR INSERT TO authenticated
  WITH CHECK (can_edit_company((SELECT r.company_id FROM referrals r WHERE r.id = referral_contacts.referral_id)));

DROP POLICY IF EXISTS "referral_contacts: tenant read" ON public.referral_contacts;
CREATE POLICY "referral_contacts: tenant read" ON public.referral_contacts
  FOR SELECT TO authenticated USING (has_company_access(company_id));

DROP POLICY IF EXISTS "referral_contacts: tenant update" ON public.referral_contacts;
CREATE POLICY "referral_contacts: tenant update" ON public.referral_contacts
  FOR UPDATE TO authenticated
  USING (can_edit_company(company_id)) WITH CHECK (can_edit_company(company_id));

-- referral_activity
DROP POLICY IF EXISTS "referral_activity: tenant insert" ON public.referral_activity;
CREATE POLICY "referral_activity: tenant insert" ON public.referral_activity
  FOR INSERT TO authenticated
  WITH CHECK (can_edit_company((SELECT referrals.company_id FROM referrals WHERE referrals.id = referral_activity.referral_id)));

DROP POLICY IF EXISTS "referral_activity: tenant read" ON public.referral_activity;
CREATE POLICY "referral_activity: tenant read" ON public.referral_activity
  FOR SELECT TO authenticated USING (has_company_access(company_id));

-- referral_status_history
DROP POLICY IF EXISTS "referral_status_history: tenant read" ON public.referral_status_history;
CREATE POLICY "referral_status_history: tenant read" ON public.referral_status_history
  FOR SELECT TO authenticated USING (has_company_access(company_id));

-- referral_audit_log
DROP POLICY IF EXISTS "referral_audit_log: tenant read" ON public.referral_audit_log;
CREATE POLICY "referral_audit_log: tenant read" ON public.referral_audit_log
  FOR SELECT TO authenticated USING (has_company_access(company_id));
