-- KAYUK SLICE: isolated game sessions, score history and atomic 1:1 virtual-balance rewards.
create table if not exists public.slice_game_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '90 seconds'),
  finished_at timestamptz,
  score bigint,
  reward bigint,
  max_combo integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.slice_game_scores (
  id bigint generated always as identity primary key,
  session_id uuid not null unique references public.slice_game_sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  score bigint not null check (score >= 0),
  reward bigint not null check (reward >= 0),
  max_combo integer not null default 0 check (max_combo >= 0),
  created_at timestamptz not null default now()
);

create index if not exists slice_game_scores_user_score_idx
  on public.slice_game_scores(user_id, score desc);
create index if not exists slice_game_sessions_user_created_idx
  on public.slice_game_sessions(user_id, created_at desc);

alter table public.slice_game_sessions enable row level security;
alter table public.slice_game_scores enable row level security;
revoke all on public.slice_game_sessions from anon, authenticated, public;
revoke all on public.slice_game_scores from anon, authenticated, public;
grant all on public.slice_game_sessions to service_role;
grant all on public.slice_game_scores to service_role;
grant usage, select on sequence public.slice_game_scores_id_seq to service_role;

alter table public.transactions drop constraint if exists transactions_type_check;
alter table public.transactions add constraint transactions_type_check
  check (type = any (array['deposit','withdrawal','bet','bet_placed','bet_won','bet_lost','refund','admin_adjustment','slice_reward']::text[]));

create or replace function public.finish_kayuk_slice_game(
  p_session_id uuid,
  p_user_id uuid,
  p_score bigint,
  p_max_combo integer default 0
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.slice_game_sessions%rowtype;
  v_balance bigint;
  v_reward bigint;
  v_elapsed numeric;
  v_existing public.slice_game_scores%rowtype;
begin
  if p_score is null or p_score < 0 or p_score > 120000 then
    raise exception 'Invalid score';
  end if;
  if p_max_combo is null or p_max_combo < 0 or p_max_combo > 1000 then
    raise exception 'Invalid combo';
  end if;

  select * into v_session
  from public.slice_game_sessions
  where id = p_session_id and user_id = p_user_id
  for update;

  if not found then
    raise exception 'Game session not found';
  end if;

  if v_session.finished_at is not null then
    select * into v_existing from public.slice_game_scores where session_id = p_session_id;
    select balance into v_balance from public.balances where user_id = p_user_id;
    return jsonb_build_object(
      'score', coalesce(v_existing.score, v_session.score, 0),
      'reward', coalesce(v_existing.reward, v_session.reward, 0),
      'balance', coalesce(v_balance, 0),
      'maxCombo', coalesce(v_existing.max_combo, v_session.max_combo, 0),
      'alreadyCredited', true
    );
  end if;

  if now() < v_session.started_at or now() > v_session.expires_at + interval '30 seconds' then
    raise exception 'Game session expired';
  end if;

  v_elapsed := greatest(1, extract(epoch from (now() - v_session.started_at)));
  if p_score > least(120000, floor(v_elapsed * 2000)::bigint) then
    raise exception 'Score exceeds session limit';
  end if;

  v_reward := p_score;
  insert into public.slice_game_scores(session_id, user_id, score, reward, max_combo)
  values (p_session_id, p_user_id, p_score, v_reward, p_max_combo);

  update public.balances
  set balance = balance + v_reward, updated_at = now()
  where user_id = p_user_id
  returning balance into v_balance;

  if not found then
    raise exception 'Player balance not found';
  end if;

  if v_reward > 0 then
    insert into public.transactions(user_id, amount, type, note)
    values (p_user_id, v_reward, 'slice_reward', 'КАЮК SLICE · награда за игру · сессия ' || p_session_id::text);
  end if;

  update public.slice_game_sessions
  set finished_at = now(), score = p_score, reward = v_reward, max_combo = p_max_combo
  where id = p_session_id;

  return jsonb_build_object(
    'score', p_score,
    'reward', v_reward,
    'balance', v_balance,
    'maxCombo', p_max_combo,
    'alreadyCredited', false
  );
end;
$$;

revoke all on function public.finish_kayuk_slice_game(uuid, uuid, bigint, integer) from public, anon, authenticated;
grant execute on function public.finish_kayuk_slice_game(uuid, uuid, bigint, integer) to service_role;
