-- rls_auto_enable() is the event-trigger helper Supabase adds for "automatic RLS".
-- It is only meant to run as an event trigger; nobody should call it through the API.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
