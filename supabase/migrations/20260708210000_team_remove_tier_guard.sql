-- Team screen (PR "feat/team-invitations") review fixes:
--
-- 1. Removing a member went through a plain client-side DELETE on
--    licensee_companies, gated only by "licensee_companies: company admins
--    can delete" (is_company_admin(company_id) — no tier comparison). That
--    let any tier 1-3 admin remove a member at or above their own tier,
--    including the Owner, even though set_member_org_role already blocks the
--    equivalent role-CHANGE action for exactly that reason. This migration
--    adds the same tier guard to the DELETE policy.
--
-- 2. set_member_org_role updates the target's global profiles.role (org
--    tier) but never touched licensee_companies.role (per-company access
--    level) for the company being managed, so demoting someone (e.g. Owner
--    -> House Lead) left their access_role at whatever it was before
--    (typically 'admin') — contradicting accessRoleForTier in access.js and
--    create_invite's own tier-derived access_role. Now re-derives and caps
--    it the same way create_invite does, on every role change.
--
-- Hand-authored (idempotent), like 20260708190000_invites.sql.

CREATE OR REPLACE FUNCTION public.can_remove_company_member(p_company_id text, p_target_licensee_id uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
declare
  v_target_role text;
begin
  if not public.is_company_admin(p_company_id) then
    return false;
  end if;

  if public.is_super_admin() then
    return true;
  end if;

  -- Owner (tier 1) may remove anyone; everyone else only someone strictly
  -- below their own tier — mirrors set_member_org_role's rule exactly.
  if coalesce(public.profile_role_tier(), 99) = 1 then
    return true;
  end if;

  select coalesce(p.role, l.pending_org_role) into v_target_role
    from public.licensees l
    left join public.profiles p on lower(p.email) = lower(l.name)
   where l.id = p_target_licensee_id;

  return public.role_tier(v_target_role) > coalesce(public.profile_role_tier(), 99);
end;
$$;

REVOKE ALL ON FUNCTION public.can_remove_company_member(text, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.can_remove_company_member(text, uuid) TO authenticated;

DROP POLICY IF EXISTS "licensee_companies: company admins can delete" ON public.licensee_companies;
CREATE POLICY "licensee_companies: company admins can delete"
ON public.licensee_companies FOR DELETE TO authenticated
USING (public.can_remove_company_member(company_id, licensee_id));

-- ── set_member_org_role: keep access_role in sync with the new tier ────────

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
  v_current_role text;
  v_new_access_role text;
  v_caller_access_role text;
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

  -- Tier rule on the NEW role (NULL = clearing a role, allowed past this check)
  if p_role is not null and not public.can_invite_role(p_role) then
    raise exception 'your role cannot assign tier % (%)', public.role_tier(p_role), p_role
      using errcode = 'insufficient_privilege';
  end if;

  -- Tier rule on the TARGET's current standing: only Owner (tier 1) may manage
  -- a member at or above the caller's own tier.
  select coalesce(p.role, l.pending_org_role) into v_current_role
    from public.licensees l
    left join public.profiles p on lower(p.email) = lower(l.name)
   where l.id = v_licensee_id;

  if coalesce(public.profile_role_tier(), 99) <> 1
     and public.role_tier(v_current_role) <= coalesce(public.profile_role_tier(), 99) then
    raise exception 'cannot change the role of a member at or above your tier'
      using errcode = 'insufficient_privilege';
  end if;

  -- If they already have an account, set profile role directly
  select p.id into v_target_id from public.profiles p where lower(p.email) = v_email limit 1;

  if v_target_id is not null then
    update public.profiles set role = p_role where id = v_target_id;
    update public.licensees set pending_org_role = null where id = v_licensee_id;
  else
    update public.licensees set pending_org_role = p_role where id = v_licensee_id;
  end if;

  -- Keep THIS company's access_role in sync with the new tier (mirrors
  -- accessRoleForTier in access.js / create_invite's own derivation). Capped
  -- by the caller's own access_role at this company, same rule create_invite
  -- applies, so a mere 'editor' admin-tier caller can't grant 'admin' access.
  if p_role is not null then
    v_new_access_role := case when public.role_tier(p_role) <= 3 then 'admin'
                               when public.role_tier(p_role) <= 6 then 'editor'
                               else 'read_only' end;

    if not public.is_super_admin() then
      select lc.role into v_caller_access_role
        from public.licensee_companies lc
        join public.licensees l on l.id = lc.licensee_id
        join public.profiles p on lower(p.email) = lower(l.name)
       where p.id = auth.uid() and lc.company_id = p_company_id
       limit 1;

      if v_caller_access_role = 'read_only' then
        v_new_access_role := 'read_only';
      elsif v_caller_access_role = 'editor' and v_new_access_role = 'admin' then
        v_new_access_role := 'editor';
      end if;
    end if;

    update public.licensee_companies set role = v_new_access_role
     where licensee_id = v_licensee_id and company_id = p_company_id;
  end if;
end;
$function$;
