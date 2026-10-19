-- Run once in Supabase SQL Editor to enable final outcomes for manual matches.
alter table public.manual_matches
  add column if not exists result text
  check (result is null or result in ('П1','X','П2'));

create index if not exists manual_matches_result_idx
  on public.manual_matches(result);
