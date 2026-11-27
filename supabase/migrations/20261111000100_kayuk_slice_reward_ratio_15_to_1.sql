create or replace function public.finish_kayuk_slice_game(
  p_session_id uuid,
  p_user_id uuid,
  p_score bigint,
  p_max_combo integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_session public.slice_game_sessions%rowtype;
  v_balance bigint;
  v_reward bigint;
  v_elapsed numeric;
  v_existing public.slice_game_scores%rowtype;
begin
  if p_score is null or p_score < 0 then
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

  if now() < v_session.started_at then
    raise exception 'Invalid session start time';
  end if;

  -- Anti-cheat sanity check remains rate-based, not duration-based.
  v_elapsed := greatest(1, extract(epoch from (now() - v_session.started_at)));
  if p_score > floor(v_elapsed * 2000)::bigint then
    raise exception 'Score exceeds plausible rate';
  end if;

  -- Integer division: 1 balance unit for every complete 15 score points.
  v_reward := floor(p_score::numeric / 15)::bigint;

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
$function$;