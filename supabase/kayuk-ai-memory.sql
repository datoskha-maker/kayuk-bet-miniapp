-- КАЮК AI: isolated long-term memory and opt-in controls.
-- Does not modify betting, balances, profiles, slots, or transactions.

create table if not exists public.kayuk_ai_members (
  telegram_user_id bigint primary key,
  username text,
  display_name text not null,
  opted_in boolean not null default false,
  memory jsonb not null default '{"facts":[],"running_jokes":[],"topics":[]}'::jsonb,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.kayuk_ai_events (
  update_id bigint primary key,
  chat_id bigint not null,
  created_at timestamptz not null default now()
);

create table if not exists public.kayuk_ai_state (
  id boolean primary key default true check (id = true),
  enabled boolean not null default false,
  last_reply_at timestamptz,
  updated_at timestamptz not null default now()
);

insert into public.kayuk_ai_state (id, enabled)
values (true, false)
on conflict (id) do nothing;

alter table public.kayuk_ai_members enable row level security;
alter table public.kayuk_ai_events enable row level security;
alter table public.kayuk_ai_state enable row level security;

revoke all on public.kayuk_ai_members from anon, authenticated;
revoke all on public.kayuk_ai_events from anon, authenticated;
revoke all on public.kayuk_ai_state from anon, authenticated;
grant all on public.kayuk_ai_members to service_role;
grant all on public.kayuk_ai_events to service_role;
grant all on public.kayuk_ai_state to service_role;

create index if not exists kayuk_ai_members_opted_in_idx
  on public.kayuk_ai_members (opted_in, last_seen_at desc);
create index if not exists kayuk_ai_events_created_at_idx
  on public.kayuk_ai_events (created_at desc);
