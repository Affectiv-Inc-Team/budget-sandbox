-- ═══════════════════════════════════════════════════════════════════════════
-- DATA MIGRATION  —  source "Financial Model Builder" (nsxirokqumefxupauejc)
--                    →  destination (Lovable-hosted Supabase)
--
-- HOW TO RUN: paste this into the DESTINATION project's SQL editor
-- (Supabase dashboard → SQL Editor for the Lovable project). Everything runs
-- on the destination side via postgres_fdw — no local files, no CLI.
--
-- ASSUMPTIONS:
--   • Auth users were already migrated (you confirmed this) with their UUIDs
--     PRESERVED — profiles.id → auth.users.id depends on that.
--   • The destination already has the same public schema (you confirmed this).
--   • You run this as the `postgres` role (the SQL editor does by default) —
--     required for `set session_replication_role`.
--
-- IDEMPOTENT: every insert uses ON CONFLICT, so you can re-run safely.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 0  (do this FIRST, separately) — copy the SSN encryption key.
-- Skip ONLY if you have no referral_ssn rows to migrate.
--
-- The encrypted SSN blobs are useless on the destination unless its Vault holds
-- the SOURCE's key. On the SOURCE project's SQL editor, run:
--
--     select decrypted_secret from vault.decrypted_secrets
--     where name = 'referral_ssn_key';
--
-- Copy that value, then on the DESTINATION run (replacing <KEY>):
--
--     update vault.secrets
--       set secret = '<KEY>'
--       where name = 'referral_ssn_key';
--
-- (If destination has no such secret yet: select vault.create_secret('<KEY>',
--  'referral_ssn_key', 'Symmetric key for referral SSN encryption (pgp_sym)');)
-- ─────────────────────────────────────────────────────────────────────────────


-- 1. Cross-database link extension ────────────────────────────────────────────
create extension if not exists postgres_fdw;

-- 2. Point at the SOURCE database ─────────────────────────────────────────────
--    Get host/port from the SOURCE project: Dashboard → Project Settings →
--    Database → Connection string. Use the *Session pooler* (port 5432) or the
--    *direct* connection — NOT the transaction pooler (6543); FDW needs a real
--    session. For the direct connection the host is db.<ref>.supabase.co.
create server if not exists src_fmb
  foreign data wrapper postgres_fdw
  options (
    host '<SOURCE_HOST>',     -- e.g. aws-0-us-east-1.pooler.supabase.com
    port '5432',
    dbname 'postgres'
  );

-- 3. Source credentials (stored in the destination catalog — dropped in step 8)
create user mapping if not exists for current_user
  server src_fmb
  options (
    user '<SOURCE_DB_USER>',          -- pooler: postgres.nsxirokqumefxupauejc | direct: postgres
    password '<SOURCE_DB_PASSWORD>'
  );

-- 4. Mirror the source public tables into a staging schema ─────────────────────
drop schema if exists src cascade;
create schema src;
import foreign schema public
  limit to (companies, licensees, licensee_companies, profiles,
            referrals, referral_ssn, referral_contacts, referral_activity,
            referral_status_history, referral_audit_log)
  from server src_fmb into src;

-- 5. VERIFY SCHEMA PARITY before copying. This should return ZERO rows; any row
--    is a column that differs (name/type/order) and will break the copy below.
select coalesce(s.table_name, d.table_name) as table_name,
       coalesce(s.column_name, d.column_name) as column_name,
       s.data_type as source_type, d.data_type as dest_type,
       case when d.column_name is null then 'MISSING ON DEST'
            when s.column_name is null then 'EXTRA ON DEST'
            else 'TYPE MISMATCH' end as issue
from   information_schema.columns s
full join information_schema.columns d
       on d.table_schema = 'public'
      and d.table_name   = s.table_name
      and d.column_name  = s.column_name
where  s.table_schema = 'src'
  and (d.column_name is null or s.column_name is null or s.data_type <> d.data_type);

-- ── If the query above returns rows, STOP and reconcile the schema first. ──
-- ── If it returns nothing, proceed. ───────────────────────────────────────


-- 6. Copy the data ────────────────────────────────────────────────────────────
--    session_replication_role = replica disables triggers + FK checks for this
--    session, so: (a) FK ordering doesn't matter, (b) the audit/history/timestamp
--    triggers don't fire and fabricate rows or reset timestamps. Columns are
--    listed explicitly so a differing column ORDER on the destination is fine.
set session_replication_role = replica;

