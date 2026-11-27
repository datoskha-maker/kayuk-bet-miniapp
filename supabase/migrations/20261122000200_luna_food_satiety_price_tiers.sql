-- Update Luna food satiety gain by item price.
-- 1,000-2,000: +2%; 3,000-7,000: +7%; 8,000-15,000: +15%;
-- 16,000-30,000: +30%; above 30,000: +50%.
-- Applied directly to the main Supabase database.

create or replace function public.luna_consume_item_internal(p_user_id uuid, p_item_id text, p_category text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_item public.luna_catalog%rowtype;
  v_balance bigint;
  v_state public.luna_state%rowtype;
  v_max_price bigint;
  v_gain integer;
  v_is_food boolean;
  v_is_drink boolean;
  v_alcohol boolean:=false;
  v_water boolean:=false;
  v_beer boolean:=false;
begin
  select * into v_item from public.luna_catalog where item_id=p_item_id and active=true and category=p_category;
  if not found then raise exception 'Consumable unavailable'; end if;
  v_is_food:= (p_category='cafe_food') or (p_category='lavka' and coalesce((v_item.effect->>'hunger')::integer,0)>0);
  v_is_drink:= (p_category='cafe_drink') or (p_category='lavka' and coalesce((v_item.effect->>'thirst')::integer,0)>0);
  if not v_is_food and not v_is_drink then raise exception 'This item is not food or drink'; end if;
  select max(price) into v_max_price from public.luna_catalog
    where active=true and category=p_category
      and ((v_is_food and (p_category<>'lavka' or coalesce((effect->>'hunger')::integer,0)>0))
        or (v_is_drink and (p_category<>'lavka' or coalesce((effect->>'thirst')::integer,0)>0)));
  if v_is_food then
    v_gain:=case when v_item.price<=2000 then 2 when v_item.price<=7000 then 7
      when v_item.price<=15000 then 15 when v_item.price<=30000 then 30 else 50 end;
  else
    v_gain:=greatest(1,least(14,round(14.0*v_item.price/greatest(1,coalesce(v_max_price,v_item.price)))::integer));
  end if;
  update public.balances set balance=balance-v_item.price,updated_at=now()
    where user_id=p_user_id and balance>=v_item.price returning balance into v_balance;
  if not found then raise exception 'Insufficient balance'; end if;
  insert into public.luna_state(user_id,hunger,thirst,mood,energy,comfort)
    values(p_user_id,40,35,85,50,80) on conflict(user_id) do nothing;
  v_alcohol:=p_item_id in ('cafe_craft_beer','cafe_blanche_beer','cafe_budweiser','cafe_mulled_wine');
  v_water:=p_item_id in ('cafe_water','luna_drink_water');
  v_beer:=p_item_id in ('cafe_craft_beer','cafe_blanche_beer','cafe_budweiser');
  update public.luna_state set
    hunger=least(100,hunger+case when v_is_food then v_gain else 0 end),
    thirst=least(100,thirst+case when v_is_drink then v_gain else 0 end),
    energy=least(100,energy+case when v_is_food then greatest(1,round(v_gain*0.7)::integer) else 0 end),
    mood=greatest(0,least(100,mood+case when v_is_food then 4 else 0 end+case when v_water then 4 else 0 end-case when v_beer then 25 else 0 end)),
    comfort=greatest(0,least(100,comfort-case when v_alcohol then 10 else 0 end)),
    is_intoxicated=case when v_alcohol then true when v_water then false else is_intoxicated end,
    updated_at=now() where user_id=p_user_id returning * into v_state;
  insert into public.transactions(user_id,amount,type,note) values(p_user_id,-v_item.price,'luna_food','Луна · '||v_item.title);
  perform public.luna_tick_user(p_user_id);
  select * into v_state from public.luna_state where user_id=p_user_id;
  return jsonb_build_object('ok',true,'balance',v_balance,'state',to_jsonb(v_state),'item',v_item.title,'price',v_item.price,'gain',v_gain,'intoxicated',v_state.is_intoxicated);
end;
$function$;

create or replace function public.luna_lavka_tick_orders(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_order public.luna_lavka_orders%rowtype;
  v_age integer;
  v_changed integer:=0;
  v_item record;
  v_gain integer;
  v_food boolean;
  v_drink boolean;
  v_max_food bigint;
  v_max_drink bigint;
  v_alcohol boolean;
  v_water boolean;
  v_beer boolean;
begin
  for v_order in select * from public.luna_lavka_orders where user_id=p_user_id and status<>'delivered' order by created_at for update loop
    v_age:=greatest(0,floor(extract(epoch from (now()-v_order.created_at)))::integer);
    if v_age>=60 then
      insert into public.luna_state(user_id,hunger,thirst,mood,energy,comfort) values(p_user_id,40,35,85,50,80) on conflict(user_id) do nothing;
      select max(price) into v_max_food from public.luna_catalog where active=true and category='lavka' and coalesce((effect->>'hunger')::integer,0)>0;
      select max(price) into v_max_drink from public.luna_catalog where active=true and category='lavka' and coalesce((effect->>'thirst')::integer,0)>0;
      for v_item in select * from public.luna_lavka_order_items where order_id=v_order.id loop
        v_food:=coalesce((v_item.effect->>'hunger')::integer,0)>0;
        v_drink:=coalesce((v_item.effect->>'thirst')::integer,0)>0;
        if v_food then
          v_gain:=case when v_item.unit_price<=2000 then 2 when v_item.unit_price<=7000 then 7
            when v_item.unit_price<=15000 then 15 when v_item.unit_price<=30000 then 30 else 50 end;
        else
          v_gain:=greatest(1,least(14,round(14.0*v_item.unit_price/greatest(1,coalesce(v_max_drink,v_item.unit_price)))::integer));
        end if;
        v_alcohol:=v_item.item_id in ('cafe_craft_beer','cafe_blanche_beer','cafe_budweiser','cafe_mulled_wine');
        v_water:=v_item.item_id in ('cafe_water','luna_drink_water');
        v_beer:=v_item.item_id in ('cafe_craft_beer','cafe_blanche_beer','cafe_budweiser');
        update public.luna_state set
          hunger=least(100,hunger+case when v_food then v_gain*v_item.quantity else 0 end),
          thirst=least(100,thirst+case when v_drink then v_gain*v_item.quantity else 0 end),
          energy=least(100,energy+case when v_food then greatest(1,round(v_gain*0.7)::integer)*v_item.quantity else 0 end),
          mood=greatest(0,least(100,mood+case when v_food then 4*v_item.quantity else 0 end+case when v_water then 4*v_item.quantity else 0 end-case when v_beer then 25*v_item.quantity else 0 end)),
          comfort=greatest(0,least(100,comfort+case when v_water and is_intoxicated then 12 else 0 end-case when v_alcohol then 10 else 0 end)),
          is_intoxicated=case when v_alcohol then true when v_water then false else is_intoxicated end,
          updated_at=now() where user_id=p_user_id;
      end loop;
      update public.luna_lavka_orders set status='delivered',delivered_at=now() where id=v_order.id;
      v_changed:=v_changed+1;
    elsif v_age>=35 then update public.luna_lavka_orders set status='in_transit' where id=v_order.id and status<>'in_transit'; v_changed:=v_changed+1;
    elsif v_age>=20 then update public.luna_lavka_orders set status='courier_picked_up' where id=v_order.id and status<>'courier_picked_up'; v_changed:=v_changed+1;
    elsif v_age>=10 then update public.luna_lavka_orders set status='preparing' where id=v_order.id and status='accepted'; v_changed:=v_changed+1;
    end if;
  end loop;
  return v_changed;
end;
$function$;