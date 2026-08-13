ALTER TABLE public.licensee_companies ADD COLUMN IF NOT EXISTS service_line_scope text;

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

CREATE OR REPLACE FUNCTION public.sync_invite_scope_to_membership()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
declare
  v_licensee_id uuid;
begin
  select id into v_licensee_id from public.licensees where lower(name) = lower(NEW.email) limit 1;
  if v_licensee_id is not null then
    update public.licensee_companies
       set service_line_scope = NEW.service_line_scope
     where licensee_id = v_licensee_id and company_id = NEW.company_id;
  end if;
  return NEW;
end;
$$;

DROP TRIGGER IF EXISTS invites_sync_scope ON public.invites;
CREATE TRIGGER invites_sync_scope
  AFTER INSERT OR UPDATE OF service_line_scope ON public.invites
  FOR EACH ROW EXECUTE FUNCTION public.sync_invite_scope_to_membership();