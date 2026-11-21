-- Run once in the Supabase SQL Editor (safe to run again).
-- Private chat between the two partners (WhatsApp style): text, photos/files, shared CRM records, replies,
-- read receipts. Messages are NOT written to the activity log.
--
-- Rules, enforced by the database (not just the screen):
--   * Only the two partners can read or write messages.
--   * You can only send messages as YOURSELF (sender_id must be you).
--   * Only the sender can edit or delete (soft-delete) their own message.
--   * Only the OTHER partner can mark a message as read.
--   * Nobody can change who sent a message or when. Messages cannot be hard-deleted from the app.

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null default '' check (char_length(body) <= 4000),
  reply_to uuid references public.messages(id) on delete set null,
  ref_type text check (ref_type in ('lead','client','project','invoice','task')),
  ref_id uuid,
  ref_label text,
  attachment_url text,
  attachment_name text,
  attachment_mime text,
  attachment_size bigint,
  read_at timestamptz,
  edited boolean not null default false,
  deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid,
  constraint messages_not_empty check (deleted or body <> '' or attachment_url is not null or ref_id is not null)
);
create index if not exists messages_created_idx on public.messages(created_at);

-- who may change what
create or replace function public.messages_guard() returns trigger language plpgsql as $$
begin
  if auth.uid() is null then return new; end if;            -- admin / SQL editor
  new.id := old.id; new.sender_id := old.sender_id; new.created_at := old.created_at; new.reply_to := old.reply_to;
  if auth.uid() = old.sender_id then
    new.read_at := old.read_at;                              -- you cannot mark your own message as read
  else
    new.body := old.body; new.deleted := old.deleted; new.edited := old.edited;   -- the other partner may only mark it read
    new.ref_type := old.ref_type; new.ref_id := old.ref_id; new.ref_label := old.ref_label;
    new.attachment_url := old.attachment_url; new.attachment_name := old.attachment_name;
    new.attachment_mime := old.attachment_mime; new.attachment_size := old.attachment_size;
  end if;
  return new;
end $$;

drop trigger if exists messages_guard on public.messages;
create trigger messages_guard before update on public.messages for each row execute function public.messages_guard();
drop trigger if exists messages_touch on public.messages;
create trigger messages_touch before update on public.messages for each row execute function public.touch_row();
drop trigger if exists messages_stamp on public.messages;
create trigger messages_stamp before insert on public.messages for each row execute function public.stamp_creator();

alter table public.messages enable row level security;
drop policy if exists "msg_select" on public.messages;
drop policy if exists "msg_insert" on public.messages;
drop policy if exists "msg_update" on public.messages;
create policy "msg_select" on public.messages for select to authenticated using (public.is_partner());
create policy "msg_insert" on public.messages for insert to authenticated with check (public.is_partner() and sender_id = auth.uid());
create policy "msg_update" on public.messages for update to authenticated using (public.is_partner()) with check (public.is_partner());
-- no delete policy on purpose: messages are soft-deleted by the sender

revoke all on public.messages from anon;
grant select, insert, update on public.messages to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null; end $$;

notify pgrst, 'reload schema';
