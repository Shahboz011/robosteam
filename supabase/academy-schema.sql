-- RoboSTEAM academy: modules, lessons, per-user progress, and the private lesson-videos bucket.
-- Idempotent: safe to run again. Run AFTER supabase/schema.sql, then run supabase/seed.sql.
-- Supabase dashboard: SQL Editor -> New query -> paste -> Run.

-- 1. Tables -------------------------------------------------------------------------------------------
create table if not exists public.modules (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  description text,
  order_index int  not null default 0,
  published   boolean not null default false,
  created_at  timestamptz not null default now()
);

create table if not exists public.lessons (
  id               uuid primary key default gen_random_uuid(),
  module_id        uuid not null references public.modules (id) on delete cascade,
  title            text not null,
  body             text,          -- short lesson notes; blank line = new paragraph, "- " = list item, "## " = heading
  video_path       text,          -- object path inside the lesson-videos bucket, e.g. 'elektronika-asoslari/01-kirish.mp4'
  duration_seconds int check (duration_seconds is null or duration_seconds >= 0),
  order_index      int  not null default 0,
  published        boolean not null default false,
  created_at       timestamptz not null default now()
);

create table if not exists public.lesson_progress (
  user_id               uuid not null references auth.users (id) on delete cascade,
  lesson_id             uuid not null references public.lessons (id) on delete cascade,
  completed             boolean not null default false,
  completed_at          timestamptz,
  last_position_seconds int not null default 0 check (last_position_seconds >= 0),
  updated_at            timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

comment on table public.modules is 'Academy modules. Only published rows are readable by signed-in users.';
comment on table public.lessons is 'Academy lessons. Readable when the lesson and its module are both published.';
comment on table public.lesson_progress is 'One row per (user, lesson). Timestamps are set by the lesson_progress_touch trigger.';

create index if not exists lessons_module_order_idx on public.lessons (module_id, order_index);
-- The primary key already starts with user_id; this is the explicit index asked for, and cheap at this size.
create index if not exists lesson_progress_user_idx on public.lesson_progress (user_id);
-- Covers the lesson_id foreign key, so deleting a lesson doesn't scan the whole progress table.
create index if not exists lesson_progress_lesson_idx on public.lesson_progress (lesson_id);

-- 2. Server-side timestamps: the client only sends completed = true; the clock is the database's --------
create or replace function public.lesson_progress_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  if new.completed then
    -- keep the first completion time when a finished lesson is marked complete again
    new.completed_at := case when tg_op = 'UPDATE' and old.completed then old.completed_at else now() end;
  else
    new.completed_at := null;
  end if;
  return new;
end;
$$;

revoke execute on function public.lesson_progress_touch() from public, anon, authenticated;

drop trigger if exists lesson_progress_touch on public.lesson_progress;
create trigger lesson_progress_touch
  before insert or update on public.lesson_progress
  for each row execute function public.lesson_progress_touch();

-- 3. Row Level Security -------------------------------------------------------------------------------
alter table public.modules         enable row level security;
alter table public.lessons         enable row level security;
alter table public.lesson_progress enable row level security;

drop policy if exists "Modules: read published" on public.modules;
create policy "Modules: read published"
  on public.modules for select
  to authenticated
  using (published);

-- A published lesson inside an unpublished module stays hidden too.
drop policy if exists "Lessons: read published" on public.lessons;
create policy "Lessons: read published"
  on public.lessons for select
  to authenticated
  using (published and exists (select 1 from public.modules m where m.id = module_id and m.published));

drop policy if exists "Progress: read own rows" on public.lesson_progress;
create policy "Progress: read own rows"
  on public.lesson_progress for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- The lessons subquery runs under the lessons policy, so progress can only be recorded for visible lessons.
drop policy if exists "Progress: insert own rows" on public.lesson_progress;
create policy "Progress: insert own rows"
  on public.lesson_progress for insert
  to authenticated
  with check ((select auth.uid()) = user_id and exists (select 1 from public.lessons l where l.id = lesson_id));

drop policy if exists "Progress: update own rows" on public.lesson_progress;
create policy "Progress: update own rows"
  on public.lesson_progress for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and exists (select 1 from public.lessons l where l.id = lesson_id));

-- No insert/update/delete policies on modules and lessons: content is edited in the dashboard (which bypasses RLS).
-- No delete policy on lesson_progress: rows go away with the user or the lesson (cascade).
revoke all on public.modules, public.lessons, public.lesson_progress from anon, authenticated;
grant select on public.modules, public.lessons to authenticated;
grant select, insert, update on public.lesson_progress to authenticated;

-- 4. Roadmap placeholders -----------------------------------------------------------------------------
-- The policy above hides unpublished modules, but the sidebar shows them as locked so learners can see
-- what's coming. This returns only their id, title and position (never the description or any lessons).
create or replace function public.academy_upcoming_modules()
returns table (id uuid, title text, order_index int)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.title, m.order_index from public.modules m where not m.published order by m.order_index;
$$;

revoke execute on function public.academy_upcoming_modules() from public, anon;
grant execute on function public.academy_upcoming_modules() to authenticated;

-- 5. Storage: private bucket for lesson videos --------------------------------------------------------
-- Upload files by hand for now: Dashboard -> Storage -> lesson-videos -> Upload file. The object path (e.g.
-- 'elektronika-asoslari/01-kirish.mp4', without the bucket name) goes into lessons.video_path.
insert into storage.buckets (id, name, public, allowed_mime_types)
values ('lesson-videos', 'lesson-videos', false, array['video/mp4', 'video/webm'])
on conflict (id) do update set public = false, allowed_mime_types = excluded.allowed_mime_types;

-- No storage policies yet, so the browser can neither list, read nor upload these files.
--
-- LATER, signed URLs from the client: the browser calls
--     const { data, error } = await sb.storage.from('lesson-videos').createSignedUrl(lesson.video_path, 60 * 60);
--     video.src = data.signedUrl;   // a temporary link, valid for expiresInSeconds
-- (see getVideoUrl / createSignedVideoUrl in js/academy.js). createSignedUrl needs SELECT on storage.objects,
-- so at that point add a policy like this one, which only covers files attached to a lesson the user can see:
--
-- create policy "Lesson videos: signed-in users read published lessons"
--   on storage.objects for select
--   to authenticated
--   using (bucket_id = 'lesson-videos'
--          and exists (select 1 from public.lessons l where l.video_path = storage.objects.name));
--
-- The page CSP already allows it: academy.html has media-src https://*.supabase.co.

-- 6. Check: every table in public must have RLS on. This should return no rows.
-- select tablename from pg_tables where schemaname = 'public' and not rowsecurity;
