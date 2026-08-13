CREATE TABLE public.invite_email_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email text NOT NULL,
  company_id text REFERENCES public.companies(id) ON DELETE SET NULL,
  kind text NOT NULL,
  email_action text,
  status text NOT NULL,
  error_message text,
  triggered_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  triggered_by_email text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX invite_email_log_email_idx ON public.invite_email_log (lower(email));
CREATE INDEX invite_email_log_created_at_idx ON public.invite_email_log (created_at DESC);

GRANT SELECT ON public.invite_email_log TO authenticated;
GRANT ALL ON public.invite_email_log TO service_role;

ALTER TABLE public.invite_email_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view invite email history"
  ON public.invite_email_log FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR (company_id IS NOT NULL AND public.is_company_admin(company_id))
    OR EXISTS (
      SELECT 1
        FROM public.licensees l
        JOIN public.licensee_companies lc ON lc.licensee_id = l.id
       WHERE lower(l.name) = lower(invite_email_log.email)
         AND public.is_company_admin(lc.company_id)
    )
  );