
DROP POLICY IF EXISTS "companies: licensee editor write access" ON public.companies;
CREATE POLICY "companies: licensee editor write access"
  ON public.companies FOR UPDATE
  USING (public.can_edit_company(id))
  WITH CHECK (public.can_edit_company(id));

DROP POLICY IF EXISTS "referral_contacts: tenant update" ON public.referral_contacts;
CREATE POLICY "referral_contacts: tenant update"
  ON public.referral_contacts FOR UPDATE
  USING (public.can_edit_company(company_id))
  WITH CHECK (public.can_edit_company(company_id));
