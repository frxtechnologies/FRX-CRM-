-- Run once in the Supabase SQL Editor (safe to run again).
-- Personal spending for each partner. Kept completely separate from business expenses: it never touches
-- the profit and loss, revenue or cash numbers.
--
-- Access rules (enforced by the database, not just the screen):
--   * Both partners can SEE everyone's personal expenses.
--   * Only the OWNER can add, change or delete their own entries (nobody can edit the other person's).

create table if not exists public.personal_expenses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  category text default 'Other',
  amount numeric(14,2) not null check (amount > 0),
  currency text not null default 'PKR',
  rate_to_base numeric(18,8) not null default 1 check (rate_to_base > 0),
  date date not null default current_date,
  method text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid
);
create index if not exists personal_expenses_owner_date_idx on public.personal_expenses(owner_id, date desc);

drop trigger if exists personal_expenses_touch on public.personal_expenses;
create trigger personal_expenses_touch before update on public.personal_expenses for each row execute function public.touch_row();
drop trigger if exists personal_expenses_stamp on public.personal_expenses;
create trigger personal_expenses_stamp before insert on public.personal_expenses for each row execute function public.stamp_creator();

alter table public.personal_expenses enable row level security;
drop policy if exists "pe_select" on public.personal_expenses;
drop policy if exists "pe_insert" on public.personal_expenses;
drop policy if exists "pe_update" on public.personal_expenses;
drop policy if exists "pe_delete" on public.personal_expenses;
create policy "pe_select" on public.personal_expenses for select to authenticated using (public.is_partner());
create policy "pe_insert" on public.personal_expenses for insert to authenticated with check (public.is_partner() and owner_id = auth.uid());
create policy "pe_update" on public.personal_expenses for update to authenticated using (public.is_partner() and owner_id = auth.uid()) with check (public.is_partner() and owner_id = auth.uid());
create policy "pe_delete" on public.personal_expenses for delete to authenticated using (public.is_partner() and owner_id = auth.uid());

revoke all on public.personal_expenses from anon;
grant select, insert, update, delete on public.personal_expenses to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.personal_expenses;
exception when duplicate_object then null; end $$;

notify pgrst, 'reload schema';
