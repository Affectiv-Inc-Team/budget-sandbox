-- Owner-delegated, tier-restricted, service-line-scoped team invitations.
--
-- Invite rule (mirrors invitableTiers() in src/lib/access.js — this SQL is the
-- enforcement point): Owner (tier 1) can invite any tier including another
-- Owner; every other tier can invite only tiers strictly below its own;
-- House Lead (tier 8) can invite nobody.
--
-- Acceptance is DERIVED, never stored: an invite is "accepted" when the
-- invitee's auth.users.last_sign_in_at is set. No trigger on auth.users.
--
-- Hand-authored (idempotent throughout, like 20260702204509_email_infra.sql).
-- Deploy note: this file does NOT auto-apply to the Lovable-hosted project —
-- see docs/prod-release/invites.md for the release runbook.

-- ── 1. invites table ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.invites (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  email              text NOT NULL CHECK (email = lower(email)),
  org_role           text NOT NULL CHECK (org_role IN
    ('OWNER','CEO','FINANCE','REGIONAL_DIRECTOR','PROGRAM_MANAGER','HR_MANAGER','SCHEDULER','HOUSE_LEAD')),
  service_line_scope text,           -- 'sl_…' id inside companies.config; NULL = whole company
  access_role        text NOT NULL CHECK (access_role IN ('admin','editor','read_only')),
  invited_by         uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  invited_by_email   text NOT NULL,  -- denormalized for display if the inviter's profile goes away
  status             text NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','sent','failed','revoked')),
  created_at         timestamptz NOT NULL DEFAULT now(),
  email_sent_at      timestamptz,
  revoked_at         timestamptz,
  revoked_by         uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- One live invite per (company, email); revoked rows remain as history.
CREATE UNIQUE INDEX IF NOT EXISTS invites_active_unique
  ON public.invites(company_id, email) WHERE status IN ('pending','sent','failed');
CREATE INDEX IF NOT EXISTS idx_invites_company ON public.invites(company_id);
CREATE INDEX IF NOT EXISTS idx_invites_email   ON public.invites(email);

GRANT SELECT ON public.invites TO authenticated;
GRANT ALL ON public.invites TO service_role;

ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;

-- Reads: super admin (AdminPanel), company admins (roster), the inviter, and
-- the recipient (onboarding provenance check reads own invite by email).
-- All writes go through the SECURITY DEFINER RPCs below — no client write policies.
DROP POLICY IF EXISTS "invites: read" ON public.invites;
CREATE POLICY "invites: read"
ON public.invites FOR SELECT TO authenticated
USING (
  public.is_super_admin()
  OR public.is_company_admin(company_id)
  OR invited_by = auth.uid()
  OR lower(email) = lower(coalesce(auth.jwt()->>'email', ''))
);

-- ── 2. Service-line scope on membership ─────────────────────────────────────
-- NULL = whole company. No FK: the id lives inside companies.config JSONB.

ALTER TABLE public.licensee_companies ADD COLUMN IF NOT EXISTS service_line_scope text;

-- ── 3. Tier-rule helpers ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.role_tier(p_role text)
RETURNS int
LANGUAGE sql IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE p_role
    WHEN 'OWNER' THEN 1 WHEN 'CEO' THEN 2 WHEN 'FINANCE' THEN 3
    WHEN 'REGIONAL_DIRECTOR' THEN 4 WHEN 'PROGRAM_MANAGER' THEN 5
    WHEN 'HR_MANAGER' THEN 6 WHEN 'SCHEDULER' THEN 7 WHEN 'HOUSE_LEAD' THEN 8
    ELSE 99 END;
$$;

-- Owner invites any tier (incl. another Owner); everyone else strictly below
-- their own. coalesce(): profile_role_tier() returns NULL only when the caller
-- has no profile row at all (an unrecognized/NULL role value on an existing
-- profile falls through to tier 2, not NULL — see profile_role_tier() in
-- 20260615201552_...sql). Either way, missing tier data must read as "cannot
-- invite", never as "check skipped".
CREATE OR REPLACE FUNCTION public.can_invite_role(p_target_role text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(
    public.profile_role_tier() = 1
    OR public.role_tier(p_target_role) > public.profile_role_tier(),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.can_invite_role(text) FROM public;
GRANT EXECUTE ON FUNCTION public.can_invite_role(text) TO authenticated;

-- ── 4. create_invite ─────────────────────────────────────────────────────────
-- Atomic: licensee row + membership (+scope) + org role (live or pending) +
-- invite row. The send-invite edge function calls this AS THE CALLER, then
-- sends the email with the service role and flips status to sent/failed.

CREATE OR REPLACE FUNCTION public.create_invite(
  p_company_id text,
  p_email text,
  p_org_role text,
  p_service_line_scope text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
declare
  v_email        text;
  v_target_tier  int;
  v_access_role  text;
  v_inviter_access_role text;
  v_licensee_id  uuid;
  v_profile_id   uuid;
  v_inviter_email text;
  v_invite_id    uuid;
  v_current_org_role text;
  v_other_membership boolean;
begin
  v_email := lower(trim(p_email));
  if v_email is null or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'a valid email is required' using errcode = 'invalid_parameter_value';
  end if;

  if p_org_role is null or p_org_role not in
      ('OWNER','CEO','FINANCE','REGIONAL_DIRECTOR','PROGRAM_MANAGER','HR_MANAGER','SCHEDULER','HOUSE_LEAD') then
    raise exception 'invalid role: %', p_org_role using errcode = 'invalid_parameter_value';
  end if;

  if not public.has_company_access(p_company_id) then
    raise exception 'not authorized to invite members to this company' using errcode = 'insufficient_privilege';
  end if;

  if not public.can_invite_role(p_org_role) then
    raise exception 'your role cannot invite tier % (%)', public.role_tier(p_org_role), p_org_role
      using errcode = 'insufficient_privilege';
  end if;

  v_target_tier := public.role_tier(p_org_role);

  -- Scope rule: tiers 1–3 are whole-company (no scope); tier 4+ must name one
  -- unarchived service line that actually exists on this company.
  if v_target_tier <= 3 then
    if p_service_line_scope is not null then
      raise exception 'tiers 1-3 are whole-company — do not pass a service line scope'
        using errcode = 'invalid_parameter_value';
    end if;
  else
    if p_service_line_scope is null then
      raise exception 'tier % invites must be scoped to a service line', v_target_tier
        using errcode = 'invalid_parameter_value';
    end if;
    if not exists (
      SELECT 1
        FROM public.companies c,
             jsonb_array_elements(coalesce(c.config->'serviceLines', '[]'::jsonb)) sl
       WHERE c.id = p_company_id
         AND sl->>'id' = p_service_line_scope
         AND coalesce((sl->>'archived')::boolean, false) = false
    ) then
      raise exception 'service line % is not an active line of this company', p_service_line_scope
        using errcode = 'invalid_parameter_value';
    end if;
  end if;

  -- Access level derives from tier (mirrors accessRoleForTier in access.js).
  v_access_role := case when v_target_tier <= 3 then 'admin'
                        when v_target_tier <= 6 then 'editor'
                        else 'read_only' end;

  -- Cap by the inviter's OWN access at this company. Org tier and per-company
  -- access_role are independent axes (a global-tier Owner can still be a mere
  -- 'editor' guest at some other company) — without this, that guest could
  -- invite someone with more access to the company than the guest has.
  -- Super admins have no licensee_companies row and are never capped.
  if not public.is_super_admin() then
    select lc.role into v_inviter_access_role
      from public.licensee_companies lc
      join public.licensees l on l.id = lc.licensee_id
      join public.profiles p on lower(p.email) = lower(l.name)
     where p.id = auth.uid() and lc.company_id = p_company_id
     limit 1;

    if v_inviter_access_role = 'read_only' then
      v_access_role := 'read_only';
    elsif v_inviter_access_role = 'editor' and v_access_role = 'admin' then
      v_access_role := 'editor';
    end if;
  end if;

  select email into v_inviter_email from public.profiles where id = auth.uid();

  -- Licensee + membership (+scope)
  select id into v_licensee_id from public.licensees where lower(name) = v_email limit 1;
  if v_licensee_id is null then
    insert into public.licensees (name) values (v_email) returning id into v_licensee_id;
  end if;

  insert into public.licensee_companies (licensee_id, company_id, role, service_line_scope)
       values (v_licensee_id, p_company_id, v_access_role, p_service_line_scope)
  on conflict (licensee_id, company_id)
    do update set role = excluded.role, service_line_scope = excluded.service_line_scope;

  -- Org role: live profile if the account exists, else pending for handle_new_user().
  -- profiles.role is a GLOBAL attribute (gates access across every company the
  -- target belongs to, not just this one). Re-inviting an existing multi-company
  -- member with the SAME tier they already hold is a harmless no-op (the common
  -- "add this Regional Director to another company" flow) — but ACTUALLY
  -- CHANGING the tier of someone already established at a DIFFERENT company must
  -- not happen silently from over here. Only a super admin may do that; anyone
  -- else invites at the target's existing tier or asks a super admin to change it.
  select id, role into v_profile_id, v_current_org_role
    from public.profiles where lower(email) = v_email limit 1;
  if v_profile_id is not null then
    if p_org_role is distinct from v_current_org_role and not public.is_super_admin() then
      select exists (
        select 1
          from public.licensee_companies lc2
          join public.licensees l2 on l2.id = lc2.licensee_id
         where lower(l2.name) = v_email
           and lc2.company_id <> p_company_id
      ) into v_other_membership;

      if v_other_membership then
        raise exception 'target already has a different role at another company — a super admin must change it'
          using errcode = 'insufficient_privilege';
      end if;
    end if;

    update public.profiles set role = p_org_role where id = v_profile_id;
    update public.licensees set pending_org_role = null where id = v_licensee_id;
  else
    update public.licensees set pending_org_role = p_org_role where id = v_licensee_id;
  end if;

  -- Invite row: refresh the live one (this is also the resend path), else insert.
  update public.invites
     set org_role = p_org_role,
         service_line_scope = p_service_line_scope,
         access_role = v_access_role,
         status = 'pending',
         invited_by = auth.uid(),
         invited_by_email = coalesce(v_inviter_email, ''),
         created_at = now(),
         email_sent_at = null
   where company_id = p_company_id
     and email = v_email
     and status in ('pending','sent','failed')
  returning id into v_invite_id;

  if v_invite_id is null then
    insert into public.invites (company_id, email, org_role, service_line_scope,
                                access_role, invited_by, invited_by_email)
         values (p_company_id, v_email, p_org_role, p_service_line_scope,
                 v_access_role, auth.uid(), coalesce(v_inviter_email, ''))
    returning id into v_invite_id;
  end if;

  return v_invite_id;
end;
$$;

REVOKE ALL ON FUNCTION public.create_invite(text, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.create_invite(text, text, text, text) TO authenticated;

-- ── 5. set_member_org_role: enforce the tier rule on role changes too ───────
-- Same signature as 20260702203339; adds (a) the invite tier rule for the NEW
-- role and (b) callers below tier 1 cannot manage a member whose CURRENT tier
-- is at or above their own (without (b), a Finance admin could demote an Owner).

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
end;
$function$;

-- ── 6. revoke_invite ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.revoke_invite(p_invite_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
declare
  v_invite record;
  v_licensee_id uuid;
  v_last_sign_in timestamptz;
begin
  select * into v_invite from public.invites where id = p_invite_id;
  if v_invite is null then
    raise exception 'invite not found' using errcode = 'no_data_found';
  end if;

  if not (public.is_super_admin()
          or public.is_company_admin(v_invite.company_id)
          or v_invite.invited_by = auth.uid()) then
    raise exception 'not authorized to revoke this invite' using errcode = 'insufficient_privilege';
  end if;

  if v_invite.status = 'revoked' then
    raise exception 'invite is already revoked' using errcode = 'invalid_parameter_value';
  end if;

  -- Derived acceptance, scoped to THIS invite: last_sign_in_at is a global
  -- signal (an email that already has an account elsewhere, or already
  -- belongs to another company, is typically signed in long before this
  -- invite ever existed). Only treat it as "accepted this invite" if the
  -- sign-in happened AFTER this invite was created — otherwise every invite
  -- to an already-active user would be unrevokable from the moment it's sent.
  select u.last_sign_in_at into v_last_sign_in
    from auth.users u where lower(u.email) = v_invite.email limit 1;
  if v_last_sign_in is not null and v_last_sign_in > v_invite.created_at then
    raise exception 'invite already accepted — remove the member instead'
      using errcode = 'invalid_parameter_value';
  end if;

  update public.invites
     set status = 'revoked', revoked_at = now(), revoked_by = auth.uid()
   where id = p_invite_id;

  select id into v_licensee_id from public.licensees where lower(name) = v_invite.email limit 1;
  if v_licensee_id is not null then
    delete from public.licensee_companies
     where licensee_id = v_licensee_id and company_id = v_invite.company_id;

    -- pending_org_role is global on the licensee — only clear it when nothing
    -- else (membership or live invite) still expects it.
    if not exists (select 1 from public.licensee_companies where licensee_id = v_licensee_id)
       and not exists (select 1 from public.invites
                        where email = v_invite.email and status in ('pending','sent','failed')) then
      update public.licensees set pending_org_role = null where id = v_licensee_id;
    end if;
  end if;
end;
$$;

REVOKE ALL ON FUNCTION public.revoke_invite(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.revoke_invite(uuid) TO authenticated;

-- ── 7. get_company_member_status: +access_role, +scope, +invite status ──────
-- Return type changes, so DROP first (CREATE OR REPLACE cannot change it).
-- Gate loosened from admin-only to any member: the Team screen shows the
-- roster to every tier (the prototype's per-tier "can you invite" column).

DROP FUNCTION IF EXISTS public.get_company_member_status(text);
CREATE FUNCTION public.get_company_member_status(p_company_id text)
RETURNS TABLE(
  email text,
  org_role text,
  pending_org_role text,
  access_role text,
  service_line_scope text,
  has_account boolean,
  last_sign_in_at timestamptz,
  confirmed_at timestamptz,
  invite_status text,
  invited_at timestamptz
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
  SELECT
    l.name AS email,
    p.role AS org_role,
    l.pending_org_role,
    lc.role AS access_role,
    lc.service_line_scope,
    (u.id IS NOT NULL) AS has_account,
    u.last_sign_in_at,
    COALESCE(u.email_confirmed_at, u.confirmed_at) AS confirmed_at,
    CASE
      WHEN i.id IS NULL THEN NULL
      WHEN i.status = 'revoked' THEN 'revoked'
      WHEN u.last_sign_in_at IS NOT NULL THEN 'accepted'
      ELSE i.status
    END AS invite_status,
    i.created_at AS invited_at
  FROM public.licensees l
  JOIN public.licensee_companies lc ON lc.licensee_id = l.id
  LEFT JOIN public.profiles p ON lower(p.email) = lower(l.name)
  LEFT JOIN auth.users u ON lower(u.email) = lower(l.name)
  LEFT JOIN LATERAL (
    SELECT * FROM public.invites i2
     WHERE i2.company_id = lc.company_id AND i2.email = lower(l.name)
     ORDER BY i2.created_at DESC
     LIMIT 1
  ) i ON true
  WHERE lc.company_id = p_company_id
    AND public.has_company_access(p_company_id);
$function$;

GRANT EXECUTE ON FUNCTION public.get_company_member_status(text) TO authenticated;

-- ── 8. get_my_company_scopes: the caller's own membership rows ──────────────
-- Data path for client-side service-line tab filtering in FinancialTool.

CREATE OR REPLACE FUNCTION public.get_my_company_scopes()
RETURNS TABLE(company_id text, access_role text, service_line_scope text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT lc.company_id, lc.role AS access_role, lc.service_line_scope
    FROM public.licensee_companies lc
    JOIN public.licensees l ON l.id = lc.licensee_id
    JOIN public.profiles p ON lower(p.email) = lower(l.name)
   WHERE p.id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.get_my_company_scopes() FROM public;
GRANT EXECUTE ON FUNCTION public.get_my_company_scopes() TO authenticated;

-- ── 9. admin_list_invites: SuperAdmin read-only view with derived status ────

CREATE OR REPLACE FUNCTION public.admin_list_invites()
RETURNS TABLE(
  id uuid,
  company_id text,
  company_name text,
  email text,
  org_role text,
  service_line_scope text,
  access_role text,
  invited_by_email text,
  status text,
  effective_status text,
  created_at timestamptz,
  email_sent_at timestamptz,
  revoked_at timestamptz
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    i.id, i.company_id, c.name AS company_name, i.email, i.org_role,
    i.service_line_scope, i.access_role, i.invited_by_email, i.status,
    CASE
      WHEN i.status = 'revoked' THEN 'revoked'
      WHEN u.last_sign_in_at IS NOT NULL THEN 'accepted'
      ELSE i.status
    END AS effective_status,
    i.created_at, i.email_sent_at, i.revoked_at
  FROM public.invites i
  JOIN public.companies c ON c.id = i.company_id
  LEFT JOIN auth.users u ON lower(u.email) = i.email
  WHERE public.is_super_admin()
  ORDER BY i.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.admin_list_invites() FROM public;
GRANT EXECUTE ON FUNCTION public.admin_list_invites() TO authenticated;
