
-- 1. Drop overly permissive policies
DROP POLICY IF EXISTS "licensees: authenticated can insert" ON public.licensees;
DROP POLICY IF EXISTS "licensees: authenticated can view" ON public.licensees;

-- 2. Restricted SELECT: super admin, self, or company admin who shares a company
CREATE POLICY "licensees: restricted view"
ON public.licensees FOR SELECT
TO authenticated
USING (
  public.is_super_admin()
  OR lower(name) = lower((SELECT email FROM public.profiles WHERE id = auth.uid()))
  OR EXISTS (
    SELECT 1
      FROM public.licensee_companies lc
     WHERE lc.licensee_id = licensees.id
       AND public.is_company_admin(lc.company_id)
  )
);

-- (INSERT/UPDATE/DELETE remain restricted to super admins via existing "super admin full access" policy.)

-- 3. RPC for company admins to add a teammate atomically (licensee + membership)
CREATE OR REPLACE FUNCTION public.add_company_member(p_company_id text, p_email text, p_role text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
declare
  v_email text;
  v_licensee_id uuid;
begin
  v_email := lower(trim(p_email));
  if v_email is null or v_email = '' then
    raise exception 'email is required' using errcode = 'invalid_parameter_value';
  end if;

  if p_role not in ('admin','editor','read_only') then
    raise exception 'invalid access role: %', p_role using errcode = 'invalid_parameter_value';
  end if;

  if not public.is_company_admin(p_company_id) then
    raise exception 'not authorized to add members to this company' using errcode = 'insufficient_privilege';
  end if;

  select id into v_licensee_id from public.licensees where lower(name) = v_email limit 1;
  if v_licensee_id is null then
    insert into public.licensees (name) values (v_email) returning id into v_licensee_id;
  end if;

  insert into public.licensee_companies (licensee_id, company_id, role)
    values (v_licensee_id, p_company_id, p_role)
  on conflict (licensee_id, company_id) do update set role = excluded.role;
end;
$function$;

GRANT EXECUTE ON FUNCTION public.add_company_member(text, text, text) TO authenticated;
