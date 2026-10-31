-- Private admin slots mode. Run in PRODUCTION Supabase SQL Editor before deploying API.
-- Personal-mode spins are recorded for the account and its real virtual balance,
-- but are excluded from the shared casino leaderboard.

alter table public.slot_spins
  add column if not exists private_admin_mode boolean not null default false;

create or replace function public.spin_football_slots_private_admin(
  p_user_id uuid,
  p_stake bigint,
  p_private_mode boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_balance bigint;
  v_roll integer;
  v_symbols text[];
  v_payout bigint := 0;
  v_jackpot boolean := false;
begin
  if p_private_mode is distinct from true then
    raise exception 'Private mode disabled';
  end if;
  if p_stake is null or p_stake < 10 or p_stake > 100000 then
    raise exception 'Invalid stake';
  end if;

  select balance into v_balance
  from public.balances
  where user_id = p_user_id
  for update;

  if not found or v_balance < p_stake then
    raise exception 'Insufficient balance';
  end if;

  update public.balances
  set balance = balance - p_stake, updated_at = now()
  where user_id = p_user_id
  returning balance into v_balance;

  insert into public.transactions(user_id, amount, type, note)
  values (p_user_id, -p_stake, 'bet_placed', 'Личная ставка в слотах КАЮК BET');

  v_roll := floor(random() * 100000)::integer + 1;

  -- Private admin mode: 99% payout chance. Premium outcomes retain their
  -- existing rare probabilities; the boosted outcome returns 2x stake.
  if v_roll = 1 then
    v_symbols := array['👑','👑','👑']; v_payout := p_stake * 500; v_jackpot := true;
  elsif v_roll <= 1000 then
    v_symbols := array['💎','💎','💎']; v_payout := p_stake * 20;
  elsif v_roll <= 3000 then
    v_symbols := array['⭐','⭐','⭐']; v_payout := p_stake * 10;
  elsif v_roll <= 7000 then
    v_symbols := array['🍒','🍒','🍒']; v_payout := p_stake * 5;
  elsif v_roll <= 99000 then
    case floor(random() * 4)::integer
      when 0 then v_symbols := array['🍒','🍒','🍋'];
      when 1 then v_symbols := array['🍋','⭐','🍋'];
      when 2 then v_symbols := array['💎','💎','🍋'];
      else v_symbols := array['⭐','🍋','⭐'];
    end case;
    v_payout := p_stake * 2;
  else
    case floor(random() * 5)::integer
      when 0 then v_symbols := array['🍒','🍋','⭐'];
      when 1 then v_symbols := array['🍋','💎','🍒'];
      when 2 then v_symbols := array['⭐','🍒','💎'];
      when 3 then v_symbols := array['💎','⭐','🍋'];
      else v_symbols := array['🍋','🍒','💎'];
    end case;
  end if;

  if v_payout > 0 then
    update public.balances
    set balance = balance + v_payout, updated_at = now()
    where user_id = p_user_id
    returning balance into v_balance;

    insert into public.transactions(user_id, amount, type, note)
    values (p_user_id, v_payout, 'bet_won', 'Личный выигрыш в слотах КАЮК BET');
  end if;

  insert into public.slot_spins(user_id, stake, symbols, payout, jackpot, private_admin_mode)
  values (p_user_id, p_stake, v_symbols, v_payout, v_jackpot, true);

  return jsonb_build_object(
    'stake', p_stake,
    'symbols', to_jsonb(v_symbols),
    'payout', v_payout,
    'jackpot', v_jackpot,
    'balance', v_balance,
    'privateAdminMode', true
  );
end;
$$;

revoke all on function public.spin_football_slots_private_admin(uuid, bigint, boolean) from public;
revoke all on function public.spin_football_slots_private_admin(uuid, bigint, boolean) from anon;
revoke all on function public.spin_football_slots_private_admin(uuid, bigint, boolean) from authenticated;
grant execute on function public.spin_football_slots_private_admin(uuid, bigint, boolean) to service_role;
