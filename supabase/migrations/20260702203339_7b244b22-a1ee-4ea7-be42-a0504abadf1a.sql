
-- 1. Pending org role on licensees
ALTER TABLE public.licensees ADD COLUMN IF NOT EXISTS pending_org_role text;

ALTER TABLE public.licensees DROP CONSTRAINT IF EXISTS licensees_pending_org_role_check;
ALTER TABLE public.licensees ADD CONSTRAINT licensees_pending_org_role_check
  CHECK (pending_org_role IS NULL OR pending_org_role IN
    ('OWNER','CEO','FINANCE','REGIONAL_DIRECTOR','PROGRAM_MANAGER','HR_MANAGER','SCHEDULER','HOUSE_LEAD'));

-- 2. Update handle_new_user to apply pending org role at signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
declare
  v_pending text;
begin
  select pending_org_role into v_pending
    from public.licensees where lower(name) = lower(new.email) limit 1;

  insert into public.profiles (id, email, role) values (new.id, new.email, v_pending);

  if v_pending is not null then
    update public.licensees set pending_org_role = null where lower(name) = lower(new.email);
  end if;

  return new;
end;
$function$;

-- 3. Update set_member_org_role to store pending when no profile exists yet
CREATE OR REPLACE FUNCTION public.set_member_org_role(p_company_id text, p_target_email text, p_role text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
declare
  v_target_id uuid;
  v_email text;
  v_licensee_id uuid;
begin
  v_email := lower(trim(p_target_email));

  if not public.is_company_admin(p_company_id) then
    raise exception 'not authorized to manage team for this company' using errcode = 'insufficient_privilege';
  end if;

  if p_role is not null and p_role not in
      ('OWNER','CEO','FINANCE','REGIONAL_DIRECTOR','PROGRAM_MANAGER','HR_MANAGER','SCHEDULER','HOUSE_LEAD') then
    raise exception 'invalid role: %', p_role using errcode = 'invalid_parameter_value';
  end if;

  -- Must be a licensee_companies member of this company
  select l.id into v_licensee_id
    from public.licensees l
    join public.licensee_companies lc on lc.licensee_id = l.id
   where lower(l.name) = v_email
     and lc.company_id = p_company_id
   limit 1;

  if v_licensee_id is null then
    raise exception 'target user is not a member of this company' using errcode = 'no_data_found';
  end if;

  -- If they already have an account, set profile role directly
  select p.id into v_target_id from public.profiles p where lower(p.email) = v_email limit 1;

  if v_target_id is not null then
    update public.profiles set role = p_role where id = v_target_id;
    update public.licensees set pending_org_role = null where id = v_licensee_id;
  else
    update public.licensees set pending_org_role = p_role where id = v_licensee_id;
  end if;
end;
$function$;

-- 4. get_company_member_status: returns account status + last sign-in for each member
CREATE OR REPLACE FUNCTION public.get_company_member_status(p_company_id text)
RETURNS TABLE(email text, org_role text, pending_org_role text, has_account boolean, last_sign_in_at timestamptz, confirmed_at timestamptz)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
  SELECT
    l.name AS email,
    p.role AS org_role,
    l.pending_org_role,
    (u.id IS NOT NULL) AS has_account,
    u.last_sign_in_at,
    COALESCE(u.email_confirmed_at, u.confirmed_at) AS confirmed_at
  FROM public.licensees l
  JOIN public.licensee_companies lc ON lc.licensee_id = l.id
  LEFT JOIN public.profiles p ON lower(p.email) = lower(l.name)
  LEFT JOIN auth.users u ON lower(u.email) = lower(l.name)
  WHERE lc.company_id = p_company_id
    AND (public.is_company_admin(p_company_id) OR public.is_super_admin());
$function$;

GRANT EXECUTE ON FUNCTION public.get_company_member_status(text) TO authenticated;
