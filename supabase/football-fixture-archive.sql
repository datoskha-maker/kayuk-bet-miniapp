-- КАЮК BET: постоянный архив футбольных матчей
-- Запусти этот SQL в Supabase SQL Editor один раз.

create table if not exists public.football_fixture_archive (
  fixture_id bigint primary key,
  league_id integer,
  league text not null default 'Футбол',
  start_time timestamptz not null,
  status text not null default 'NS',
  elapsed integer,
  home_team text not null,
  away_team text not null,
  home_score integer,
  away_score integer,
  odds jsonb,
  source_updated_at timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists football_fixture_archive_start_time_idx
  on public.football_fixture_archive (start_time desc);

create index if not exists football_fixture_archive_status_idx
  on public.football_fixture_archive (status);

alter table public.football_fixture_archive enable row level security;

-- Доступ к архиву выполняется серверным API через service_role key.
-- Не создаём публичные политики.
