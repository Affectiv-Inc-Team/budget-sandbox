
-- Referral contacts: ensure company_id matches parent referral's company_id on insert/update
DROP POLICY IF EXISTS "referral_contacts_insert" ON public.referral_contacts;
DROP POLICY IF EXISTS "referral_contacts_update" ON public.referral_contacts;

CREATE POLICY "referral_contacts_insert" ON public.referral_contacts
FOR INSERT TO authenticated
WITH CHECK (
  public.can_edit_company(company_id)
  AND company_id = (SELECT r.company_id FROM public.referrals r WHERE r.id = referral_id)
);

CREATE POLICY "referral_contacts_update" ON public.referral_contacts
FOR UPDATE TO authenticated
USING (public.can_edit_company(company_id))
WITH CHECK (
  public.can_edit_company(company_id)
  AND company_id = (SELECT r.company_id FROM public.referrals r WHERE r.id = referral_id)
);

-- Fix mutable search_path on SECURITY DEFINER helpers
ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = public, pg_temp;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public, pg_temp;
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = public, pg_temp;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public, pg_temp;
