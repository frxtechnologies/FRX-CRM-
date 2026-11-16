-- Run once in the Supabase SQL Editor (safe to run again).
-- Lets each invoice carry its own customised details:
--   client_phone  - phone number printed under "Bill to"
--   company_info  - the "From" details (name / website / email / phone / address) as they were when the invoice was made
--   extra_fields  - any custom label/value lines, e.g. "PO Number", "Tax ID", "Bank ref"

alter table public.invoices add column if not exists client_phone text;
alter table public.invoices add column if not exists company_info jsonb default '{}'::jsonb;
alter table public.invoices add column if not exists extra_fields jsonb default '[]'::jsonb;

-- Make the API pick up the new columns immediately.
notify pgrst, 'reload schema';
