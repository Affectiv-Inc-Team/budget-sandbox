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
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT
    i.id,
    i.company_id,
    c.name AS company_name,
    i.email,
    i.org_role,
    i.service_line_scope,
    lc.role AS access_role,
    p.email AS invited_by_email,
    i.status,
    CASE
      WHEN i.status = 'pending' AND u.id IS NOT NULL THEN 'accepted'
      ELSE i.status
    END AS effective_status,
    i.created_at,
    i.email_sent_at,
    CASE WHEN i.status = 'revoked' THEN i.updated_at ELSE NULL END AS revoked_at
  FROM public.invites i
  LEFT JOIN public.companies c ON c.id = i.company_id
  LEFT JOIN public.profiles  p ON p.id = i.invited_by
  LEFT JOIN public.licensees l ON lower(l.name) = lower(i.email)
  LEFT JOIN public.licensee_companies lc
         ON lc.licensee_id = l.id AND lc.company_id = i.company_id
  LEFT JOIN auth.users u ON lower(u.email) = lower(i.email)
  WHERE public.is_super_admin() OR public.is_company_admin(i.company_id)
  ORDER BY i.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.admin_list_invites() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_invites() TO authenticated;

CREATE OR REPLACE FUNCTION public.revoke_invite(p_invite_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_company_id text;
  v_email      text;
  v_licensee   uuid;
BEGIN
  SELECT company_id, lower(email) INTO v_company_id, v_email
    FROM public.invites WHERE id = p_invite_id;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'invite not found' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT (public.is_super_admin() OR public.is_company_admin(v_company_id)) THEN
    RAISE EXCEPTION 'not authorized to revoke this invite' USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.invites SET status = 'revoked' WHERE id = p_invite_id;

  SELECT id INTO v_licensee FROM public.licensees WHERE lower(name) = v_email LIMIT 1;

  IF v_licensee IS NOT NULL THEN
    DELETE FROM public.licensee_companies
      WHERE licensee_id = v_licensee AND company_id = v_company_id;
    UPDATE public.licensees SET pending_org_role = NULL
      WHERE id = v_licensee AND pending_org_role IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM public.licensee_companies WHERE licensee_id = v_licensee);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_invite(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_invite(uuid) TO authenticated;