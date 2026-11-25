-- KAYUK CASINO: multiplayer poker waiting rooms.
-- Server-side requests use the existing Telegram-authenticated /api/profile endpoint.
create table if not exists public.poker_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  created_by uuid not null references public.profiles(id) on delete cascade,
  capacity smallint not null check (capacity between 2 and 6),
  status text not null default 'waiting' check (status in ('waiting','starting','playing','finished','cancelled')),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  updated_at timestamptz not null default now()
);
create table if not exists public.poker_room_players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.poker_rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  seat smallint not null check (seat between 1 and 6),
  joined_at timestamptz not null default now(),
  unique (room_id,user_id),
  unique (room_id,seat)
);
create index if not exists poker_rooms_waiting_created_idx on public.poker_rooms(status,created_at desc);
create index if not exists poker_room_players_user_idx on public.poker_room_players(user_id);
alter table public.poker_rooms enable row level security;
alter table public.poker_room_players enable row level security;
revoke all on public.poker_rooms, public.poker_room_players from anon, authenticated;
grant all on public.poker_rooms, public.poker_room_players to service_role;

create or replace function public.poker_join_room(p_room_id uuid,p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_room public.poker_rooms%rowtype; v_seat integer; v_count integer; v_started boolean := false;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  select * into v_room from public.poker_rooms where id=p_room_id for update;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  if v_room.status <> 'waiting' then raise exception 'ROOM_NOT_WAITING'; end if;
  if exists (
    select 1 from public.poker_room_players rp join public.poker_rooms r on r.id=rp.room_id
    where rp.user_id=p_user_id and r.status in ('waiting','starting','playing') and rp.room_id<>p_room_id
  ) then raise exception 'PLAYER_ALREADY_IN_ROOM'; end if;
  if exists(select 1 from public.poker_room_players where room_id=p_room_id and user_id=p_user_id) then
    select count(*) into v_count from public.poker_room_players where room_id=p_room_id;
    return jsonb_build_object('room_id',p_room_id,'player_count',v_count,'capacity',v_room.capacity,'started',v_room.status='starting');
  end if;
  select s into v_seat from generate_series(1,v_room.capacity) s
  where not exists(select 1 from public.poker_room_players p where p.room_id=p_room_id and p.seat=s)
  order by s limit 1;
  if v_seat is null then raise exception 'ROOM_FULL'; end if;
  insert into public.poker_room_players(room_id,user_id,seat) values(p_room_id,p_user_id,v_seat);
  select count(*) into v_count from public.poker_room_players where room_id=p_room_id;
  if v_count=v_room.capacity then
    update public.poker_rooms set status='starting',started_at=now(),updated_at=now()
    where id=p_room_id and status='waiting';
    v_started := true;
  end if;
  return jsonb_build_object('room_id',p_room_id,'seat',v_seat,'player_count',v_count,'capacity',v_room.capacity,'started',v_started);
end;
$$;
revoke all on function public.poker_join_room(uuid,uuid) from public, anon, authenticated;
grant execute on function public.poker_join_room(uuid,uuid) to service_role;
