-- One owner-created login for the EAGLE TRADES dashboard.
create table if not exists public.app_owner_login (
  id boolean primary key default true check (id = true),
  username text not null unique,
  auth_email text not null unique,
  created_at timestamptz not null default now()
);
alter table public.app_owner_login enable row level security;
revoke all on public.app_owner_login from anon, authenticated;
