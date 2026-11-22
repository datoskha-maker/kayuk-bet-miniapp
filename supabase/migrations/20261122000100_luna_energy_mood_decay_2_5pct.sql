-- Set Luna energy and mood decay to 2.5 percentage points per hour.
-- Hunger and thirst remain 2%/hour; intoxication comfort decay unchanged.

CREATE OR REPLACE FUNCTION public.luna_tick_user(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_state public.luna_state%rowtype;
  v_now timestamptz:=clock_timestamp();
  v_moscow timestamp:=v_now at time zone 'Europe/Moscow';
  v_date date:=(v_now at time zone 'Europe/Moscow')::date;
  v_elapsed numeric:=0;
  v_hours numeric:=0;
begin
  insert into public.luna_state(user_id,hunger,thirst,mood,energy,comfort,last_tick_at)
  values(p_user_id,40,35,85,50,80,v_now)
  on conflict(user_id) do nothing;

  select * into v_state from public.luna_state where user_id=p_user_id for update;
  if not found then raise exception 'Luna state not found'; end if;

  if v_moscow::time >= time '11:34' and (v_state.last_wake_date is null or v_state.last_wake_date < v_date) then
    update public.luna_state
      set hunger=40, thirst=35, energy=50,
          last_wake_date=v_date, last_tick_at=v_now, updated_at=v_now
      where user_id=p_user_id returning * into v_state;
  else
    if v_state.last_wake_date is not null then
      v_elapsed:=greatest(0,least(86400,extract(epoch from (v_now-v_state.last_tick_at))));
      v_hours:=v_elapsed/3600.0;
      if v_hours>0 then
        update public.luna_state set
          hunger=greatest(0,least(100,hunger-2.0*v_hours)),
          thirst=greatest(0,least(100,thirst-2.0*v_hours)),
          energy=greatest(0,least(100,energy-2.5*v_hours)),
          mood=greatest(0,least(100,mood-2.5*v_hours)),
          comfort=greatest(0,least(100,case when is_intoxicated then comfort-6.0*v_hours else comfort end)),
          last_tick_at=v_now,updated_at=v_now
        where user_id=p_user_id returning * into v_state;
      end if;
    else
      update public.luna_state set last_tick_at=v_now,updated_at=v_now
      where user_id=p_user_id returning * into v_state;
    end if;
  end if;

  return jsonb_build_object('state',to_jsonb(v_state),'moscow_time',v_moscow);
end;
$function$;
