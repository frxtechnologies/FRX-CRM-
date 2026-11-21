-- TEMPLATE. Do not run as is: replace the two placeholders first (YOUR-PROJECT-REF and YOUR-WEBHOOK-SECRET).
-- A ready-filled private copy is generated for you in supabase/9-phone-alerts-triggers.local.sql (git-ignored).
--
-- Before running, enable two extensions in Supabase: Database -> Extensions -> turn on  pg_net  and  pg_cron.
--
-- 1) Every new row in `notifications` (new lead, task assigned, payment received, overdue item...) triggers an alert.
-- 2) Every morning at 09:00 Pakistan time (04:00 UTC) each partner gets one summary alert, but only if there is
--    something to say.

-- needed for instant alerts
create extension if not exists pg_net;

create or replace function public.push_on_notification() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform net.http_post(
    url     := 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/phone-alerts',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', 'YOUR-WEBHOOK-SECRET'),
    body    := jsonb_build_object('type', 'INSERT', 'table', 'notifications', 'record', to_jsonb(new)),
    timeout_milliseconds := 5000
  );
  return new;
exception when others then
  return new;   -- a failed alert must never stop the notification itself from being saved
end $$;

revoke all on function public.push_on_notification() from public, anon, authenticated;

drop trigger if exists notifications_push on public.notifications;
create trigger notifications_push after insert on public.notifications
  for each row execute function public.push_on_notification();

-- morning summary (needs pg_cron; re-running replaces the old schedule)
create extension if not exists pg_cron;
select cron.unschedule('frx-daily-digest') where exists (select 1 from cron.job where jobname = 'frx-daily-digest');
select cron.schedule('frx-daily-digest', '0 4 * * *', $cron$
  select net.http_post(
    url     := 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/phone-alerts',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', 'YOUR-WEBHOOK-SECRET'),
    body    := '{"digest": true}'::jsonb
  );
$cron$);
