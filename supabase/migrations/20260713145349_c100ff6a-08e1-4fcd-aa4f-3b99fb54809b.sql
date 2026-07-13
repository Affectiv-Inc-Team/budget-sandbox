
-- Tier lookup for an arbitrary role string (mirrors src/lib/access.js ROLE_TIERS).
CREATE OR REPLACE FUNCTION public.role_tier(p_role text)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT CASE p_role
    WHEN 'OWNER' THEN 1
    WHEN 'CEO' THEN 2
    WHEN 'FINANCE' THEN 3
    WHEN 'REGIONAL_DIRECTOR' THEN 4
    WHEN 'PROGRAM_MANAGER' THEN 5
    WHEN 'HR_MANAGER' THEN 6
    WHEN 'SCHEDULER' THEN 7
    WHEN 'HOUSE_LEAD' THEN 8
    ELSE NULL END
$$;

-- Access role granted at invite time, derived from tier (mirrors accessRoleForTier).
CREATE OR REPLACE FUNCTION public.access_role_for_tier(p_tier integer)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT CASE
    WHEN p_tier <= 3 THEN 'admin'
    WHEN p_tier <= 6 THEN 'editor'
    ELSE 'read_only' END
$$;

-- 1. invites table
CREATE TABLE IF NOT EXISTS public.invites (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  email              text NOT NULL,
  org_role           text NOT NULL,
  service_line_scope text,
  invited_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status             text NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','sent','failed','accepted','revoked')),
  email_sent_at      timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invites_company_idx ON public.invites(company_id);
CREATE INDEX IF NOT EXISTS invites_email_idx   ON public.invites(lower(email));

-- 2. GRANTs (no direct INSERT for authenticated — use create_invite RPC)
GRANT SELECT, UPDATE, DELETE ON public.invites TO authenticated;
GRANT ALL ON public.invites TO service_role;

-- 3. RLS
ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invites: company admins can view"
  ON public.invites FOR SELECT TO authenticated
  USING (public.is_company_admin(company_id));

CREATE POLICY "invites: company admins can revoke"
  ON public.invites FOR UPDATE TO authenticated
  USING (public.is_company_admin(company_id))
  WITH CHECK (public.is_company_admin(company_id));

CREATE POLICY "invites: company admins can delete"
  ON public.invites FOR DELETE TO authenticated
  USING (public.is_company_admin(company_id));

-- 4. updated_at trigger (reuses existing set_updated_at())
CREATE TRIGGER invites_set_updated_at
  BEFORE UPDATE ON public.invites
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5. create_invite RPC — the single write path for new invites.
CREATE OR REPLACE FUNCTION public.create_invite(
  p_company_id         text,
  p_email              text,
  p_org_role           text,
  p_service_line_scope text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_email        text;
  v_inviter_tier int;
  v_target_tier  int;
  v_access_role  text;
  v_licensee_id  uuid;
  v_invite_id    uuid;
BEGIN
  v_email := lower(trim(p_email));
  IF v_email IS NULL OR v_email = '' THEN
    RAISE EXCEPTION 'email is required' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Membership: caller must belong to this company.
  IF NOT public.has_company_access(p_company_id) THEN
    RAISE EXCEPTION 'not authorized to invite to this company'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Tier rule.
  v_inviter_tier := public.profile_role_tier();
  v_target_tier  := public.role_tier(p_org_role);
  IF v_target_tier IS NULL THEN
    RAISE EXCEPTION 'invalid role: %', p_org_role USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF v_inviter_tier IS NULL OR v_inviter_tier >= 7 THEN
    RAISE EXCEPTION 'your role cannot send invites'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_inviter_tier <> 1 AND v_target_tier <= v_inviter_tier THEN
    RAISE EXCEPTION 'cannot invite a role at or above your own tier'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Scope rule.
  IF v_target_tier <= 3 THEN
    IF p_service_line_scope IS NOT NULL THEN
      RAISE EXCEPTION 'whole-company roles cannot be scoped to a service line'
        USING ERRCODE = 'invalid_parameter_value';
    END IF;
  ELSE
    IF p_service_line_scope IS NULL OR btrim(p_service_line_scope) = '' THEN
      RAISE EXCEPTION 'service line scope is required for this role'
        USING ERRCODE = 'invalid_parameter_value';
    END IF;
  END IF;

  v_access_role := public.access_role_for_tier(v_target_tier);

  -- Seed licensee + pending role + company membership so acceptance is a no-op.
  SELECT id INTO v_licensee_id FROM public.licensees WHERE lower(name) = v_email LIMIT 1;
  IF v_licensee_id IS NULL THEN
    INSERT INTO public.licensees (name, pending_org_role)
      VALUES (v_email, p_org_role)
      RETURNING id INTO v_licensee_id;
  ELSE
    UPDATE public.licensees SET pending_org_role = p_org_role WHERE id = v_licensee_id;
  END IF;

  INSERT INTO public.licensee_companies (licensee_id, company_id, role)
    VALUES (v_licensee_id, p_company_id, v_access_role)
  ON CONFLICT (licensee_id, company_id) DO UPDATE SET role = EXCLUDED.role;

  INSERT INTO public.invites (
    company_id, email, org_role, service_line_scope, invited_by, status
  ) VALUES (
    p_company_id, v_email, p_org_role, p_service_line_scope, auth.uid(), 'pending'
  ) RETURNING id INTO v_invite_id;

  RETURN v_invite_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_invite(text, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.create_invite(text, text, text, text) TO authenticated;
