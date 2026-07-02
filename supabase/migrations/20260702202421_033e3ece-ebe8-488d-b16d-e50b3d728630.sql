
-- RPC: allow a company admin (or super admin) to set the org role of a member of their company.
-- Bypasses prevent_profile_privilege_escalation via SECURITY DEFINER (owner = postgres).

create or replace function public.set_member_org_role(
  p_company_id text,
  p_target_email text,
  p_role text
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_target_id uuid;
  v_email text;
begin
  v_email := lower(trim(p_target_email));

  if not public.is_company_admin(p_company_id) then
    raise exception 'not authorized to manage team for this company' using errcode = 'insufficient_privilege';
  end if;

  if p_role is not null and p_role not in
      ('OWNER','CEO','FINANCE','REGIONAL_DIRECTOR','PROGRAM_MANAGER','HR_MANAGER','SCHEDULER','HOUSE_LEAD') then
    raise exception 'invalid role: %', p_role using errcode = 'invalid_parameter_value';
  end if;

  -- Target must be a licensee_companies member of this company
  select p.id into v_target_id
    from public.profiles p
    join public.licensees l on lower(l.name) = lower(p.email)
    join public.licensee_companies lc on lc.licensee_id = l.id
   where lower(p.email) = v_email
     and lc.company_id = p_company_id
   limit 1;

  if v_target_id is null then
    raise exception 'target user is not a member of this company' using errcode = 'no_data_found';
  end if;

  update public.profiles set role = p_role where id = v_target_id;
end;
$$;

revoke all on function public.set_member_org_role(text, text, text) from public;
grant execute on function public.set_member_org_role(text, text, text) to authenticated;

-- Helper: read org role by email for members of a company the caller can admin.
create or replace function public.get_company_member_org_roles(p_company_id text)
returns table(email text, role text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.email, p.role
    from public.profiles p
    join public.licensees l on lower(l.name) = lower(p.email)
    join public.licensee_companies lc on lc.licensee_id = l.id
   where lc.company_id = p_company_id
     and (public.is_company_admin(p_company_id) or public.is_super_admin());
$$;

revoke all on function public.get_company_member_org_roles(text) from public;
grant execute on function public.get_company_member_org_roles(text) to authenticated;
