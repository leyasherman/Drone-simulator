-- Players change their own nickname only through this function (profiles has no update policy).
-- Nicknames are display names: 3-20 letters, digits, _ or -. Not unique.
create function public.set_nickname(p_nickname text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  nick text := btrim(coalesce(p_nickname, ''));
begin
  if uid is null then
    raise exception 'not_signed_in' using errcode = '28000';
  end if;
  if char_length(nick) not between 3 and 20 or nick !~ '^[A-Za-z0-9_-]+$' then
    raise exception 'bad_nickname' using errcode = '22023';
  end if;
  update public.profiles set nickname = nick, updated_at = now() where id = uid;
  return nick;
end;
$$;

revoke execute on function public.set_nickname(text) from public, anon;
grant execute on function public.set_nickname(text) to authenticated;
