
drop table if exists public._migration_src_tables;

create extension if not exists postgres_fdw;
drop server if exists src_fmb cascade;
create server src_fmb foreign data wrapper postgres_fdw
  options (host 'aws-1-us-east-2.pooler.supabase.com', port '5432', dbname 'postgres');
create user mapping for current_user server src_fmb
  options (user 'postgres.nsxirokqumefxupauejc', password 'Sicodecare1@');

drop schema if exists src cascade;
create schema src;
import foreign schema public
  limit to (companies, licensees, licensee_companies, profiles)
  from server src_fmb into src;

set session_replication_role = replica;

insert into public.licensees (id, name, created_at)
  select id, name, created_at from src.licensees on conflict (id) do nothing;

insert into public.companies (id, name, archived, config, created_at, updated_at)
  select id, name, archived, config, created_at, updated_at from src.companies on conflict (id) do nothing;

insert into public.licensee_companies (licensee_id, company_id, role, assigned_at)
  select licensee_id, company_id, role, assigned_at from src.licensee_companies on conflict (licensee_id, company_id) do nothing;

insert into public.profiles (id, email, is_super_admin, created_at)
  select id, email, is_super_admin, created_at from src.profiles
  on conflict (id) do update set email = excluded.email, is_super_admin = excluded.is_super_admin;

set session_replication_role = default;

drop schema if exists src cascade;
drop user mapping if exists for current_user server src_fmb;
drop server if exists src_fmb cascade;
