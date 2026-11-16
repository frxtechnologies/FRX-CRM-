-- FRX BUSINESS OS — Supabase schema (PostgreSQL) with Row Level Security.
-- Run once in the Supabase SQL editor of a NEW project dedicated to FRX internal use.
-- Then create the two partner users in Authentication > Users and insert their profiles
-- (see bottom of file). Only users listed in `profiles` can read/write anything.

create extension if not exists pgcrypto;

-- ---------- helpers ----------
create or replace function public.touch_row() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end $$;

create or replace function public.stamp_creator() returns trigger language plpgsql as $$
begin
  new.created_by := coalesce(new.created_by, auth.uid());
  new.updated_by := coalesce(new.updated_by, auth.uid());
  return new;
end $$;

-- ---------- profiles ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  short_name text not null,
  email text not null,
  role_title text,
  avatar_color text default '#2563EB',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid
);

create or replace function public.is_partner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid());
$$;


create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  market text not null check (market in ('local','international')),
  business_name text not null,
  contact_person text, email text, phone text, whatsapp text, website text,
  country text, city text, industry text, business_type text, source text,
  assigned_to uuid references public.profiles(id),
  priority text not null default 'medium' check (priority in ('low','medium','high')),
  deal_value numeric(14,2) default 0, currency text default 'USD',
  services text[] default '{}', tags text[] default '{}',
  notes text, status text not null default 'New Lead',
  next_follow_up date, last_contact date,
  converted_client_id uuid, dedupe_key text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid
);
create index if not exists leads_status_idx on public.leads(status);
create index if not exists leads_market_idx on public.leads(market);
create index if not exists leads_dedupe_idx on public.leads(dedupe_key);

create table if not exists public.lead_activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  type text not null, occurred_at timestamptz not null default now(),
  user_id uuid references public.profiles(id), notes text, next_action text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid
);
create index if not exists lead_activities_lead_idx on public.lead_activities(lead_id);

create table if not exists public.lead_notes (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid
);

create table if not exists public.follow_ups (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  due_date date not null, assigned_to uuid references public.profiles(id),
  status text not null default 'pending' check (status in ('pending','completed')),
  reminder_at timestamptz, note text, completed_at timestamptz, completed_by uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid
);
create index if not exists follow_ups_due_idx on public.follow_ups(due_date) where status = 'pending';

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete set null,
  name text not null, company text, email text, phone text, country text, address text, website text,
  industry text, assigned_to uuid references public.profiles(id), client_since date default current_date,
  services text[] default '{}', contract_value numeric(14,2) default 0, currency text default 'USD',
  payment_status text default 'Pending', category text default 'New', notes text,
  onboarding jsonb default '[]'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete restrict,
  name text not null, description text, services text[] default '{}',
  start_date date, due_date date, completed_date date,
  amount numeric(14,2) default 0, currency text default 'USD',
  status text not null default 'Not Started', assigned_to uuid references public.profiles(id),
  priority text default 'medium', requirements text, notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid
);

create table if not exists public.project_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null, assigned_to uuid references public.profiles(id), due_date date, done boolean default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid
);

create table if not exists public.business_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null, description text, assigned_to uuid references public.profiles(id),
  priority text default 'medium', due_date date, category text default 'Other',
  lead_id uuid references public.leads(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  status text not null default 'To Do', completed_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid
);

create table if not exists public.business_notes (
  id uuid primary key default gen_random_uuid(),
  title text not null, body text, kind text default 'note', pinned boolean default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid
);

-- Money: numeric only. Each row keeps its ORIGINAL currency and the rate to the base currency at entry time.
create table if not exists public.income_transactions (
  id uuid primary key default gen_random_uuid(),
  name text not null, client_id uuid references public.clients(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  invoice_id uuid, amount numeric(14,2) not null check (amount > 0), currency text not null default 'PKR',
  rate_to_base numeric(18,8) not null default 1, date date not null default current_date,
  method text, reference text, notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid
);

create table if not exists public.expense_transactions (
  id uuid primary key default gen_random_uuid(),
  name text not null, category text default 'Other', amount numeric(14,2) not null check (amount > 0),
  currency text not null default 'PKR', rate_to_base numeric(18,8) not null default 1,
  date date not null default current_date, method text, description text, receipt_url text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid
);

-- Founder / outside investment: deliberately separate from income so it never counts as revenue.
create table if not exists public.investments (
  id uuid primary key default gen_random_uuid(),
  investor text not null, investor_name text, amount numeric(14,2) not null check (amount > 0),
  currency text not null default 'PKR', rate_to_base numeric(18,8) not null default 1,
  date date not null default current_date, purpose text, description text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid
);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  number text not null unique, client_id uuid references public.clients(id) on delete set null,
  client_name text, client_company text, client_email text, client_phone text, client_address text,
  company_info jsonb default '{}'::jsonb, extra_fields jsonb default '[]'::jsonb,
  project_id uuid references public.projects(id) on delete set null, project_name text,
  issue_date date not null default current_date, due_date date,
  currency text not null default 'USD', rate_to_base numeric(18,8) not null default 1,
  discount numeric(14,2) default 0, tax_rate numeric(6,3) default 0,
  subtotal numeric(14,2) default 0, tax_amount numeric(14,2) default 0, total numeric(14,2) default 0,
  amount_paid numeric(14,2) default 0, balance numeric(14,2) default 0,
  status text not null default 'Draft' check (status in ('Draft','Sent','Partially Paid','Paid','Overdue','Cancelled')),
  payment_terms text, payment_instructions text, notes text, terms jsonb default '[]'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid
);

