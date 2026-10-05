-- Accounts and lesson progress.
-- Players read their own rows. Nothing is written from the client directly:
-- profiles are created by a trigger, XP and completions only through complete_lesson(), which caps the award.

-- Profiles: one per auth user (anonymous users included)
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nickname text not null
    check (char_length(nickname) between 3 and 20 and nickname ~ '^[A-Za-z0-9_-]+$'),
  xp integer not null default 0 check (xp >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One row per player per lesson they have finished
create table public.lesson_completions (
  user_id uuid not null references auth.users (id) on delete cascade,
  lesson_id text not null
    check (char_length(lesson_id) <= 64 and lesson_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  best_xp integer not null default 0 check (best_xp >= 0),
  completions integer not null default 0 check (completions >= 0),
  first_completed_at timestamptz not null default now(),
  last_completed_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

alter table public.profiles enable row level security;
alter table public.lesson_completions enable row level security;

-- Read your own rows only. There are no insert/update/delete policies, so direct writes are refused.
create policy "Players read their own profile"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);

create policy "Players read their own completions"
  on public.lesson_completions for select to authenticated
  using ((select auth.uid()) = user_id);

-- New tables are not exposed automatically in this project: grant read access explicitly
grant select on public.profiles to authenticated;
grant select on public.lesson_completions to authenticated;

-- Every new auth user gets a profile with a placeholder nickname
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, nickname)
  values (new.id, 'pilot_' || substr(replace(new.id::text, '-', ''), 1, 6));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Records a finished lesson and awards XP. The server decides the amount:
-- flight XP is capped (20 gates × 10), the completion bonus is fixed, and a repeat within 15 s earns nothing.
create function public.complete_lesson(p_lesson_id text, p_flight_xp integer)
returns table (awarded integer, total_xp integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  max_flight_xp constant integer := 200;
  bonus_xp constant integer := 30;
  cooldown constant interval := interval '15 seconds';
  prev public.lesson_completions;
  award integer;
begin
  if uid is null then
    raise exception 'not_signed_in' using errcode = '28000';
  end if;
  if p_lesson_id is null or char_length(p_lesson_id) > 64 or p_lesson_id !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'bad_lesson_id' using errcode = '22023';
  end if;

  award := least(greatest(coalesce(p_flight_xp, 0), 0), max_flight_xp) + bonus_xp;

  select * into prev from public.lesson_completions
  where user_id = uid and lesson_id = p_lesson_id
  for update;

  if found and prev.last_completed_at > now() - cooldown then
    award := 0;
  end if;

  insert into public.lesson_completions (user_id, lesson_id, best_xp, completions)
  values (uid, p_lesson_id, award, 1)
  on conflict (user_id, lesson_id) do update
    set best_xp = greatest(public.lesson_completions.best_xp, excluded.best_xp),
        completions = public.lesson_completions.completions + 1,
        last_completed_at = now();

  update public.profiles
  set xp = xp + award, updated_at = now()
  where id = uid
  returning profiles.xp into total_xp;

  awarded := award;
  return next;
end;
$$;

-- Functions are executable by everyone by default: only signed-in players (anonymous included) may call it
revoke execute on function public.complete_lesson(text, integer) from public, anon;
grant execute on function public.complete_lesson(text, integer) to authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
