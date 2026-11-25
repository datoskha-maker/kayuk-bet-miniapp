-- KAYUK POKER: Texas Hold'em hand ranking and side-pot settlement.
create or replace function public.poker_score5(p_cards text[])
returns bigint
language plpgsql immutable
set search_path=public,pg_temp
as $$
declare
  v_ranks integer[];
  v_counts integer[];
  v_unique integer[];
  v_flush boolean;
  v_straight integer:=0;
  v_category integer:=0;
  v_k integer[]:=array[0,0,0,0,0];
  v_score bigint;
  v_i integer;
  v_pos integer:=2;
begin
  if cardinality(p_cards)<>5 then raise exception 'Для оценки нужны ровно 5 карт'; end if;
  select array_agg(rank order by cnt desc,rank desc),array_agg(cnt order by cnt desc,rank desc)
    into v_ranks,v_counts
  from (
    select case left(card,1)
      when '2' then 2 when '3' then 3 when '4' then 4 when '5' then 5
      when '6' then 6 when '7' then 7 when '8' then 8 when '9' then 9
      when 'T' then 10 when 'J' then 11 when 'Q' then 12 when 'K' then 13
      when 'A' then 14 else 0 end as rank,count(*) as cnt
    from unnest(p_cards) card group by 1
  ) q;
  select count(distinct right(card,1))=1 into v_flush from unnest(p_cards) card;
  select array_agg(distinct rank order by rank desc) into v_unique
  from (
    select case left(card,1)
      when '2' then 2 when '3' then 3 when '4' then 4 when '5' then 5
      when '6' then 6 when '7' then 7 when '8' then 8 when '9' then 9
      when 'T' then 10 when 'J' then 11 when 'Q' then 12 when 'K' then 13
      when 'A' then 14 else 0 end as rank
    from unnest(p_cards) card
  ) q;
  if cardinality(v_unique)=5 then
    if v_unique[1]-v_unique[5]=4 then v_straight:=v_unique[1];
    elsif v_unique=array[14,5,4,3,2] then v_straight:=5;
    end if;
  end if;

  if v_flush and v_straight>0 then
    v_category:=8; v_k[1]:=v_straight;
  elsif v_counts[1]=4 then
    v_category:=7; v_k[1]:=v_ranks[1]; v_k[2]:=v_ranks[2];
  elsif v_counts[1]=3 and v_counts[2]=2 then
    v_category:=6; v_k[1]:=v_ranks[1]; v_k[2]:=v_ranks[2];
  elsif v_flush then
    v_category:=5;
    for v_i in 1..5 loop v_k[v_i]:=v_unique[v_i]; end loop;
  elsif v_straight>0 then
    v_category:=4; v_k[1]:=v_straight;
  elsif v_counts[1]=3 then
    v_category:=3; v_k[1]:=v_ranks[1];
    for v_i in 2..cardinality(v_ranks) loop
      if v_counts[v_i]=1 then v_k[v_pos]:=v_ranks[v_i]; v_pos:=v_pos+1; end if;
    end loop;
  elsif v_counts[1]=2 and v_counts[2]=2 then
    v_category:=2; v_k[1]:=greatest(v_ranks[1],v_ranks[2]);
    v_k[2]:=least(v_ranks[1],v_ranks[2]); v_k[3]:=v_ranks[3];
  elsif v_counts[1]=2 then
    v_category:=1; v_k[1]:=v_ranks[1];
    for v_i in 2..cardinality(v_ranks) loop
      if v_counts[v_i]=1 then v_k[v_pos]:=v_ranks[v_i]; v_pos:=v_pos+1; end if;
    end loop;
  else
    v_category:=0;
    for v_i in 1..5 loop v_k[v_i]:=v_unique[v_i]; end loop;
  end if;
  v_score:=v_category*759375+v_k[1]*50625+v_k[2]*3375+v_k[3]*225+v_k[4]*15+v_k[5];
  return v_score;
end;
$$;

create or replace function public.poker_score7(p_cards text[])
returns bigint
language plpgsql immutable
set search_path=public,pg_temp
as $$
declare
  v_best bigint:=-1;
  v_score bigint;
  i integer; j integer; k integer; l integer; m integer;
