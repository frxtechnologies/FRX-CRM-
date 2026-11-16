# FRX Business OS

Internal business management platform for FRX Technologies (Feroze + Raaef). React 19 · TypeScript · Tailwind 4 · Supabase (Postgres, Auth, Realtime, Storage, RLS) · Recharts · jsPDF.

> Separate project from `../frx-businessos` (a different, multi-tenant product). Vite is pinned to 7 (Vite 8 is blocked by App Control on this machine).

## Run

```bash
npm install
npm run dev      # http://localhost:5200
npm run build    # typecheck + production build
```

### Two modes

| Mode | When | Data |
|---|---|---|
| **Demo** | `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` empty | Stored in this browser only. Pick a partner at login; open a second tab as the other partner to see live sync. Settings -> Data has labelled `[Sample]` data you can load/remove. |
| **Production** | both vars set | Shared Supabase workspace, per-partner passwords, RLS, realtime. |

### Going live (dedicated FRX Supabase project - already wired in `.env.local`)

1. Supabase -> **SQL Editor** -> paste all of `supabase/schema.sql` -> Run.
2. Supabase -> **Authentication -> Users -> Add user** (tick *Auto Confirm User*) for Feroze and Raaef. Authentication -> Providers/Settings: **disable new sign-ups**.
3. SQL Editor -> paste `supabase/2-partners.sql`, replace the two email placeholders -> Run (should return 2 rows). Keep your real emails in `supabase/2-partners.local.sql` (git-ignored; this repo is public).
3b. Existing installs only: run `supabase/3-invoice-custom-fields.sql` once (adds per-invoice client phone, "From" details and extra fields).
4. Open the app and sign in. Never put the service-role key in the front end.

To go back to demo mode, empty the two `VITE_SUPABASE_*` values in `.env.local`.

## How the money works

- Every transaction keeps its **original currency** and the **rate to the reporting currency saved at entry time** (`rate_to_base`). Changing rates later never rewrites history. Default reporting currency is PKR.
- The shipped exchange rates are **placeholders** - update them in Settings -> Currency.
- **Cash received** = income transactions (invoice payments create one automatically). Unpaid invoices are never cash.
- **Recognized revenue** = Accrual (invoiced non-draft invoices + income not tied to an invoice) or Cash, chosen in Settings. Founder/other **investments are never revenue**.
- Net operating profit = recognized revenue - expenses. Net cash position = cash received + investments - expenses.
- Invoice totals, paid, balance and status are recomputed from items + payments in one place (`recomputeInvoice`).

## Known limits (honest list)

- Business rules (invoice recompute, activity log, automations, lead conversion) run in the client, not as DB triggers. RLS + constraints protect the data, but two partners editing the same invoice at the same instant could race.
- Automations (overdue invoices, follow-up/task/subscription alerts) run when a partner has the app open (on load and every 5 min); there is no server cron.
- Nothing sends email / WhatsApp / calls. Links open your own apps; you log what you did.
- Demo-mode files are stored as data URLs (2.5 MB cap).
- "Meetings" and "calls scheduled" on the dashboard come from follow-ups, tasks and logged activity; there is no separate calendar-booking model.
- Not yet verified against a live Supabase project (no credentials were available): the schema and Supabase adapter are written but the 10 workflow tests were run in demo mode.
