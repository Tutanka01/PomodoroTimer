-- Enable required extensions (Supabase usually has pgcrypto & uuid-ossp available)
create extension if not exists pgcrypto;

-- TABLE: focus_sessions
create table if not exists public.focus_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  mode text not null check (mode in ('pomodoro','shortBreak','longBreak')),
  intention text,
  was_interrupted boolean not null default false,
  productivity_rating smallint check (productivity_rating between 1 and 5),
  duration_seconds int generated always as (extract(epoch from (ended_at - started_at))) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_focus_sessions_user_started on public.focus_sessions(user_id, started_at desc);
create index if not exists idx_focus_sessions_user_mode on public.focus_sessions(user_id, mode);

-- Trigger to maintain updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;$$;

drop trigger if exists trg_focus_sessions_updated_at on public.focus_sessions;
create trigger trg_focus_sessions_updated_at
before update on public.focus_sessions
for each row execute function public.set_updated_at();

-- DAILY AGGREGATE VIEW
create or replace view public.user_daily_focus as
select
  user_id,
  (started_at at time zone 'utc')::date as day,
  sum(case when mode='pomodoro' then duration_seconds else 0 end) as focus_seconds,
  count(*) filter (where mode='pomodoro') as pomodoro_count
from public.focus_sessions
group by user_id, day;

-- Ensure the view executes with invoker privileges so RLS still applies
alter view public.user_daily_focus set (security_invoker = on);

-- SECURITY: Enable RLS
alter table public.focus_sessions enable row level security;
-- Force RLS so even the table owner cannot bypass policies (important when used via views/functions)
alter table public.focus_sessions force row level security;

-- Policies (secure by default): first revoke broad access if any (Supabase starts with none for new table)
-- Select own rows
create policy "select_own_focus" on public.focus_sessions
for select using (auth.uid() = user_id);

-- Insert own rows (user_id must match auth.uid())
create policy "insert_own_focus" on public.focus_sessions
for insert with check (auth.uid() = user_id);

-- Update own rows
create policy "update_own_focus" on public.focus_sessions
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Delete own rows
create policy "delete_own_focus" on public.focus_sessions
for delete using (auth.uid() = user_id);

-- OPTIONAL: helper function to insert safely without trusting client user_id
create or replace function public.log_focus_session(
  p_started_at timestamptz,
  p_ended_at timestamptz,
  p_mode text,
  p_intention text default null,
  p_was_interrupted boolean default false,
  p_productivity smallint default null
) returns public.focus_sessions
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_row public.focus_sessions;
begin
  if p_mode not in ('pomodoro','shortBreak','longBreak') then
    raise exception 'invalid mode %', p_mode;
  end if;
  insert into public.focus_sessions(user_id, started_at, ended_at, mode, intention, was_interrupted, productivity_rating)
  values (auth.uid(), p_started_at, p_ended_at, p_mode, p_intention, coalesce(p_was_interrupted,false), p_productivity)
  returning * into v_row;
  return v_row;
end;$$;

revoke all on function public.log_focus_session(timestamptz, timestamptz, text, text, boolean, smallint) from public;
grant execute on function public.log_focus_session(timestamptz, timestamptz, text, text, boolean, smallint) to authenticated;

-- (Optional) VIEW policies inherit from base table; no separate RLS needed for user_daily_focus.

-- Recommended grants (Supabase sets by default but explicit for clarity)
grant select, insert, update, delete on public.focus_sessions to authenticated;
-- Restrict direct access to the view to authenticated only (no anon)
revoke all on public.user_daily_focus from public;
grant select on public.user_daily_focus to authenticated;

-- DONE