create table if not exists public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  description text not null, quantity numeric(12,2) not null default 1, unit_price numeric(14,2) not null default 0,
  position int default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid
);

create table if not exists public.invoice_payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0), date date not null default current_date,
  method text, reference text, notes text, income_id uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  name text not null, provider text, category text default 'Other', plan text,
  amount numeric(14,2) default 0, currency text default 'USD', rate_to_base numeric(18,8) default 1,
  billing_cycle text default 'Monthly', purchase_date date, start_date date, renewal_date date, expiration_date date,
  recurring boolean default false, payment_method text, account_email text,
  responsible_to uuid references public.profiles(id), status text default 'Active',
  reminder_days int[] default '{30,7,3,0}', notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  name text not null, category text default 'Other', file_url text, mime text, size bigint, notes text,
  lead_id uuid references public.leads(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  income_id uuid references public.income_transactions(id) on delete set null,
  expense_id uuid references public.expense_transactions(id) on delete set null,
  invoice_id uuid references public.invoices(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id), -- null = both partners
  kind text, title text not null, body text, link text, dedupe_key text unique,
  read_by uuid[] default '{}',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid
);

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id), action text, entity text, entity_id text, summary text not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid
);
create index if not exists activity_logs_created_idx on public.activity_logs(created_at desc);

create table if not exists public.exchange_rates (
  id text primary key, -- currency code
  rate_to_base numeric(18,8) not null check (rate_to_base > 0), base text not null default 'PKR',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid
);

-- invoice_settings + company/lead-status/category/preferences live here as key -> json
create table if not exists public.app_settings (
  id text primary key, value jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid
);

-- ---------- triggers + RLS on every table ----------
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','leads','lead_activities','lead_notes','follow_ups','clients','projects','project_tasks',
    'business_tasks','business_notes','income_transactions','expense_transactions','investments',
    'invoices','invoice_items','invoice_payments','subscriptions','documents','notifications',
    'activity_logs','exchange_rates','app_settings'
  ] loop
    execute format('drop trigger if exists %I_touch on public.%I', t, t);
    execute format('create trigger %I_touch before update on public.%I for each row execute function public.touch_row()', t, t);
    if t <> 'profiles' then
      execute format('drop trigger if exists %I_stamp on public.%I', t, t);
      execute format('create trigger %I_stamp before insert on public.%I for each row execute function public.stamp_creator()', t, t);
    end if;
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "partners_all" on public.%I', t);
    execute format('create policy "partners_all" on public.%I for all to authenticated using (public.is_partner()) with check (public.is_partner())', t);
  end loop;
end $$;

-- Activity log is append-only: no edits or deletes, even by partners.
drop policy if exists "partners_all" on public.activity_logs;
drop policy if exists "partners_read" on public.activity_logs;
drop policy if exists "partners_insert" on public.activity_logs;
create policy "partners_read" on public.activity_logs for select to authenticated using (public.is_partner());
create policy "partners_insert" on public.activity_logs for insert to authenticated with check (public.is_partner());

-- ---------- realtime ----------
do $$
declare t text;
begin
  foreach t in array array[
    'leads','lead_activities','lead_notes','follow_ups','clients','projects','project_tasks','business_tasks',
    'business_notes','income_transactions','expense_transactions','investments','invoices','invoice_items',
    'invoice_payments','subscriptions','documents','notifications','activity_logs','exchange_rates','app_settings'
  ] loop
    begin execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null; end;
  end loop;
end $$;

-- ---------- storage ----------
insert into storage.buckets (id, name, public) values ('frx-files', 'frx-files', false) on conflict do nothing;
drop policy if exists "partners_files" on storage.objects;
create policy "partners_files" on storage.objects for all to authenticated
  using (bucket_id = 'frx-files' and public.is_partner()) with check (bucket_id = 'frx-files' and public.is_partner());

-- ---------- bootstrap the two partners (run AFTER creating both users in Auth) ----------
-- insert into public.profiles (id, full_name, short_name, email, role_title) values
--   ('<feroze auth uid>', 'Feroze Mohiuddin', 'Feroze', '<feroze email>', 'Founder & CEO'),
--   ('<raaef auth uid>',  'Raaef Usman',      'Raaef',  '<raaef email>',  'Co-founder & Director');
-- Disable public sign-ups in Authentication settings so nobody else can ever register.
