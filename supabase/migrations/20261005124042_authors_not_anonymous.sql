-- Second lock: a guest (anonymous) session is never an author, even if its id were added to authors.
create or replace function public.is_author()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
     and exists (select 1 from public.authors where user_id = (select auth.uid()));
$$;
