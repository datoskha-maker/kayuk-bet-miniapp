-- Run this once in Supabase SQL Editor for the KAYUK BET live football feed.
create table if not exists public.football_cache (
  id integer primary key check (id = 1),
  fixtures jsonb not null default '[]'::jsonb,
  odds jsonb not null default '{}'::jsonb,
  live jsonb not null default '[]'::jsonb,
  fixtures_updated_at timestamptz,
  odds_updated_at timestamptz,
  live_updated_at timestamptz,
  updated_at timestamptz
);

alter table public.football_cache enable row level security;

-- Only the server uses the service-role key. No public or anon policies are created.
revoke all on public.football_cache from anon, authenticated;
grant all on public.football_cache to service_role;

insert into public.football_cache (id)
values (1)
on conflict (id) do nothing;
