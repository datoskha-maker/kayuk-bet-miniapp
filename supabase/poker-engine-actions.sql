-- KAYUK POKER: atomic player actions and betting-round progression.
alter table public.poker_game_players
  add column if not exists acted_this_street boolean not null default false;

create or replace function public.poker_act(
  p_user_id uuid,
  p_room_id uuid,
  p_action text,
  p_amount bigint default 0
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_game public.poker_games;
  v_player public.poker_game_players;
  v_active integer;
  v_pending integer;
  v_target bigint;
  v_pay bigint;
  v_next integer;
  v_winner uuid;
  v_stage text;
  v_board text[];
begin
  select * into v_game from public.poker_games
   where room_id=p_room_id and status not in ('complete','showdown')
   order by hand_no desc limit 1 for update;
  if not found then raise exception 'Активная раздача не найдена'; end if;

  select * into v_player from public.poker_game_players
   where game_id=v_game.id and user_id=p_user_id for update;
  if not found then raise exception 'Ты не участник этой раздачи'; end if;
  if v_player.folded or v_player.all_in then raise exception 'Ты уже не можешь сделать ход'; end if;
  if v_game.current_turn_seat is distinct from v_player.seat then raise exception 'Сейчас ход другого игрока'; end if;
  if v_game.action_deadline is not null and now() > v_game.action_deadline then
    p_action := 'fold';
  end if;

  v_target := v_player.street_contribution;
  if p_action='fold' then
    update public.poker_game_players set folded=true,acted_this_street=true,last_action='fold' where id=v_player.id;
  elsif p_action='check' then
    if v_player.street_contribution <> v_game.current_bet then raise exception 'Нельзя чекнуть: нужно уравнять ставку'; end if;
    update public.poker_game_players set acted_this_street=true,last_action='check' where id=v_player.id;
  elsif p_action='call' then
    v_pay := least(v_game.current_bet-v_player.street_contribution,v_player.stack);
    if v_pay <= 0 then raise exception 'Нет ставки для уравнивания'; end if;
    update public.poker_game_players set
      stack=stack-v_pay,street_contribution=street_contribution+v_pay,
      hand_contribution=hand_contribution+v_pay,
      all_in=(stack-v_pay=0),acted_this_street=true,last_action=case when stack-v_pay=0 then 'all-in' else 'call' end
      where id=v_player.id;
    update public.poker_games set pot=pot+v_pay where id=v_game.id;
  elsif p_action in ('bet','raise','all_in') then
    if p_action='all_in' then
      v_target := v_player.street_contribution+v_player.stack;
    else
      v_target := p_amount;
    end if;
    if v_target <= v_game.current_bet then raise exception 'Новая ставка должна быть выше текущей'; end if;
    if v_target > v_player.street_contribution+v_player.stack then raise exception 'Недостаточно фишек'; end if;
    if p_action='bet' and v_game.current_bet<>0 then raise exception 'Ставка уже открыта: используй raise'; end if;
    if p_action='raise' and v_target < v_game.current_bet+v_game.min_raise then raise exception 'Минимальное повышение: %',v_game.min_raise; end if;
    v_pay:=v_target-v_player.street_contribution;
    update public.poker_game_players set
      stack=stack-v_pay,street_contribution=v_target,
      hand_contribution=hand_contribution+v_pay,
      all_in=(stack-v_pay=0),acted_this_street=true,
      last_action=case when stack-v_pay=0 then 'all-in' else p_action end
      where id=v_player.id;
    if v_target-v_game.current_bet >= v_game.min_raise then
      update public.poker_game_players set acted_this_street=false
        where game_id=v_game.id and user_id<>p_user_id and not folded and not all_in;
    end if;
    update public.poker_games set pot=pot+v_pay,current_bet=v_target,
      min_raise=case when v_target-v_game.current_bet >= v_game.min_raise
        then v_target-v_game.current_bet else min_raise end where id=v_game.id;
  else
    raise exception 'Неизвестное действие';
  end if;

  select count(*) into v_active from public.poker_game_players where game_id=v_game.id and not folded;
  if v_active=1 then
    select user_id into v_winner from public.poker_game_players where game_id=v_game.id and not folded limit 1;
    update public.poker_game_players set stack=stack+v_game.pot where game_id=v_game.id and user_id=v_winner;
    update public.poker_room_players rp set stack=gp.stack
      from public.poker_game_players gp where gp.game_id=v_game.id and gp.user_id=rp.user_id and rp.room_id=p_room_id;
    update public.poker_games set status='complete',current_turn_seat=null,action_deadline=null,last_action='fold_win' where id=v_game.id;
    return jsonb_build_object('status','complete','winner_user_id',v_winner,'pot',v_game.pot);
  end if;

  select count(*) into v_pending from public.poker_game_players
   where game_id=v_game.id and not folded and not all_in
     and (not acted_this_street or street_contribution<v_game.current_bet);

  if v_pending=0 then
    v_board:=v_game.board;
    if v_game.status='preflop' then
      v_board:=v_board||v_game.deck[53:55];
      v_stage:='flop';
    elsif v_game.status='flop' then
      v_board:=v_board||v_game.deck[56:56];
      v_stage:='turn';
    elsif v_game.status='turn' then
      v_board:=v_board||v_game.deck[57:57];
      v_stage:='river';
    else
      update public.poker_games set status='showdown',current_turn_seat=null,action_deadline=null,board=v_board,last_action='showdown_required' where id=v_game.id;
      return jsonb_build_object('status','showdown','pot',v_game.pot,'board',v_board);
    end if;
    update public.poker_game_players set street_contribution=0,acted_this_street=false
      where game_id=v_game.id and not folded;
    select min(seat) into v_next from public.poker_game_players
      where game_id=v_game.id and seat>v_game.dealer_seat and not folded and not all_in;
    if v_next is null then
      select min(seat) into v_next from public.poker_game_players where game_id=v_game.id and not folded and not all_in;
    end if;
    if v_next is null then
      update public.poker_games set status='showdown',board=v_board,current_turn_seat=null,action_deadline=null,last_action='all_in_showdown' where id=v_game.id;
      return jsonb_build_object('status','showdown','pot',v_game.pot,'board',v_board);
    end if;
    update public.poker_games set status=v_stage,board=v_board,current_bet=0,
      current_turn_seat=v_next,action_deadline=now()+interval '30 seconds',last_action='street_advanced'
      where id=v_game.id;
    return jsonb_build_object('status',v_stage,'pot',v_game.pot,'board',v_board,'current_turn_seat',v_next);
  end if;

  select min(seat) into v_next from public.poker_game_players
   where game_id=v_game.id and seat>v_player.seat and not folded and not all_in
     and (not acted_this_street or street_contribution<(select current_bet from public.poker_games where id=v_game.id));
  if v_next is null then
    select min(seat) into v_next from public.poker_game_players
     where game_id=v_game.id and not folded and not all_in
       and (not acted_this_street or street_contribution<(select current_bet from public.poker_games where id=v_game.id));
  end if;
  update public.poker_games set current_turn_seat=v_next,action_deadline=now()+interval '30 seconds',
    last_action=p_action where id=v_game.id;
  return jsonb_build_object('status',v_game.status,'pot',v_game.pot,'current_turn_seat',v_next);
end;
$$;

revoke all on function public.poker_act(uuid,uuid,text,bigint) from public,anon,authenticated;
grant execute on function public.poker_act(uuid,uuid,text,bigint) to service_role;
