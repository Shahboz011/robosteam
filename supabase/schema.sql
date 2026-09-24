-- RoboSTEAM: profiles + signup trigger + RLS. Idempotent: safe to run again.
-- Run in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.

-- 1. Profiles: one row per auth user --------------------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text check (full_name is null or char_length(full_name) <= 80),
  level      text check (level is null or level in ('beginner', 'some-electronics', 'builder')),
  created_at timestamptz not null default now()
);

comment on table public.profiles is 'Public profile for each auth user. Created by the on_auth_user_created trigger.';

-- 2. Create the profile when a user signs up (reads signUp options.data = raw_user_meta_data) -----------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta  jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  lvl   text  := meta ->> 'level';
begin
  insert into public.profiles (id, full_name, level)
  values (
    new.id,
    nullif(left(btrim(meta ->> 'full_name'), 80), ''),
    -- metadata comes from the client, so never let a bad value block the signup itself
    case when lvl in ('beginner', 'some-electronics', 'builder') then lvl end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Trigger functions must not be callable through the API (/rest/v1/rpc).
revoke execute on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 3. Row Level Security -------------------------------------------------------------------------------
alter table public.profiles enable row level security;

drop policy if exists "Profiles: read own row" on public.profiles;
create policy "Profiles: read own row"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "Profiles: update own row" on public.profiles;
create policy "Profiles: update own row"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- No insert or delete policies: rows are created by the trigger and removed by the cascade.
-- Column privileges as a second layer: signed-in users can read their row and change only these two columns.
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, level) on public.profiles to authenticated;

-- 4. Backfill: profiles for users who signed up before this script ran ---------------------------------
insert into public.profiles (id, full_name, level)
select u.id,
       nullif(left(btrim(u.raw_user_meta_data ->> 'full_name'), 80), ''),
       case when u.raw_user_meta_data ->> 'level' in ('beginner', 'some-electronics', 'builder')
            then u.raw_user_meta_data ->> 'level' end
from auth.users u
on conflict (id) do nothing;

-- 5. Later tables (not created yet). Same pattern for each:
--   public.lesson_progress     (user_id uuid references public.profiles(id) on delete cascade, lesson_slug text,
--                               completed_at timestamptz, primary key (user_id, lesson_slug))
--   public.simulator_projects  (id uuid default gen_random_uuid() primary key,
--                               user_id uuid references public.profiles(id) on delete cascade,
--                               title text, circuit jsonb, code text, updated_at timestamptz default now())
--   -> enable row level security, policies scoped to (select auth.uid()) = user_id, index on user_id.

-- 6. Check: every table in public must have RLS on. This should return no rows.
-- select tablename from pg_tables where schemaname = 'public' and not rowsecurity;
