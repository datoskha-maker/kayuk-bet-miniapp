-- KAYUK POKER: cash-game hand engine foundation.
-- Buy-ins are reserved from the shared KAYUK BET balance.

alter table public.poker_rooms
  add column if not exists buy_in bigint not null default 500
  check (buy_in between 500 and 50000);

alter table public.poker_rooms
  drop constraint if exists poker_rooms_status_check;
alter table public.poker_rooms
  add constraint poker_rooms_status_check
  check (status in ('waiting','starting','playing','finished','cancelled'));

create table if not exists public.poker_games (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.poker_rooms(id) on delete cascade,
  hand_no integer not null default 1,
  status text not null default 'preflop' check (status in ('preflop','flop','turn','river','showdown','complete')),
  dealer_seat smallint not null,
  current_turn_seat smallint,
  current_bet bigint not null default 20,
  min_raise bigint not null default 20,
  pot bigint not null default 0,
  board text[] not null default '{}',
  deck text[] not null,
  action_deadline timestamptz,
  last_action text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(room_id,hand_no)
);

alter table public.poker_room_players add column if not exists stack bigint not null default 0 check (stack >= 0);

create table if not exists public.poker_game_players (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.poker_games(id) on delete cascade,
  room_id uuid not null references public.poker_rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete restrict,
  seat smallint not null,
  stack bigint not null check (stack >= 0),
  street_contribution bigint not null default 0,
  hand_contribution bigint not null default 0,
  folded boolean not null default false,
  all_in boolean not null default false,
  hole_cards text[] not null default '{}',
  last_action text,
  unique(game_id,user_id),
  unique(game_id,seat)
);

create index if not exists poker_games_room_status_idx on public.poker_games(room_id,status);
create index if not exists poker_game_players_game_seat_idx on public.poker_game_players(game_id,seat);

alter table public.poker_games enable row level security;
alter table public.poker_game_players enable row level security;
revoke all on public.poker_games from anon, authenticated;
revoke all on public.poker_game_players from anon, authenticated;
grant all on public.poker_games to service_role;
grant all on public.poker_game_players to service_role;

alter table public.transactions drop constraint if exists transactions_type_check;
alter table public.transactions add constraint transactions_type_check
check (type = any (array[
 'deposit','withdrawal','bet','bet_placed','bet_won','bet_lost','refund','admin_adjustment',
 'slice_reward','luna_purchase','luna_gift','luna_loan','luna_loan_repayment','luna_food',
 'bank_card_purchase','bank_loan_default','luna_daily_reward','luna_lavka_order','luna_status_penalty',
 'poker_buyin','poker_cashout','poker_payout'
]::text[]));

create or replace function public.poker_deck()
returns text[] language sql volatile
as $$
  select array_agg(r || s order by random())
  from unnest(array['2','3','4','5','6','7','8','9','T','J','Q','K','A']) r
  cross join unnest(array['s','h','d','c']) s;
$$;

