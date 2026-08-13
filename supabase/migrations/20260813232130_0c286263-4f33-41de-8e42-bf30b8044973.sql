CREATE OR REPLACE FUNCTION public.can_edit_company(p_company_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_super_admin() OR EXISTS (
    SELECT 1 FROM public.licensee_companies lc
    JOIN public.licensees l ON l.id = lc.licensee_id
    JOIN public.profiles  p ON lower(p.email) = lower(l.name)
    WHERE lc.company_id = p_company_id
      AND lc.role IN ('admin','editor')
      AND p.id = auth.uid()
  );
$$;

DROP POLICY IF EXISTS "companies: licensee read access" ON public.companies;
CREATE POLICY "companies: licensee read access" ON public.companies
FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.licensee_companies lc
    JOIN public.licensees l ON l.id = lc.licensee_id
    JOIN public.profiles  p ON lower(p.email) = lower(l.name)
    WHERE lc.company_id = companies.id AND p.id = auth.uid()
  )
);