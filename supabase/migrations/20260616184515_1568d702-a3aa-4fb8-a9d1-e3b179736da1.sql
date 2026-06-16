
-- Prevent privilege escalation via profiles UPDATE.
-- The "own row update" policy alone permits updates to any column, including
-- is_super_admin and role. Lock those down with column-level grants so even
-- a permissive policy cannot let a user elevate themselves.

revoke update on public.profiles from authenticated;
grant  update (email) on public.profiles to authenticated;

-- Defense-in-depth trigger: block any change to is_super_admin or role unless
-- the current_user is service_role (or postgres, for migrations).
create or replace function public.prevent_profile_privilege_escalation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (new.is_super_admin is distinct from old.is_super_admin
      or new.role is distinct from old.role)
     and current_user not in ('service_role','postgres','supabase_admin') then
    raise exception 'not allowed to modify privilege columns';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_prevent_privilege_escalation on public.profiles;
create trigger profiles_prevent_privilege_escalation
  before update on public.profiles
  for each row execute function public.prevent_profile_privilege_escalation();
