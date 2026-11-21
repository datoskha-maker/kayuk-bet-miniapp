-- Price-based satiety gains for all Luna food purchases.
-- <= 5,000: +5%; 5,001–20,000: +10%; 20,001–30,000: +15%; >30,000: +40%.
-- Drink effects remain unchanged.

CREATE OR REPLACE FUNCTION public.luna_consume_item_internal(p_user_id uuid, p_item_id text, p_category text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  select * into v_item from public.luna_catalog
    where item_id=p_item_id and active=true and category=p_category;
  if not found then raise exception 'Consumable unavailable'; end if;

  v_is_food:= (p_category='cafe_food') or (p_category='lavka' and coalesce((v_item.effect->>'hunger')::integer,0)>0);
  v_is_drink:= (p_category='cafe_drink') or (p_category='lavka' and coalesce((v_item.effect->>'thirst')::integer,0)>0);
  if not v_is_food and not v_is_drink then raise exception 'This item is not food or drink'; end if;

  select max(price) into v_max_price from public.luna_catalog
    where active=true and category=p_category
      and ((v_is_food and (p_category<>'lavka' or coalesce((effect->>'hunger')::integer,0)>0))
        or (v_is_drink and (p_category<>'lavka' or coalesce((effect->>'thirst')::integer,0)>0)));
  if v_is_food then
    v_gain:=case
      when v_item.price<=5000 then 5
      when v_item.price<=20000 then 10
      when v_item.price<=30000 then 15
      else 40
    end;
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
    mood=greatest(0,least(100,mood
      +case when v_is_food then 4 else 0 end
      +case when v_water then 4 else 0 end
      -case when v_beer then 25 else 0 end)),
    comfort=greatest(0,least(100,comfort
      -case when v_alcohol then 10 else 0 end)),
    is_intoxicated=case when v_alcohol then true when v_water then false else is_intoxicated end,
    updated_at=now()
    where user_id=p_user_id returning * into v_state;

  insert into public.transactions(user_id,amount,type,note)
    values(p_user_id,-v_item.price,'luna_food','Луна · '||v_item.title);

  perform public.luna_tick_user(p_user_id);
  select * into v_state from public.luna_state where user_id=p_user_id;
  return jsonb_build_object('ok',true,'balance',v_balance,'state',to_jsonb(v_state),
    'item',v_item.title,'price',v_item.price,'gain',v_gain,'intoxicated',v_state.is_intoxicated);
end;
$function$;
