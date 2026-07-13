-- Restore get_my_company_scopes() + service-line scope propagation, scoped
-- to work against Lovable's simpler invites implementation
-- (20260713145349_...sql), which is now canonical.
--
-- Context: a hand-authored invites migration (20260708190000_invites.sql)
-- was deleted 2026-07-13 because it hard-conflicted with Lovable's own
-- invites/create_invite implementation on replay (CREATE OR REPLACE
-- FUNCTION cannot drop a parameter default) and was never applied to the
-- hosted project anyway. That file also defined get_my_company_scopes() and
-- the licensee_companies.service_line_scope column TeamPanel.jsx depends on
-- to even discover which companies to render for a non-super-admin user —
-- without them, /team renders nothing for anyone but a super admin.
--
-- This migration does NOT touch supabase/migrations/20260713145349_...sql or
-- any function it defines (create_invite, role_tier, access_role_for_tier) —
-- it only adds new, independent objects that read what create_invite writes.
--
-- Lovable's create_invite writes licensee_companies.role (access level) but
-- never writes service_line_scope onto the membership row — it only stores
-- the scope on the invites audit row. Without the sync trigger below,
-- get_my_company_scopes() would report every member as whole-company access
-- regardless of the tier/scope they were actually invited at, silently
-- defeating the tab-filtering in FinancialTool.jsx (lines ~2523, ~2959) that
-- reads serviceLineScope from this RPC.

-- ── 1. service_line_scope column (was on the deleted migration) ────────────

ALTER TABLE public.licensee_companies ADD COLUMN IF NOT EXISTS service_line_scope text;

-- ── 2. get_my_company_scopes: the caller's own membership rows ─────────────
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

-- ── 3. Sync invites.service_line_scope -> licensee_companies ───────────────
-- Fires on any change to service_line_scope on an invites row (create_invite
-- inserting a new one, or a company admin editing one directly under
-- Lovable's "invites: company admins can revoke" UPDATE policy). The target
-- licensee_companies row already exists by the time this fires: create_invite
-- inserts it before inserting the invites row, in the same transaction.

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
