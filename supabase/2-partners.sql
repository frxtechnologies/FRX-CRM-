-- STEP 2 of 2. Run AFTER schema.sql, and AFTER creating both users in
-- Supabase -> Authentication -> Users -> "Add user" (tick "Auto Confirm User").
--
-- Replace the two email placeholders below with the real login emails, then run.
-- This links each login to a partner profile; only people in `profiles` can see any data.

insert into public.profiles (id, full_name, short_name, email, role_title, avatar_color)
select id, 'Feroze Mohiuddin', 'Feroze', email, 'Founder & CEO', '#2563EB'
from auth.users where email = 'REPLACE-WITH-FEROZE-EMAIL'
on conflict (id) do nothing;

insert into public.profiles (id, full_name, short_name, email, role_title, avatar_color)
select id, 'Raaef Usman', 'Raaef', email, 'Co-founder & Director', '#0EA5E9'
from auth.users where email = 'REPLACE-WITH-RAAEF-EMAIL'
on conflict (id) do nothing;

-- Check: should return 2 rows.
select short_name, email from public.profiles;
