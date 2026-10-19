-- KAYUK BET: administrator-managed virtual markets and atomic settlement.
create table if not exists public.manual_matches (
  id uuid primary key default gen_random_uuid(),
  league text not null check (char_length(league) between 1 and 80),
  home_team text not null check (char_length(home_team) between 1 and 100),
  away_team text not null check (char_length(away_team) between 1 and 100),
  start_time timestamptz not null,
  status text not null default 'NS' check (status in ('NS','CLOSED')),
  markets jsonb not null default '{}'::jsonb,
  created_by bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (home_team <> away_team)
);
create index if not exists manual_matches_start_time_idx on public.manual_matches(start_time);
alter table public.manual_matches enable row level security;
revoke all on public.manual_matches from anon, authenticated;
grant all on public.manual_matches to service_role;

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
  else
    select balance into v_balance from public.balances where user_id = b.user_id;
  end if;
  update public.bets set status = p_result, settled_at = now() where id = p_bet_id;
  insert into public.transactions(user_id, amount, type, note, admin_telegram_id)
    values (b.user_id, v_payout, 'settlement',
      case p_result when 'won' then 'Выигрыш по ставке ' || b.id
        when 'void' then 'Возврат ставки ' || b.id else 'Проигрыш по ставке ' || b.id end,
      p_admin_telegram_id);
  return jsonb_build_object('ok',true,'bet_id',b.id,'status',p_result,'payout',v_payout,'balance',v_balance);
end; $$;
revoke all on function public.admin_settle_bet(uuid,text,bigint) from public, anon, authenticated;
grant execute on function public.admin_settle_bet(uuid,text,bigint) to service_role;
