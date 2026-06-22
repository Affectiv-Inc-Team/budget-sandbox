
-- 1. profiles UPDATE: add WITH CHECK
DROP POLICY IF EXISTS "profiles: own row update" ON public.profiles;
CREATE POLICY "profiles: own row update" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- 2. referral_activity: allow author + editor to update/delete their own notes
CREATE POLICY "referral_activity: author update" ON public.referral_activity
  FOR UPDATE TO authenticated
  USING (author_id = auth.uid() AND public.can_edit_company(company_id))
  WITH CHECK (author_id = auth.uid() AND public.can_edit_company(company_id));

CREATE POLICY "referral_activity: author delete" ON public.referral_activity
  FOR DELETE TO authenticated
  USING (author_id = auth.uid() AND public.can_edit_company(company_id));

-- 3. referral_audit_log: explicit deny for client writes (writes happen via SECURITY DEFINER funcs)
CREATE POLICY "referral_audit_log: no client insert" ON public.referral_audit_log
  FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY "referral_audit_log: no client update" ON public.referral_audit_log
  FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY "referral_audit_log: no client delete" ON public.referral_audit_log
  FOR DELETE TO authenticated USING (false);

-- 4. referral_status_history: explicit deny for client writes
CREATE POLICY "referral_status_history: no client insert" ON public.referral_status_history
  FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY "referral_status_history: no client update" ON public.referral_status_history
  FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY "referral_status_history: no client delete" ON public.referral_status_history
  FOR DELETE TO authenticated USING (false);
