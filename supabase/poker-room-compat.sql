-- Align the room table created by the original lobby migration with the engine fields.
alter table public.poker_rooms
  add column if not exists title text not null default 'Стол друзей';
alter table public.poker_rooms
  add column if not exists host_user_id uuid references public.profiles(id) on delete restrict;
update public.poker_rooms set host_user_id=created_by where host_user_id is null;
alter table public.poker_rooms
  alter column host_user_id set not null;
create index if not exists poker_rooms_host_user_idx on public.poker_rooms(host_user_id);
