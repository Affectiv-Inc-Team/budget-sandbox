
create table public.demo_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  company text,
  role text,
  message text,
  source_page text,
  user_agent text,
  created_at timestamptz not null default now()
);

grant insert on public.demo_requests to anon, authenticated;
grant select on public.demo_requests to authenticated;
grant all on public.demo_requests to service_role;

alter table public.demo_requests enable row level security;

create policy "anyone can submit a demo request"
  on public.demo_requests for insert
  to anon, authenticated
  with check (
    length(trim(name))  between 1 and 120
    and length(trim(email)) between 3 and 254
    and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
    and coalesce(length(company), 0) <= 200
    and coalesce(length(role), 0) <= 120
    and coalesce(length(message), 0) <= 2000
  );

create policy "super admins can read demo requests"
  on public.demo_requests for select
  to authenticated
  using (public.is_super_admin());
