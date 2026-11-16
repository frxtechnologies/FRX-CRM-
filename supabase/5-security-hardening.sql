-- FRX Business OS - security hardening. Run once in the Supabase SQL Editor (safe to run again).
-- Run AFTER schema.sql and migrations 3 and 4.

-- ============ 1. No anonymous access to anything (defence in depth on top of row-level security) ============
revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges in schema public revoke all on tables    from anon;
alter default privileges in schema public revoke all on sequences from anon;
revoke execute on all functions in schema public from anon, public;
alter default privileges in schema public revoke execute on functions from anon, public;
grant  execute on function public.is_partner() to authenticated;   -- needed by the row-level-security policies

-- ============ 2. Profiles: partners can read them, change only their OWN row, and can never add/remove profiles ====
-- (Adding a partner is done by an admin in the SQL editor, see 2-partners.sql.)
drop policy if exists "partners_all"          on public.profiles;
drop policy if exists "profiles_select"       on public.profiles;
drop policy if exists "profiles_update_self"  on public.profiles;
create policy "profiles_select"      on public.profiles for select to authenticated using (public.is_partner());
create policy "profiles_update_self" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- ============ 3. The activity log can only record actions as yourself (no forged "Raaef did X") ============
drop policy if exists "partners_insert" on public.activity_logs;
create policy "partners_insert" on public.activity_logs for insert to authenticated
  with check (public.is_partner() and user_id = auth.uid());

-- ============ 4. Audit columns are set by the database and cannot be forged or rewritten ============
create or replace function public.stamp_creator() returns trigger language plpgsql as $$
begin
  if auth.uid() is not null then new.created_by := auth.uid(); new.updated_by := auth.uid(); end if;
  new.created_at := now(); new.updated_at := now();
  return new;
end $$;

create or replace function public.touch_row() returns trigger language plpgsql as $$
begin
  new.id         := old.id;
  new.created_at := old.created_at;
  new.created_by := old.created_by;
  new.updated_at := now();
  if auth.uid() is not null then new.updated_by := auth.uid(); end if;
  return new;
end $$;

-- ============ 5. The vault's lock parameters can never be changed from the app ============
-- Stops a hijacked session from swapping the vault salt/verifier to lock you out of your own passwords.
-- (To intentionally reset an EMPTY vault, run in the SQL editor:  delete from public.app_settings where id = 'vault';)
create or replace function public.protect_vault_config() returns trigger language plpgsql as $$
begin
  if old.id = 'vault' and auth.uid() is not null then
    raise exception 'The vault configuration cannot be changed from the app';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
drop trigger if exists app_settings_protect_vault on public.app_settings;
create trigger app_settings_protect_vault before update or delete on public.app_settings
  for each row execute function public.protect_vault_config();

-- ============ 6. Sanity rules on money (NOT VALID = enforced for all new writes, old rows are not re-checked) ============
do $$ begin
  alter table public.invoices add constraint invoices_money_sane check (discount >= 0 and tax_rate between 0 and 100 and total >= 0 and amount_paid >= 0 and balance >= 0) not valid;
exception when duplicate_object then null; end $$;
do $$ begin alter table public.income_transactions  add constraint income_rate_pos  check (rate_to_base > 0) not valid; exception when duplicate_object then null; end $$;
do $$ begin alter table public.expense_transactions add constraint expense_rate_pos check (rate_to_base > 0) not valid; exception when duplicate_object then null; end $$;
do $$ begin alter table public.investments          add constraint invest_rate_pos  check (rate_to_base > 0) not valid; exception when duplicate_object then null; end $$;

-- ============ 7. File uploads: 10 MB cap and no scriptable file types (html, svg, js, executables) ============
do $$ begin
  update storage.buckets set
    public = false,
    file_size_limit = 10485760,
    allowed_mime_types = array[
      'image/png','image/jpeg','image/webp','image/gif','application/pdf','text/plain','text/csv','application/json','application/zip',
      'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation'
    ]
  where id = 'frx-files';
exception when others then
  -- never let a storage-settings problem undo the rest of this file; set the limits in Storage -> frx-files -> Edit bucket instead
  raise notice 'Skipped bucket limits: %', sqlerrm;
end $$;

notify pgrst, 'reload schema';
