
create extension if not exists postgres_fdw;
drop server if exists src_fmb cascade;
create server src_fmb foreign data wrapper postgres_fdw
  options (host 'aws-1-us-east-2.pooler.supabase.com', port '5432', dbname 'postgres');
create user mapping for current_user server src_fmb
  options (user 'postgres.nsxirokqumefxupauejc', password 'Sicodecare1@');

drop schema if exists src cascade;
create schema src;
import foreign schema public from server src_fmb into src;

create table public._migration_src_tables as
  select table_name, (select count(*) from information_schema.columns c
                       where c.table_schema='src' and c.table_name=t.table_name) as col_count
  from information_schema.tables t where table_schema='src' order by table_name;

drop schema if exists src cascade;
drop user mapping if exists for current_user server src_fmb;
drop server if exists src_fmb cascade;
