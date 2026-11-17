-- Run once in the Supabase SQL Editor (safe to run again).
-- Stores which phones/computers have turned on alerts. Each person can only see and manage THEIR OWN devices;
-- the alert sender (a Supabase function) reads all of them with its own privileged key.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;
drop policy if exists "own_devices" on public.push_subscriptions;
create policy "own_devices" on public.push_subscriptions for all to authenticated
  using (public.is_partner() and user_id = auth.uid())
  with check (public.is_partner() and user_id = auth.uid());

revoke all on public.push_subscriptions from anon;
grant select, insert, update, delete on public.push_subscriptions to authenticated;

notify pgrst, 'reload schema';
