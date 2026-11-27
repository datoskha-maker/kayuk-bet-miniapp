-- Global betting market templates for KAYUK BET.
-- Run this migration in the Supabase SQL Editor if migrations are not applied automatically.
create table if not exists public.market_templates (
  key text primary key,
  templates jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.market_templates enable row level security;

-- The Mini App API uses the service-role key on the server. No direct client policies are needed.
insert into public.market_templates (key, templates)
values ('global', '[]'::jsonb)
on conflict (key) do nothing;
