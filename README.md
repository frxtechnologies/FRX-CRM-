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

Run these in the Supabase **SQL Editor**, in order:

| # | File | What it does |
|---|---|---|
| 1 | `supabase/schema.sql` | Tables + row-level security |
| 2 | `supabase/2-partners.sql` | Links the two partner logins (replace the email placeholders; keep real emails in `2-partners.local.sql`, which is git-ignored) |
| 3 | `supabase/3-invoice-custom-fields.sql` | Per-invoice client phone, "from" details, extra fields |
| 4 | `supabase/4-vault.sql` | The Vault (encrypted logins and recovery codes) |
| 5 | `supabase/5-security-hardening.sql` | Anonymous lock-down, tamper-proof audit columns, upload limits, vault protection |
| 6 | `supabase/6-personal-expenses.sql` | Personal spending for each partner |
| 7 | `supabase/7-require-two-step.sql` | **Last, optional:** makes two-step login mandatory in the database. Turn two-step on for both partners first (Settings -> Security) |
| 8 | `supabase/8-phone-alerts.sql` | Table for the phones that have alerts turned on |
| 9 | `supabase/9-phone-alerts-triggers.template.sql` | Makes every notification (and a 9am summary) trigger a phone alert. Fill in the two placeholders, or use your private pre-filled `9-phone-alerts-triggers.local.sql` (git-ignored) |

Create the two logins in Authentication -> Users (tick *Auto Confirm User*) before step 2, and turn off **Allow new users to sign up**.

To go back to demo mode, empty the two `VITE_SUPABASE_*` values in `.env.local`.

## Mobile

Built to be used on a phone as an installed app (Add to Home Screen) and still full-featured on a computer.

- **Phone layout (below 1024px):** navy top bar with back button, search and alerts; bottom tab bar (Today, Leads, Follow-ups, Tasks, More) with a live follow-up count; a "+" button for quick add (lead, task, expense, invoice); a "More" sheet for everything else; full-screen search.
- **Forms are bottom sheets** on phones (drag handle, scroll inside, Cancel/Save pinned within thumb reach) and normal centred dialogs on larger screens.
- **Tables become cards** on phones (a headline plus labelled fields, with Edit/Delete buttons); real tables from tablet width up.
- **Touch comfort:** 44px minimum tap targets, 16px inputs (stops iPhones zooming when you tap a field), notch and home-bar safe areas, no sideways scrolling on any page.
- **How it was checked:** every page measured at 375px for overflow, small tap targets, input sizes and bare tables; the main flows (quick add, More sheet, forms, back, search, new task) driven through the UI; and the desktop layout re-checked afterwards.

## Phone alerts

Real notifications on the partners' phones (web push), from the home-screen icon. Works on Android, desktop, and iPhone (iOS 16.4+, only from a site added to the home screen).

**What sends one:** every row created in `notifications` (new lead added by your partner, task assigned to you, payment recorded, new client, overdue invoice / follow-up found while someone has the app open) plus a **9am Pakistan-time summary** each morning (follow-ups, tasks, overdue invoices, renewals; silent on empty days). The person who caused an event is never alerted about it. Alerts are short headlines only, never passwords, vault contents or personal spending.

**Pieces:** `public/sw.js` (receives alerts, only opens pages on this site), `public/manifest.webmanifest` + icons (makes it installable), `src/lib/push.ts` and Settings -> Notifications (turn on per device, send a test), `supabase/functions/phone-alerts/index.ts` (the sender; the private key lives only in its Supabase secrets).

**One-time setup**
1. Run `supabase/8-phone-alerts.sql`.
2. Supabase -> Database -> Extensions: enable `pg_net` and `pg_cron`.
3. Supabase -> Edge Functions -> Deploy a new function named exactly `phone-alerts`, paste `supabase/functions/phone-alerts/index.ts`, deploy, then in the function's settings switch OFF *Enforce JWT verification* (the function authenticates callers itself).
4. Edge Functions -> Secrets: add `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `WEBHOOK_SECRET` (values are in your private `phone-alerts-secrets.local.txt`); optionally `ALLOWED_ORIGIN` = your Netlify address and `TZ_NAME`.
5. Run your filled `supabase/9-phone-alerts-triggers.local.sql`.
6. Netlify: add the site variable `VITE_VAPID_PUBLIC_KEY` (public) and redeploy.
7. On each phone: remove any old home-screen icon, open the site, Add to Home Screen, open it **from the icon**, Settings -> Notifications -> *Turn on alerts*, then *Send me a test alert*.

**Generating new keys** (e.g. if the private key leaks): `npx web-push generate-vapid-keys`, update the secrets and `VITE_VAPID_PUBLIC_KEY`, redeploy, and have everyone turn alerts off and on again.

**Troubleshooting:** the function logs failed deliveries (host and reason only) under Edge Functions -> phone-alerts -> Logs. A device that has uninstalled the app or revoked permission is removed automatically.

## Security

What is enforced, and where:

- **Database (row-level security):** only users listed in `profiles` can read or write anything; anonymous visitors get nothing (also revoked at the privilege level). `created_by` / `updated_by` / `created_at` are set by the database and cannot be forged or rewritten; the activity log is append-only and can only record actions as yourself; profiles cannot be added or removed from the app.
- **Personal expenses:** both partners can read everything; only the owner can add, edit or delete their own entries (policy-enforced).
- **Vault:** secrets are encrypted in the browser with AES-256-GCM, key derived from a shared passphrase with PBKDF2-SHA256 at 600,000 rounds. The database only stores ciphertext; the passphrase is never stored or sent. The lock parameters cannot be changed from the app. It auto-locks after 10 minutes idle and on sign-out.
- **Two-step login:** TOTP authenticator app (Settings -> Security). With `7-require-two-step.sql` the database itself refuses sessions that skipped the code.
- **App:** automatic sign-out after 30 minutes idle; business data is wiped from memory on sign-out; uploads limited to 10 MB with web pages, scripts and executables blocked (also enforced on the storage bucket); links only open for http(s) addresses; exported CSV/Excel cells that start with `= + - @` are neutralised to stop spreadsheet formula injection.
- **Hosting:** `public/_headers` sets a strict Content-Security-Policy, HSTS, no framing, no referrer, locked-down browser permissions and `noindex` (works on Netlify; tested to break nothing).
- **Code hygiene:** `npm audit` reports 0 known vulnerabilities; no secrets in the repo (the only key in the browser is Supabase's public anon key, which row-level security constrains).

Supabase dashboard settings to check yourself (cannot be set from code): disable public sign-ups; require a strong minimum password length; enable leaked-password protection if your plan has it; keep the **service-role** and **secret** keys out of this project and out of chat.

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
