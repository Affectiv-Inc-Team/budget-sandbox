
-- Allow 'admin' role on licensee_companies
ALTER TABLE public.licensee_companies DROP CONSTRAINT IF EXISTS licensee_companies_role_check;
ALTER TABLE public.licensee_companies ADD CONSTRAINT licensee_companies_role_check
  CHECK (role = ANY (ARRAY['admin'::text, 'editor'::text, 'read_only'::text]));

-- Helper: is the current user a company admin for this company?
CREATE OR REPLACE FUNCTION public.is_company_admin(p_company_id text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.is_super_admin() OR EXISTS (
    SELECT 1 FROM public.licensee_companies lc
    JOIN public.licensees l ON l.id = lc.licensee_id
    JOIN public.profiles  p ON p.email = l.name
    WHERE lc.company_id = p_company_id AND lc.role = 'admin' AND p.id = auth.uid()
  );
$$;

-- Update can_edit_company to include admins
CREATE OR REPLACE FUNCTION public.can_edit_company(p_company_id text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.is_super_admin() OR EXISTS (
    SELECT 1 FROM public.licensee_companies lc
    JOIN public.licensees l ON l.id = lc.licensee_id
    JOIN public.profiles  p ON p.email = l.name
    WHERE lc.company_id = p_company_id
      AND lc.role IN ('admin','editor')
      AND p.id = auth.uid()
  );
$$;

-- RLS policies enabling company admins to see and manage their team
CREATE POLICY "licensee_companies: members can view own company rows"
ON public.licensee_companies FOR SELECT TO authenticated
USING (public.has_company_access(company_id));

CREATE POLICY "licensee_companies: company admins can insert"
ON public.licensee_companies FOR INSERT TO authenticated
WITH CHECK (public.is_company_admin(company_id));

CREATE POLICY "licensee_companies: company admins can update"
ON public.licensee_companies FOR UPDATE TO authenticated
USING (public.is_company_admin(company_id))
WITH CHECK (public.is_company_admin(company_id));

CREATE POLICY "licensee_companies: company admins can delete"
ON public.licensee_companies FOR DELETE TO authenticated
USING (public.is_company_admin(company_id));

-- Allow authenticated users to look up / create licensee rows by email
-- (needed so company admins can add teammates by email address)
CREATE POLICY "licensees: authenticated can view"
ON public.licensees FOR SELECT TO authenticated
USING (true);

CREATE POLICY "licensees: authenticated can insert"
ON public.licensees FOR INSERT TO authenticated
WITH CHECK (true);

GRANT SELECT, INSERT ON public.licensees TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.licensee_companies TO authenticated;
