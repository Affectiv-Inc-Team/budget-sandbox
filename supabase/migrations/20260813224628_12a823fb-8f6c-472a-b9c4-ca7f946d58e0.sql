CREATE OR REPLACE FUNCTION public.can_reset_member_password(p_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN false
    WHEN public.is_super_admin() THEN true
    -- Company admins may reset anyone who has access to a company they admin,
    -- but never an Intrinsic super admin.
    WHEN EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE lower(p.email) = lower(p_email) AND p.is_super_admin = true
    ) THEN false
    ELSE EXISTS (
      SELECT 1
      FROM public.licensees l
      JOIN public.licensee_companies lc ON lc.licensee_id = l.id
      WHERE lower(l.name) = lower(p_email)
        AND public.is_company_admin(lc.company_id)
    )
  END;
$$;

REVOKE ALL ON FUNCTION public.can_reset_member_password(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_reset_member_password(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_reset_member_password(text) TO service_role;