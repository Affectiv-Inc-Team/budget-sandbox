-- ============ 1) initial schema ============
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  email text,
  is_super_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users for each row execute procedure public.handle_new_user();

create table public.licensees (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.companies (
  id text primary key,
  name text not null,
  archived boolean not null default false,
  config jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger companies_set_updated_at
  before update on public.companies for each row execute procedure public.set_updated_at();

create table public.licensee_companies (
  licensee_id uuid not null references public.licensees on delete cascade,
  company_id  text not null references public.companies on delete cascade,
  role text not null default 'editor' check (role in ('editor','read_only')),
  assigned_at timestamptz not null default now(),
  primary key (licensee_id, company_id)
);

alter table public.profiles enable row level security;
create policy "profiles: own row read"   on public.profiles for select using (auth.uid() = id);
create policy "profiles: own row update" on public.profiles for update using (auth.uid() = id);

alter table public.companies enable row level security;
create policy "companies: super admin full access" on public.companies for all
  using (exists (select 1 from public.profiles where id = auth.uid() and is_super_admin = true));
create policy "companies: licensee read access" on public.companies for select
  using (exists (
    select 1 from public.licensee_companies lc
    join public.licensees l on l.id = lc.licensee_id
    join public.profiles  p on p.email = l.name
    where lc.company_id = companies.id and p.id = auth.uid()
  ));
create policy "companies: licensee editor write access" on public.companies for update
  using (exists (
    select 1 from public.licensee_companies lc
    join public.licensees l on l.id = lc.licensee_id
    join public.profiles  p on p.email = l.name
    where lc.company_id = companies.id and lc.role = 'editor' and p.id = auth.uid()
  ));

alter table public.licensee_companies enable row level security;
create policy "licensee_companies: super admin full access" on public.licensee_companies for all
  using (exists (select 1 from public.profiles where id = auth.uid() and is_super_admin = true));

alter table public.licensees enable row level security;
create policy "licensees: super admin full access" on public.licensees for all
  using (exists (select 1 from public.profiles where id = auth.uid() and is_super_admin = true));

-- ============ 2) grants for authenticated ============
grant select on public.profiles to authenticated;
grant select, insert, update, delete on public.companies to authenticated;
grant select, insert, update, delete on public.licensees to authenticated;
grant select, insert, update, delete on public.licensee_companies to authenticated;

-- ============ 3) role grant fixes ============
grant select, insert, update, delete on public.profiles          to service_role;
grant select, insert, update, delete on public.companies         to service_role;
grant select, insert, update, delete on public.licensees         to service_role;
grant select, insert, update, delete on public.licensee_companies to service_role;
grant select on public.companies to anon;
grant update on public.profiles to authenticated;

-- ============ 4) referral tracker ============
create extension if not exists pgcrypto;
create extension if not exists supabase_vault;

alter table public.profiles add column if not exists role text;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'referral_ssn_key') then
    perform vault.create_secret(
      encode(gen_random_bytes(32), 'hex'),
      'referral_ssn_key',
      'Symmetric key for referral SSN encryption (pgp_sym)'
    );
  end if;
end $$;

create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.profiles where id = auth.uid() and is_super_admin = true);
$$;

create or replace function public.profile_role_tier()
returns int language sql stable security definer set search_path = public, pg_temp as $$
  select case
    when p.is_super_admin then 1
    else case p.role
      when 'OWNER' then 1
      when 'CEO' then 2
      when 'FINANCE' then 3
      when 'REGIONAL_DIRECTOR' then 4
      when 'PROGRAM_MANAGER' then 5
      when 'HR_MANAGER' then 6
      when 'SCHEDULER' then 7
      when 'HOUSE_LEAD' then 8
      else 2
    end
  end
  from public.profiles p where p.id = auth.uid();
$$;

create or replace function public.has_company_access(p_company_id text)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select public.is_super_admin() or exists (
    select 1 from public.licensee_companies lc
    join public.licensees l on l.id = lc.licensee_id
    join public.profiles  p on p.email = l.name
    where lc.company_id = p_company_id and p.id = auth.uid()
  );
$$;

create or replace function public.can_edit_company(p_company_id text)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select public.is_super_admin() or exists (
    select 1 from public.licensee_companies lc
    join public.licensees l on l.id = lc.licensee_id
    join public.profiles  p on p.email = l.name
    where lc.company_id = p_company_id and lc.role = 'editor' and p.id = auth.uid()
  );
$$;

