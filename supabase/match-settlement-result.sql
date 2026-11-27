-- Run once in Supabase SQL Editor to enable final outcomes for manual matches.
alter table public.manual_matches
  add column if not exists result text
  check (result is null or result in ('П1','X','П2'));

create index if not exists manual_matches_result_idx
  on public.manual_matches(result);

-- Replace the earlier settlement function so a losing bet doesn't need a zero-value
-- transaction (some transaction schemas disallow amount = 0).
create or replace function public.admin_settle_bet(p_bet_id uuid, p_result text, p_admin_telegram_id bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  b public.bets%rowtype;
  v_payout bigint := 0;
  v_balance bigint;
begin
  if p_result not in ('won','lost','void') then raise exception 'Invalid settlement result'; end if;
  select * into b from public.bets where id = p_bet_id for update;
  if not found then raise exception 'Bet not found'; end if;
  if b.status <> 'pending' then raise exception 'Bet already settled'; end if;

  if p_result = 'won' then
    v_payout := coalesce(b.potential_payout, round(b.stake * b.odds)::bigint);
  elsif p_result = 'void' then
    v_payout := b.stake;
  end if;

  if v_payout > 0 then
    update public.balances set balance = balance + v_payout, updated_at = now()
      where user_id = b.user_id returning balance into v_balance;
    if not found then raise exception 'Balance not found'; end if;
    insert into public.transactions(user_id, amount, type, note, admin_telegram_id)
      values (b.user_id, v_payout, 'bet',
        case p_result when 'won' then 'Выигрыш по ставке ' || b.id
          when 'void' then 'Возврат ставки ' || b.id else 'Расчёт ставки ' || b.id end,
        p_admin_telegram_id);
  else
    select balance into v_balance from public.balances where user_id = b.user_id;
  end if;

  update public.bets set status = p_result, settled_at = now() where id = p_bet_id;
  return jsonb_build_object('ok',true,'bet_id',b.id,'status',p_result,'payout',v_payout,'balance',v_balance);
end; $$;

revoke all on function public.admin_settle_bet(uuid,text,bigint) from public, anon, authenticated;
grant execute on function public.admin_settle_bet(uuid,text,bigint) to service_role;
