-- Run once in the Supabase SQL Editor (safe to run again).
-- Adds the Vault: logins, recovery codes and access details for clients, FRX and personal accounts.
--
-- Secrets (password, recovery codes, notes) are encrypted in the browser with the shared vault passphrase
-- BEFORE they reach the database, so `secret_enc` only ever holds ciphertext. Title, category, URL and
-- username are stored as normal text so they can be searched.

create table if not exists public.vault_items (
  id uuid primary key default gen_random_uuid(),
  scope text not null default 'client' check (scope in ('client','company','personal')),
  client_id uuid references public.clients(id) on delete cascade,
  owner_id uuid references public.profiles(id) on delete set null,
  title text not null,
  category text default 'Login',
  url text,
  username text,
  secret_enc text,               -- AES-GCM ciphertext (iv.ciphertext, base64). Never plain text.
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid
);
create index if not exists vault_items_client_idx on public.vault_items(client_id);

drop trigger if exists vault_items_touch on public.vault_items;
create trigger vault_items_touch before update on public.vault_items for each row execute function public.touch_row();
drop trigger if exists vault_items_stamp on public.vault_items;
create trigger vault_items_stamp before insert on public.vault_items for each row execute function public.stamp_creator();

alter table public.vault_items enable row level security;
drop policy if exists "partners_all" on public.vault_items;
create policy "partners_all" on public.vault_items for all to authenticated
  using (public.is_partner()) with check (public.is_partner());

do $$ begin
  alter publication supabase_realtime add table public.vault_items;
exception when duplicate_object then null; end $$;

notify pgrst, 'reload schema';