insert into public.licensees (id, name, created_at)
  select id, name, created_at from src.licensees
  on conflict (id) do nothing;

insert into public.companies (id, name, archived, config, created_at, updated_at)
  select id, name, archived, config, created_at, updated_at from src.companies
  on conflict (id) do nothing;

insert into public.licensee_companies (licensee_id, company_id, role, assigned_at)
  select licensee_id, company_id, role, assigned_at from src.licensee_companies
  on conflict (licensee_id, company_id) do nothing;

-- profiles: sync the privilege flags onto the already-migrated auth users.
insert into public.profiles (id, email, is_super_admin, created_at, role)
  select id, email, is_super_admin, created_at, role from src.profiles
  on conflict (id) do update
    set email = excluded.email,
        is_super_admin = excluded.is_super_admin,
        role = excluded.role;

insert into public.referrals (
    id, company_id, display_label, stage, priority, source_type, intake_method,
    date_received, referring_party, assigned_to, first_name, last_name,
    preferred_name, dob, is_minor, ssn_last4, city, county, region, state,
    service_level, pay_source, tsc, next_followup_date, next_followup_owner,
    stage_entered_at, last_activity_at, outcome, outcome_reason, decision_date,
    client_record_link, details, created_by, created_at, updated_at)
  select
    id, company_id, display_label, stage, priority, source_type, intake_method,
    date_received, referring_party, assigned_to, first_name, last_name,
    preferred_name, dob, is_minor, ssn_last4, city, county, region, state,
    service_level, pay_source, tsc, next_followup_date, next_followup_owner,
    stage_entered_at, last_activity_at, outcome, outcome_reason, decision_date,
    client_record_link, details, created_by, created_at, updated_at
  from src.referrals
  on conflict (id) do nothing;

-- referral_ssn: only meaningful if STEP 0 (Vault key) was done.
insert into public.referral_ssn (referral_id, ssn_encrypted, updated_at)
  select referral_id, ssn_encrypted, updated_at from src.referral_ssn
  on conflict (referral_id) do nothing;

insert into public.referral_contacts (
    id, referral_id, company_id, kind, name, relationship, phone, email,
    address, is_primary, ok_to_share, created_at)
  select id, referral_id, company_id, kind, name, relationship, phone, email,
         address, is_primary, ok_to_share, created_at
  from src.referral_contacts
  on conflict (id) do nothing;

insert into public.referral_activity (
    id, referral_id, company_id, author_id, kind, body, created_at)
  select id, referral_id, company_id, author_id, kind, body, created_at
  from src.referral_activity
  on conflict (id) do nothing;

insert into public.referral_status_history (
    id, referral_id, company_id, from_stage, to_stage, changed_by, changed_at)
  select id, referral_id, company_id, from_stage, to_stage, changed_by, changed_at
  from src.referral_status_history
  on conflict (id) do nothing;

insert into public.referral_audit_log (
    id, referral_id, company_id, actor_id, action, field, detail, created_at)
  select id, referral_id, company_id, actor_id, action, field, detail, created_at
  from src.referral_audit_log
  on conflict (id) do nothing;

set session_replication_role = default;


-- 7. VERIFY row counts (source vs destination) ────────────────────────────────
select 'companies'              t, (select count(*) from public.companies)              dest, (select count(*) from src.companies)              src
union all select 'licensees',              (select count(*) from public.licensees),              (select count(*) from src.licensees)
union all select 'licensee_companies',     (select count(*) from public.licensee_companies),     (select count(*) from src.licensee_companies)
union all select 'profiles',               (select count(*) from public.profiles),               (select count(*) from src.profiles)
union all select 'referrals',              (select count(*) from public.referrals),              (select count(*) from src.referrals)
union all select 'referral_ssn',           (select count(*) from public.referral_ssn),           (select count(*) from src.referral_ssn)
union all select 'referral_contacts',      (select count(*) from public.referral_contacts),      (select count(*) from src.referral_contacts)
union all select 'referral_activity',      (select count(*) from public.referral_activity),      (select count(*) from src.referral_activity)
union all select 'referral_status_history',(select count(*) from public.referral_status_history),(select count(*) from src.referral_status_history)
union all select 'referral_audit_log',     (select count(*) from public.referral_audit_log),     (select count(*) from src.referral_audit_log);


-- 8. CLEAN UP — removes the staging schema and the stored source password ──────
drop schema if exists src cascade;
drop user mapping if exists for current_user server src_fmb;
drop server if exists src_fmb cascade;