create or replace function public.poker_create_room(p_user_id uuid, p_title text, p_capacity integer, p_buy_in bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_room public.poker_rooms; v_code text; v_balance bigint;
begin
  if p_capacity < 2 or p_capacity > 6 then raise exception 'Количество игроков должно быть от 2 до 6'; end if;
  if p_buy_in < 500 or p_buy_in > 50000 then raise exception 'Бай-ин должен быть от 500 до 50 000'; end if;
  if p_title is null or length(trim(p_title)) = 0 then p_title := 'Стол друзей'; end if;
  if not exists (select 1 from public.profiles where id=p_user_id) then raise exception 'Профиль игрока не найден'; end if;
  if exists (select 1 from public.poker_room_players rp join public.poker_rooms r on r.id=rp.room_id where rp.user_id=p_user_id and r.status in ('waiting','starting','playing')) then
    raise exception 'Ты уже находишься за другим покерным столом';
  end if;
  select balance into v_balance from public.balances where user_id=p_user_id for update;
  if coalesce(v_balance,0) < p_buy_in then raise exception 'Недостаточно средств для бай-ина'; end if;
  update public.balances set balance=balance-p_buy_in,updated_at=now() where user_id=p_user_id;
  insert into public.transactions(user_id,amount,type,note) values(p_user_id,-p_buy_in,'poker_buyin','Бай-ин в покерную комнату');
  loop
    v_code := upper(substr(md5(random()::text||clock_timestamp()::text),1,6));
    exit when not exists(select 1 from public.poker_rooms where code=v_code);
  end loop;
  insert into public.poker_rooms(code,title,capacity,buy_in,host_user_id,created_by)
  values(v_code,left(trim(p_title),48),p_capacity,p_buy_in,p_user_id,p_user_id) returning * into v_room;
  insert into public.poker_room_players(room_id,user_id,seat,stack) values(v_room.id,p_user_id,1,p_buy_in);
  return jsonb_build_object('room_id',v_room.id,'code',v_room.code,'status',v_room.status,'capacity',v_room.capacity,'buy_in',v_room.buy_in);
end;
$$;

create or replace function public.poker_join_room(p_user_id uuid,p_code text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_room public.poker_rooms; v_count integer; v_seat integer; v_balance bigint;
begin
  if not exists(select 1 from public.profiles where id=p_user_id) then raise exception 'Профиль игрока не найден'; end if;
  if exists(select 1 from public.poker_room_players rp join public.poker_rooms r on r.id=rp.room_id where rp.user_id=p_user_id and r.status in ('waiting','starting','playing')) then
    raise exception 'Ты уже находишься за другим покерным столом';
  end if;
  select * into v_room from public.poker_rooms where code=upper(trim(p_code)) for update;
  if not found then raise exception 'Комната не найдена'; end if;
  if v_room.status <> 'waiting' then raise exception 'Игра уже запускается или началась'; end if;
  select count(*) into v_count from public.poker_room_players where room_id=v_room.id;
  if v_count >= v_room.capacity then raise exception 'В комнате уже нет свободных мест'; end if;
  select balance into v_balance from public.balances where user_id=p_user_id for update;
  if coalesce(v_balance,0) < v_room.buy_in then raise exception 'Недостаточно средств для бай-ина'; end if;
  update public.balances set balance=balance-v_room.buy_in,updated_at=now() where user_id=p_user_id;
  insert into public.transactions(user_id,amount,type,note) values(p_user_id,-v_room.buy_in,'poker_buyin','Бай-ин в покерную комнату '||v_room.code);
  select s into v_seat from generate_series(1,v_room.capacity) s
   where not exists(select 1 from public.poker_room_players rp where rp.room_id=v_room.id and rp.seat=s)
   order by s limit 1;
  insert into public.poker_room_players(room_id,user_id,seat,stack) values(v_room.id,p_user_id,v_seat,v_room.buy_in);
  v_count:=v_count+1;
  if v_count=v_room.capacity then
    update public.poker_rooms set status='starting' where id=v_room.id;
    perform public.poker_start_first_hand(v_room.id);
  end if;
  return jsonb_build_object('room_id',v_room.id,'code',v_room.code,'status',case when v_count=v_room.capacity then 'starting' else 'waiting' end,'players',v_count,'capacity',v_room.capacity,'buy_in',v_room.buy_in);
end;
$$;

create or replace function public.poker_start_first_hand(p_room_id uuid)
returns uuid language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_room public.poker_rooms;
  v_game_id uuid;
  v_deck text[];
  v_player record;
  v_dealer integer;
  v_previous_dealer integer;
  v_sb integer;
  v_bb integer;
  v_turn integer;
  v_count integer;
begin
  select * into v_room from public.poker_rooms where id=p_room_id for update;
  if not found then raise exception 'Комната не найдена'; end if;
  if exists(select 1 from public.poker_games where room_id=p_room_id and status not in ('complete','showdown')) then
    select id into v_game_id from public.poker_games where room_id=p_room_id order by hand_no desc limit 1;
    return v_game_id;
  end if;
  select count(*) into v_count from public.poker_room_players where room_id=p_room_id and stack>0;
  if v_count<2 then raise exception 'Для следующей раздачи нужны минимум два игрока с фишками'; end if;

  select dealer_seat into v_previous_dealer from public.poker_games
    where room_id=p_room_id order by hand_no desc limit 1;
  if v_previous_dealer is null then
    select min(seat) into v_dealer from public.poker_room_players where room_id=p_room_id and stack>0;
  else
    select min(seat) into v_dealer from public.poker_room_players
      where room_id=p_room_id and stack>0 and seat>v_previous_dealer;
    if v_dealer is null then
      select min(seat) into v_dealer from public.poker_room_players where room_id=p_room_id and stack>0;
    end if;
  end if;

  v_deck:=public.poker_deck();
  insert into public.poker_games(room_id,hand_no,status,dealer_seat,deck,current_bet,min_raise,action_deadline)
  values(p_room_id,coalesce((select max(hand_no)+1 from public.poker_games where room_id=p_room_id),1),
    'preflop',v_dealer,v_deck,20,20,now()+interval '30 seconds')
  returning id into v_game_id;

  for v_player in
    select rp.* from public.poker_room_players rp
    where rp.room_id=p_room_id and rp.stack>0 order by rp.seat
  loop
    insert into public.poker_game_players(game_id,room_id,user_id,seat,stack,hole_cards)
    values(v_game_id,p_room_id,v_player.user_id,v_player.seat,v_player.stack,
      array[v_deck[(v_player.seat-1)*2+1],v_deck[(v_player.seat-1)*2+2]]);
  end loop;

  if v_count=2 then
    v_sb:=v_dealer;
    select min(seat) into v_bb from public.poker_room_players
      where room_id=p_room_id and stack>0 and seat<>v_dealer;
  else
    select min(seat) into v_sb from public.poker_room_players
      where room_id=p_room_id and stack>0 and seat>v_dealer;
    if v_sb is null then select min(seat) into v_sb from public.poker_room_players where room_id=p_room_id and stack>0; end if;
    select min(seat) into v_bb from public.poker_room_players
      where room_id=p_room_id and stack>0 and seat>v_sb;
    if v_bb is null then
      select min(seat) into v_bb from public.poker_room_players
        where room_id=p_room_id and stack>0 and seat<>v_sb;
    end if;
  end if;

  update public.poker_game_players set stack=stack-10,street_contribution=10,
    hand_contribution=10,all_in=(stack=10),last_action='small blind'
    where game_id=v_game_id and seat=v_sb;
  update public.poker_game_players set stack=stack-20,street_contribution=20,
    hand_contribution=20,all_in=(stack=20),last_action='big blind'
    where game_id=v_game_id and seat=v_bb;
  update public.poker_games set pot=30,current_bet=20 where id=v_game_id;

  select min(seat) into v_turn from public.poker_game_players
    where game_id=v_game_id and seat>v_bb and not folded and not all_in;
  if v_turn is null then
    select min(seat) into v_turn from public.poker_game_players where game_id=v_game_id and not folded and not all_in;
  end if;
  update public.poker_games set current_turn_seat=v_turn where id=v_game_id;
  update public.poker_rooms set status='playing',started_at=coalesce(started_at,now()) where id=p_room_id;
  return v_game_id;
end;
$$;

revoke all on function public.poker_create_room(uuid,text,integer,bigint) from public,anon,authenticated;
revoke all on function public.poker_join_room(uuid,text) from public,anon,authenticated;
revoke all on function public.poker_start_first_hand(uuid) from public,anon,authenticated;
grant execute on function public.poker_create_room(uuid,text,integer,bigint) to service_role;
grant execute on function public.poker_join_room(uuid,text) to service_role;
grant execute on function public.poker_start_first_hand(uuid) to service_role;
