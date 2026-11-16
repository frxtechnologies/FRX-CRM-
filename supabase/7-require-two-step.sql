-- OPTIONAL but strongly recommended. Makes two-step verification mandatory at the DATABASE level.
--
-- ORDER MATTERS (or you will lock yourself out):
--   1. Both partners sign in and turn on two-step verification in  Settings -> Security  (authenticator app).
--   2. Both sign out and sign back in once using the 6-digit code, to prove it works.
--   3. THEN run this file.
--
-- Until this runs, two-step is enforced by the app's login screen only. After it runs, even someone who has a
-- stolen password and talks to the API directly gets nothing without the 6-digit code.

create or replace function public.is_partner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid())
     and coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2';      -- aal2 = signed in AND passed the 6-digit code
$$;
grant execute on function public.is_partner() to authenticated;

-- To undo (e.g. a lost phone), run this in the SQL editor:
--   create or replace function public.is_partner() returns boolean language sql stable security definer set search_path = public as
--   $$ select exists (select 1 from public.profiles p where p.id = auth.uid()); $$;