create table public.referrals (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.companies on delete cascade,
  display_label text,
  stage text not null default 'NEW_INQUIRY',
  priority text not null default 'normal',
  source_type text,
  intake_method text,
  date_received date,
  referring_party jsonb,
  assigned_to uuid references public.profiles,
  first_name text,
  last_name text,
  preferred_name text,
  dob date,
  is_minor boolean,
  ssn_last4 text,
  city text,
  county text,
  region text,
  state text,
  service_level text,
  pay_source text,
  tsc jsonb,
  next_followup_date date,
  next_followup_owner uuid references public.profiles,
  stage_entered_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  outcome text,
  outcome_reason text,
  decision_date date,
  client_record_link text,
  details jsonb not null default '{}',
  created_by uuid references public.profiles default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index referrals_company_idx   on public.referrals (company_id);
create index referrals_stage_idx     on public.referrals (company_id, stage);
create index referrals_assigned_idx  on public.referrals (assigned_to);
create index referrals_followup_idx  on public.referrals (next_followup_date);
create trigger referrals_set_updated_at
  before update on public.referrals for each row execute procedure public.set_updated_at();

create table public.referral_ssn (
  referral_id uuid primary key references public.referrals on delete cascade,
  ssn_encrypted bytea not null,
  updated_at timestamptz not null default now()
);

create table public.referral_contacts (
  id uuid primary key default gen_random_uuid(),
  referral_id uuid not null references public.referrals on delete cascade,
  company_id text not null references public.companies on delete cascade,
  kind text not null default 'family',
  name text, relationship text, phone text, email text, address text,
  is_primary boolean not null default false,
  ok_to_share boolean not null default false,
  created_at timestamptz not null default now()
);
create index referral_contacts_referral_idx on public.referral_contacts (referral_id);

create table public.referral_activity (
  id uuid primary key default gen_random_uuid(),
  referral_id uuid not null references public.referrals on delete cascade,
  company_id text not null references public.companies on delete cascade,
  author_id uuid references public.profiles default auth.uid(),
  kind text not null default 'note',
  body text,
  created_at timestamptz not null default now()
);
create index referral_activity_referral_idx on public.referral_activity (referral_id);

create table public.referral_status_history (
  id uuid primary key default gen_random_uuid(),
  referral_id uuid not null references public.referrals on delete cascade,
  company_id text not null references public.companies on delete cascade,
  from_stage text, to_stage text,
  changed_by uuid,
  changed_at timestamptz not null default now()
);
create index referral_status_history_referral_idx on public.referral_status_history (referral_id);

create table public.referral_audit_log (
  id uuid primary key default gen_random_uuid(),
  referral_id uuid,
  company_id text,
  actor_id uuid,
  action text not null,
  field text,
  detail jsonb,
  created_at timestamptz not null default now()
);
create index referral_audit_company_idx  on public.referral_audit_log (company_id);
create index referral_audit_referral_idx on public.referral_audit_log (referral_id);

create or replace function public.set_referral_child_company()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  select company_id into new.company_id from public.referrals where id = new.referral_id;
  return new;
end;
$$;
create trigger referral_contacts_set_company before insert on public.referral_contacts
  for each row execute procedure public.set_referral_child_company();
create trigger referral_activity_set_company before insert on public.referral_activity
  for each row execute procedure public.set_referral_child_company();

create or replace function public.referrals_touch_timestamps()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if new.stage is distinct from old.stage then new.stage_entered_at := now(); end if;
  new.last_activity_at := now();
  return new;
end;
$$;
create trigger referrals_touch_timestamps_trg before update on public.referrals
  for each row execute procedure public.referrals_touch_timestamps();

create or replace function public.referrals_log_stage_change()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.stage is distinct from old.stage then
    insert into public.referral_status_history (referral_id, company_id, from_stage, to_stage, changed_by)
    values (new.id, new.company_id, old.stage, new.stage, auth.uid());
  end if;
  return new;
end;
$$;
create trigger referrals_log_stage_change_trg after update on public.referrals
  for each row execute procedure public.referrals_log_stage_change();

create or replace function public.referrals_audit()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    insert into public.referral_audit_log (referral_id, company_id, actor_id, action)
      values (new.id, new.company_id, auth.uid(), 'create');
    return new;
  elsif tg_op = 'UPDATE' then
    insert into public.referral_audit_log (referral_id, company_id, actor_id, action, detail)
      values (new.id, new.company_id, auth.uid(),
        case when new.stage is distinct from old.stage then 'stage_change' else 'update' end,
        case when new.stage is distinct from old.stage
          then jsonb_build_object('from', old.stage, 'to', new.stage) else null end);
    return new;
  elsif tg_op = 'DELETE' then
    insert into public.referral_audit_log (referral_id, company_id, actor_id, action)
      values (old.id, old.company_id, auth.uid(), 'delete');
    return old;
  end if;
  return null;
end;
$$;
create trigger referrals_audit_trg after insert or update or delete on public.referrals
  for each row execute procedure public.referrals_audit();

create or replace function public.referral_activity_touch_parent()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.referrals set last_activity_at = now() where id = new.referral_id;
  return new;
end;
$$;
create trigger referral_activity_touch_parent_trg after insert on public.referral_activity
  for each row execute procedure public.referral_activity_touch_parent();

alter table public.referrals             enable row level security;
alter table public.referral_ssn          enable row level security;
alter table public.referral_contacts     enable row level security;
alter table public.referral_activity     enable row level security;
alter table public.referral_status_history enable row level security;
alter table public.referral_audit_log    enable row level security;

create policy "referrals: tenant read"   on public.referrals for select
  using (public.has_company_access(company_id));
create policy "referrals: tenant insert" on public.referrals for insert
  with check (public.can_edit_company(company_id));
create policy "referrals: tenant update" on public.referrals for update
  using (public.can_edit_company(company_id))
  with check (public.can_edit_company(company_id));
create policy "referrals: tenant delete" on public.referrals for delete
  using (public.can_edit_company(company_id));

create policy "referral_contacts: tenant read"   on public.referral_contacts for select
  using (public.has_company_access(company_id));
create policy "referral_contacts: tenant insert" on public.referral_contacts for insert
  with check (public.can_edit_company((select company_id from public.referrals where id = referral_id)));
create policy "referral_contacts: tenant update" on public.referral_contacts for update
  using (public.can_edit_company(company_id));
create policy "referral_contacts: tenant delete" on public.referral_contacts for delete
  using (public.can_edit_company(company_id));

create policy "referral_activity: tenant read"   on public.referral_activity for select
  using (public.has_company_access(company_id));
create policy "referral_activity: tenant insert" on public.referral_activity for insert
  with check (public.can_edit_company((select company_id from public.referrals where id = referral_id)));

create policy "referral_status_history: tenant read" on public.referral_status_history for select
  using (public.has_company_access(company_id));

create policy "referral_audit_log: tenant read" on public.referral_audit_log for select
  using (public.has_company_access(company_id));

grant select, insert, update, delete on public.referrals             to authenticated;
grant select, insert, update, delete on public.referral_contacts     to authenticated;
grant select, insert                 on public.referral_activity     to authenticated;
grant select                         on public.referral_status_history to authenticated;
grant select                         on public.referral_audit_log    to authenticated;

revoke all on public.referral_ssn from anon, authenticated;

grant select, insert, update, delete on public.referrals               to service_role;
grant select, insert, update, delete on public.referral_ssn            to service_role;
grant select, insert, update, delete on public.referral_contacts       to service_role;
grant select, insert, update, delete on public.referral_activity       to service_role;
grant select, insert, update, delete on public.referral_status_history to service_role;
grant select, insert, update, delete on public.referral_audit_log      to service_role;

create or replace function public.referral_set_ssn(p_referral_id uuid, p_ssn text)
returns void language plpgsql security definer
set search_path = public, extensions, vault, pg_temp as $$
declare
  v_company text; v_key text; v_digits text;
begin
  select company_id into v_company from public.referrals where id = p_referral_id;
  if v_company is null then raise exception 'referral not found' using errcode = 'no_data_found'; end if;
  if not public.can_edit_company(v_company) then
    raise exception 'not authorized to edit this referral' using errcode = 'insufficient_privilege';
  end if;

  v_digits := nullif(regexp_replace(coalesce(p_ssn, ''), '\D', '', 'g'), '');

  if v_digits is null then
    delete from public.referral_ssn where referral_id = p_referral_id;
    update public.referrals set ssn_last4 = null where id = p_referral_id;
  else
    select decrypted_secret into v_key from vault.decrypted_secrets where name = 'referral_ssn_key' limit 1;
    insert into public.referral_ssn (referral_id, ssn_encrypted, updated_at)
      values (p_referral_id, pgp_sym_encrypt(v_digits, v_key), now())
      on conflict (referral_id) do update set ssn_encrypted = excluded.ssn_encrypted, updated_at = now();
    update public.referrals set ssn_last4 = right(v_digits, 4) where id = p_referral_id;
  end if;

  insert into public.referral_audit_log (referral_id, company_id, actor_id, action, field)
    values (p_referral_id, v_company, auth.uid(), 'set_ssn', 'ssn');
end;
$$;

create or replace function public.referral_reveal_ssn(p_referral_id uuid)
returns text language plpgsql security definer
set search_path = public, extensions, vault, pg_temp as $$
declare
  v_company text; v_key text; v_ssn text;
begin
  select company_id into v_company from public.referrals where id = p_referral_id;
  if v_company is null then raise exception 'referral not found' using errcode = 'no_data_found'; end if;
  if not public.has_company_access(v_company) then
    raise exception 'not authorized for this referral' using errcode = 'insufficient_privilege';
  end if;
  if public.profile_role_tier() > 3 then
    raise exception 'role not permitted to unmask SSN' using errcode = 'insufficient_privilege';
  end if;

  insert into public.referral_audit_log (referral_id, company_id, actor_id, action, field)
    values (p_referral_id, v_company, auth.uid(), 'reveal_ssn', 'ssn');

  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'referral_ssn_key' limit 1;
  select pgp_sym_decrypt(ssn_encrypted, v_key) into v_ssn
    from public.referral_ssn where referral_id = p_referral_id;
  return v_ssn;
end;
$$;

revoke all on function public.referral_set_ssn(uuid, text)    from public;
revoke all on function public.referral_reveal_ssn(uuid)       from public;
grant execute on function public.referral_set_ssn(uuid, text) to authenticated, service_role;
grant execute on function public.referral_reveal_ssn(uuid)    to authenticated, service_role;

-- ============ 5) anon SELECT for RLS subquery evaluation ============
grant select on public.profiles           to anon;
grant select on public.licensee_companies to anon;
grant select on public.licensees          to anon;