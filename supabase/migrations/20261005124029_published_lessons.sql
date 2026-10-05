-- Lessons made in the in-game editor, published for every player.
-- Everyone (signed in or not) reads published lessons and their demo clips.
-- Only authors write, and only their own lessons. Authors are added by hand (SQL), not from the app.

create table public.authors (
  user_id uuid primary key references auth.users (id) on delete cascade,
  added_at timestamptz not null default now()
);

create table public.lessons (
  id text primary key
    check (char_length(id) <= 64 and id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  author_id uuid not null references auth.users (id) on delete cascade,
  -- The lesson JSON (same shape as content/lessons); the client validates it with the lesson schema
  data jsonb not null check (jsonb_typeof(data) = 'object' and data ->> 'id' = id),
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.lesson_clips (
  id text primary key
    check (char_length(id) <= 120 and id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  lesson_id text not null references public.lessons (id) on delete cascade,
  -- Recorded demo flight ({format: 1, rate, frames})
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  updated_at timestamptz not null default now()
);

create index lesson_clips_lesson_id_idx on public.lesson_clips (lesson_id);
create index lessons_author_id_idx on public.lessons (author_id);

alter table public.authors enable row level security;
alter table public.lessons enable row level security;
alter table public.lesson_clips enable row level security;

-- True when the caller is an author. security definer so it can read authors without exposing the table.
create function public.is_author()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.authors where user_id = (select auth.uid()));
$$;

-- authors: you can see whether you are one; nobody writes through the API
create policy "Authors see their own row"
  on public.authors for select to authenticated
  using ((select auth.uid()) = user_id);

-- lessons: published ones for everyone, your own drafts for you
create policy "Anyone reads published lessons"
  on public.lessons for select to anon, authenticated
  using (published or (select auth.uid()) = author_id);

create policy "Authors add their own lessons"
  on public.lessons for insert to authenticated
  with check ((select public.is_author()) and (select auth.uid()) = author_id);

create policy "Authors change their own lessons"
  on public.lessons for update to authenticated
  using ((select public.is_author()) and (select auth.uid()) = author_id)
  with check ((select public.is_author()) and (select auth.uid()) = author_id);

create policy "Authors delete their own lessons"
  on public.lessons for delete to authenticated
  using ((select public.is_author()) and (select auth.uid()) = author_id);

-- clips follow their lesson
create policy "Anyone reads clips of readable lessons"
  on public.lesson_clips for select to anon, authenticated
  using (exists (
    select 1 from public.lessons l
    where l.id = lesson_id and (l.published or l.author_id = (select auth.uid()))
  ));

create policy "Authors write clips of their own lessons"
  on public.lesson_clips for all to authenticated
  using ((select public.is_author()) and exists (
    select 1 from public.lessons l where l.id = lesson_id and l.author_id = (select auth.uid())
  ))
  with check ((select public.is_author()) and exists (
    select 1 from public.lessons l where l.id = lesson_id and l.author_id = (select auth.uid())
  ));

grant select on public.authors to authenticated;
grant select on public.lessons, public.lesson_clips to anon, authenticated;
grant insert, update, delete on public.lessons, public.lesson_clips to authenticated;

revoke execute on function public.is_author() from public, anon;
grant execute on function public.is_author() to authenticated;
