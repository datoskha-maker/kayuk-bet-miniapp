-- KAYUK BET launch prep. Run manually in Supabase SQL Editor before deploying app code.
alter table public.manual_matches add column if not exists result text;
alter table public.manual_matches add column if not exists published boolean not null default false;

-- Keep existing test matches in admin history but hide them from the public line.
update public.manual_matches
set published = false,
    status = case when result is null then 'CLOSED' else status end;

-- Clear prelaunch betting history; preserve player profiles and accounts.
-- Balances are set to zero; the administrator can credit players manually.
create or replace function public.reset_demo_data(p_admin_telegram_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bets_deleted bigint;
  v_transactions_deleted bigint;
  v_balances_reset bigint;
  v_matches_unpublished bigint;
begin
  delete from public.bets;
  get diagnostics v_bets_deleted = row_count;

  delete from public.transactions;
  get diagnostics v_transactions_deleted = row_count;

  update public.balances set balance = 0, updated_at = now();
  get diagnostics v_balances_reset = row_count;

  update public.manual_matches
  set published = false,
      status = case when result is null then 'CLOSED' else status end,
      updated_at = now();
  get diagnostics v_matches_unpublished = row_count;

  return jsonb_build_object(
    'ok', true,
    'bets_deleted', v_bets_deleted,
    'transactions_deleted', v_transactions_deleted,
    'balances_reset', v_balances_reset,
    'matches_unpublished', v_matches_unpublished
  );
end;
$$;

revoke all on function public.reset_demo_data(bigint) from public, anon, authenticated;
grant execute on function public.reset_demo_data(bigint) to service_role;
