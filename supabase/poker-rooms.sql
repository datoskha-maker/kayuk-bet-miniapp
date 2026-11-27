-- Poker waiting rooms for KAYUK CASINO.
-- All writes go through Telegram-authenticated Vercel API using service_role.

create table if not exists public.poker_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  title text not null,
  capacity smallint not null check (capacity between 2 and 6),
  status text not null default 'waiting' check (status in ('waiting','starting','playing','finished','cancelled')),
  host_user_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  started_at timestamptz
);

create table if not exists public.poker_room_players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.poker_rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete restrict,
  seat smallint not null check (seat between 1 and 6),
  joined_at timestamptz not null default now(),
  unique(room_id,user_id),
  unique(room_id,seat)
);

create index if not exists poker_rooms_waiting_created_idx on public.poker_rooms(status, created_at desc);
create index if not exists poker_room_players_room_idx on public.poker_room_players(room_id, seat);

alter table public.poker_rooms enable row level security;
alter table public.poker_room_players enable row level security;
revoke all on public.poker_rooms from anon, authenticated;
revoke all on public.poker_room_players from anon, authenticated;
grant all on public.poker_rooms to service_role;
grant all on public.poker_room_players to service_role;

create or replace function public.poker_create_room(p_user_id uuid, p_title text, p_capacity integer)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_room public.poker_rooms; v_code text;
begin
  if p_capacity < 2 or p_capacity > 6 then raise exception 'Количество игроков должно быть от 2 до 6'; end if;
  if p_title is null or length(trim(p_title)) = 0 then p_title := 'Стол друзей'; end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then raise exception 'Профиль игрока не найден'; end if;
  if exists (select 1 from public.poker_room_players rp join public.poker_rooms r on r.id=rp.room_id where rp.user_id=p_user_id and r.status in ('waiting','starting','playing')) then
    raise exception 'Ты уже находишься за другим покерным столом';
  end if;
  loop
    v_code := upper(substr(encode(gen_random_bytes(5), 'hex'), 1, 6));
    exit when not exists (select 1 from public.poker_rooms where code=v_code);
  end loop;
  insert into public.poker_rooms(code,title,capacity,host_user_id) values(v_code,left(trim(p_title),48),p_capacity,p_user_id) returning * into v_room;
  insert into public.poker_room_players(room_id,user_id,seat) values(v_room.id,p_user_id,1);
  return jsonb_build_object('room_id',v_room.id,'code',v_room.code,'status',v_room.status,'capacity',v_room.capacity);
end;
$$;

create or replace function public.poker_join_room(p_user_id uuid, p_code text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_room public.poker_rooms; v_count integer; v_seat integer;
begin
  if not exists (select 1 from public.profiles where id=p_user_id) then raise exception 'Профиль игрока не найден'; end if;
  if exists (select 1 from public.poker_room_players rp join public.poker_rooms r on r.id=rp.room_id where rp.user_id=p_user_id and r.status in ('waiting','starting','playing')) then
    raise exception 'Ты уже находишься за другим покерным столом';
  end if;
  select * into v_room from public.poker_rooms where code=upper(trim(p_code)) for update;
  if not found then raise exception 'Комната не найдена'; end if;
  if v_room.status <> 'waiting' then raise exception 'Игра уже запускается или началась'; end if;
  select count(*) into v_count from public.poker_room_players where room_id=v_room.id;
  if v_count >= v_room.capacity then raise exception 'В комнате уже нет свободных мест'; end if;
  select s into v_seat from generate_series(1,v_room.capacity) s
    where not exists (select 1 from public.poker_room_players rp where rp.room_id=v_room.id and rp.seat=s)
    order by s limit 1;
  insert into public.poker_room_players(room_id,user_id,seat) values(v_room.id,p_user_id,v_seat);
  v_count := v_count + 1;
  if v_count = v_room.capacity then update public.poker_rooms set status='starting' where id=v_room.id; end if;
  return jsonb_build_object('room_id',v_room.id,'code',v_room.code,'status',case when v_count=v_room.capacity then 'starting' else 'waiting' end,'players',v_count,'capacity',v_room.capacity);
end;
$$;

create or replace function public.poker_leave_room(p_user_id uuid, p_room_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_room public.poker_rooms;
begin
  select * into v_room from public.poker_rooms where id=p_room_id for update;
  if not found then raise exception 'Комната не найдена'; end if;
  if v_room.status <> 'waiting' then raise exception 'Нельзя покинуть комнату после начала запуска'; end if;
  delete from public.poker_room_players where room_id=p_room_id and user_id=p_user_id;
  if not found then raise exception 'Ты не находишься в этой комнате'; end if;
  if v_room.host_user_id=p_user_id then
    update public.poker_rooms set status='cancelled' where id=p_room_id;
    return jsonb_build_object('ok',true,'status','cancelled');
  end if;
  return jsonb_build_object('ok',true,'status','waiting');
end;
$$;

revoke all on function public.poker_create_room(uuid,text,integer) from public, anon, authenticated;
revoke all on function public.poker_join_room(uuid,text) from public, anon, authenticated;
revoke all on function public.poker_leave_room(uuid,uuid) from public, anon, authenticated;
grant execute on function public.poker_create_room(uuid,text,integer) to service_role;
grant execute on function public.poker_join_room(uuid,text) to service_role;
grant execute on function public.poker_leave_room(uuid,uuid) to service_role;