begin
  if cardinality(p_cards)<>7 then raise exception 'Для оценки нужны 7 карт'; end if;
  for i in 1..3 loop
    for j in i+1..4 loop
      for k in j+1..5 loop
        for l in k+1..6 loop
          for m in l+1..7 loop
            v_score:=public.poker_score5(array[p_cards[i],p_cards[j],p_cards[k],p_cards[l],p_cards[m]]);
            if v_score>v_best then v_best:=v_score; end if;
          end loop;
        end loop;
      end loop;
    end loop;
  end loop;
  return v_best;
end;
$$;

create or replace function public.poker_settle_showdown(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_game public.poker_games;
  v_level record;
  v_player record;
  v_winner record;
  v_eligible uuid[];
  v_winners uuid[];
  v_best bigint;
  v_score bigint;
  v_previous bigint:=0;
  v_layer bigint;
  v_paid bigint:=0;
  v_share bigint;
  v_remainder bigint;
begin
  select * into v_game from public.poker_games
   where room_id=p_room_id and status='showdown'
   order by hand_no desc limit 1 for update;
  if not found then return jsonb_build_object('settled',false); end if;
  if cardinality(v_game.board)<>5 then raise exception 'На столе должно быть 5 общих карт'; end if;

  for v_level in
    select distinct hand_contribution as cap from public.poker_game_players
    where game_id=v_game.id and hand_contribution>0 order by cap
  loop
    select array_agg(user_id) into v_eligible from public.poker_game_players
     where game_id=v_game.id and hand_contribution>=v_level.cap and not folded;
    if coalesce(cardinality(v_eligible),0)=0 then
      v_previous:=v_level.cap;
      continue;
    end if;
    select (v_level.cap-v_previous)*count(*) into v_layer
      from public.poker_game_players where game_id=v_game.id and hand_contribution>=v_level.cap;
    v_best:=-1; v_winners:=array[]::uuid[];
    for v_player in
      select user_id,seat,hole_cards from public.poker_game_players
      where game_id=v_game.id and user_id=any(v_eligible)
    loop
      v_score:=public.poker_score7(v_player.hole_cards||v_game.board);
      if v_score>v_best then
        v_best:=v_score; v_winners:=array[v_player.user_id];
      elsif v_score=v_best then
        v_winners:=array_append(v_winners,v_player.user_id);
      end if;
    end loop;
    v_share:=v_layer/cardinality(v_winners);
    v_remainder:=v_layer%cardinality(v_winners);
    update public.poker_game_players set stack=stack+v_share
      where game_id=v_game.id and user_id=any(v_winners);
    if v_remainder>0 then
      select user_id into v_winner from public.poker_game_players
       where game_id=v_game.id and user_id=any(v_winners) order by seat limit 1;
      update public.poker_game_players set stack=stack+v_remainder
       where game_id=v_game.id and user_id=v_winner.user_id;
    end if;
    v_paid:=v_paid+v_layer;
    v_previous:=v_level.cap;
  end loop;

  update public.poker_room_players rp set stack=gp.stack
   from public.poker_game_players gp
   where gp.game_id=v_game.id and gp.user_id=rp.user_id and rp.room_id=p_room_id;
  update public.poker_game_players set last_action=case when user_id in (
    select gp.user_id from public.poker_game_players gp
    where gp.game_id=v_game.id and gp.stack>0
  ) then coalesce(last_action,'showdown') else coalesce(last_action,'showdown') end
   where game_id=v_game.id;
  update public.poker_games set status='complete',current_turn_seat=null,action_deadline=null,
    last_action='showdown_complete',updated_at=now() where id=v_game.id;
  return jsonb_build_object('settled',true,'pot',v_game.pot,'paid',v_paid,'board',v_game.board);
end;
$$;

revoke all on function public.poker_score5(text[]) from public,anon,authenticated;
revoke all on function public.poker_score7(text[]) from public,anon,authenticated;
revoke all on function public.poker_settle_showdown(uuid) from public,anon,authenticated;
grant execute on function public.poker_score5(text[]) to service_role;
grant execute on function public.poker_score7(text[]) to service_role;
grant execute on function public.poker_settle_showdown(uuid) to service_role;
