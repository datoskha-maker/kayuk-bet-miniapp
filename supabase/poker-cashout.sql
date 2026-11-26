-- KAYUK POKER: safe room exit and buy-in/stack cashout.
create or replace function public.poker_leave_room(p_user_id uuid,p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_room public.poker_rooms;
  v_game_status text;
  v_player record;
  v_stack bigint;
  v_remaining integer;
begin
  select * into v_room from public.poker_rooms where id=p_room_id for update;
  if not found then raise exception 'Комната не найдена'; end if;
  select status into v_game_status from public.poker_games
    where room_id=p_room_id order by hand_no desc limit 1;

  if v_room.status in ('waiting','starting') then
    if v_room.host_user_id=p_user_id then
      for v_player in select user_id,stack from public.poker_room_players where room_id=p_room_id loop
        if v_player.stack>0 then
          insert into public.balances(user_id,balance) values(v_player.user_id,v_player.stack)
            on conflict(user_id) do update set balance=public.balances.balance+excluded.balance,updated_at=now();
          insert into public.transactions(user_id,amount,type,note)
            values(v_player.user_id,v_player.stack,'poker_cashout','Возврат бай-ина: комната отменена');
        end if;
      end loop;
      delete from public.poker_room_players where room_id=p_room_id;
      update public.poker_rooms set status='cancelled',updated_at=now() where id=p_room_id;
      return jsonb_build_object('ok',true,'status','cancelled','cashout_all',true);
    end if;
    select stack into v_stack from public.poker_room_players where room_id=p_room_id and user_id=p_user_id for update;
    if not found then raise exception 'Ты не находишься в этой комнате'; end if;
    if v_stack>0 then
      insert into public.balances(user_id,balance) values(p_user_id,v_stack)
        on conflict(user_id) do update set balance=public.balances.balance+excluded.balance,updated_at=now();
      insert into public.transactions(user_id,amount,type,note)
        values(p_user_id,v_stack,'poker_cashout','Возврат бай-ина из комнаты ожидания');
    end if;
    delete from public.poker_room_players where room_id=p_room_id and user_id=p_user_id;
    return jsonb_build_object('ok',true,'status','waiting','cashout',v_stack);
  end if;

  if v_room.status='playing' then
    if v_game_status is distinct from 'complete' then
      raise exception 'Нельзя покинуть стол во время раздачи. Дождись её завершения';
    end if;
    if v_room.host_user_id=p_user_id then
      for v_player in select user_id,stack from public.poker_room_players where room_id=p_room_id loop
        if v_player.stack>0 then
          insert into public.balances(user_id,balance) values(v_player.user_id,v_player.stack)
            on conflict(user_id) do update set balance=public.balances.balance+excluded.balance,updated_at=now();
          insert into public.transactions(user_id,amount,type,note)
            values(v_player.user_id,v_player.stack,'poker_cashout','Вывод остатка: хозяин закрыл стол');
        end if;
      end loop;
      delete from public.poker_room_players where room_id=p_room_id;
      update public.poker_rooms set status='finished',updated_at=now() where id=p_room_id;
      return jsonb_build_object('ok',true,'status','finished','cashout_all',true);
    end if;

    select stack into v_stack from public.poker_room_players
      where room_id=p_room_id and user_id=p_user_id for update;
    if not found then raise exception 'Ты не находишься в этой комнате'; end if;
    if v_stack>0 then
      insert into public.balances(user_id,balance) values(p_user_id,v_stack)
        on conflict(user_id) do update set balance=public.balances.balance+excluded.balance,updated_at=now();
      insert into public.transactions(user_id,amount,type,note)
        values(p_user_id,v_stack,'poker_cashout','Вывод остатка со стола');
    end if;
    delete from public.poker_room_players where room_id=p_room_id and user_id=p_user_id;
    select count(*) into v_remaining from public.poker_room_players where room_id=p_room_id and stack>0;
    if v_remaining<2 then
      for v_player in select user_id,stack from public.poker_room_players where room_id=p_room_id loop
        if v_player.stack>0 then
          insert into public.balances(user_id,balance) values(v_player.user_id,v_player.stack)
            on conflict(user_id) do update set balance=public.balances.balance+excluded.balance,updated_at=now();
          insert into public.transactions(user_id,amount,type,note)
            values(v_player.user_id,v_player.stack,'poker_cashout','Автоматический вывод: за столом осталось меньше двух игроков');
        end if;
      end loop;
      delete from public.poker_room_players where room_id=p_room_id;
      update public.poker_rooms set status='finished',updated_at=now() where id=p_room_id;
      return jsonb_build_object('ok',true,'status','finished','cashout',v_stack,'table_closed',true);
    end if;
    return jsonb_build_object('ok',true,'status','playing','cashout',v_stack);
  end if;

  raise exception 'Этот стол уже закрыт';
end;
$$;
revoke all on function public.poker_leave_room(uuid,uuid) from public,anon,authenticated;
grant execute on function public.poker_leave_room(uuid,uuid) to service_role;
