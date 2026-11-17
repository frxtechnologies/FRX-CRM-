import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { IS_DEMO, supabase, snapshot, TABLES, useTable } from '../lib/db'
import { saveSetting, useCompany, useInvoiceSettings, useList, usePrefs, useSetting, update, create, currentRate } from '../lib/services'
import { rawUpdate, rawInsert } from '../lib/db'
import { CURRENCIES, DEFAULT_RATES, DEFAULT_TERMS, EXPENSE_CATEGORIES, INDUSTRIES_INTL, INDUSTRIES_LOCAL, LEAD_STATUSES, SUB_CATEGORIES } from '../lib/constants'
import { downloadBlob, num, today } from '../lib/util'
import { hasSampleData, loadSampleData, removeSampleData } from '../lib/sample'
import { Badge, Button, Card, CardHeader, Field, inputCls, PageHeader, Select, Tabs, useToast, Avatar } from '../components/ui'
import { useAuth } from '../lib/auth'
import { disablePush, enablePush, isIOS, myDeviceCount, pushState, sendTestAlert, type PushState } from '../lib/push'

function ListEditor({ id, label, defaults, note }: { id: string; label: string; defaults: string[]; note?: string }) {
  const stored = useList(id as any)
  const [items, setItems] = useState<string[]>(stored.length ? stored : defaults)
  const [v, setV] = useState('')
  const toast = useToast()
  useEffect(() => setItems(stored.length ? stored : defaults), [stored.join('|')])
  const persist = async (next: string[]) => { setItems(next); await saveSetting(id, { list: next }); toast(`${label} saved`) }
  return (
    <Card>
      <CardHeader title={label} sub={note} action={<Button size="sm" variant="secondary" onClick={() => persist(defaults)}>Reset</Button>} />
      <div className="p-5">
        <div className="mb-3 flex gap-2"><input className={inputCls} value={v} onChange={(e) => setV(e.target.value)} placeholder="Add item…" onKeyDown={(e) => { if (e.key === 'Enter' && v.trim() && !items.includes(v.trim())) { persist([...items, v.trim()]); setV('') } }} />
          <Button onClick={() => { if (v.trim() && !items.includes(v.trim())) { persist([...items, v.trim()]); setV('') } }}><Plus size={14} /></Button></div>
        <div className="flex flex-wrap gap-2">{items.map((s) => <span key={s} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 py-1 pl-3 pr-2 text-xs">{s}<button className="text-slate-400 hover:text-red-500" onClick={() => persist(items.filter((x) => x !== s))}><Trash2 size={11} /></button></span>)}</div>
      </div>
    </Card>
  )
}

function TwoStep() {
  const toast = useToast()
  const [factor, setFactor] = useState<{ id: string; status: string } | null>(null)
  const [enroll, setEnroll] = useState<{ id: string; qr: string; secret: string } | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const load = async () => {
    const { data } = await supabase!.auth.mfa.listFactors()
    setFactor(data?.totp?.find((f) => f.status === 'verified') || null)
  }
  useEffect(() => { load() }, [])
  async function start() {
    setBusy(true)
    // clear any half-finished enrolment from an earlier attempt first
    const { data: l } = await supabase!.auth.mfa.listFactors()
    for (const f of (l?.all || []).filter((x) => x.status !== 'verified')) await supabase!.auth.mfa.unenroll({ factorId: f.id })
    const { data, error } = await supabase!.auth.mfa.enroll({ factorType: 'totp', friendlyName: `FRX OS ${new Date().toISOString().slice(0, 10)}` })
    setBusy(false)
    if (error || !data) return toast(error?.message || 'Could not start setup. Is two-step (TOTP) enabled in your Supabase project?', 'err')
    setEnroll({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret })
  }
  async function confirm() {
    if (!enroll) return
    setBusy(true)
    const { data: ch, error: e1 } = await supabase!.auth.mfa.challenge({ factorId: enroll.id })
    if (e1) { setBusy(false); return toast(e1.message, 'err') }
    const { error: e2 } = await supabase!.auth.mfa.verify({ factorId: enroll.id, challengeId: ch.id, code: code.trim() })
    setBusy(false)
    if (e2) return toast('That code is not right. Check the app and try the next code.', 'err')
    setEnroll(null); setCode(''); await load(); toast('Two-step verification is ON')
  }
  async function disable() {
    if (!factor || !window.confirm('Turn off two-step verification for your account? Your account becomes easier to break into.')) return
    const { error } = await supabase!.auth.mfa.unenroll({ factorId: factor.id })
    if (error) return toast(error.message, 'err')
    setFactor(null); toast('Two-step verification is OFF')
  }
  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <div className="flex items-center justify-between gap-3">
        <div><div className="font-semibold text-[#0B1F3A]">Two-step verification</div><div className="text-xs text-slate-500">A 6-digit code from an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password, Authy) on top of your password.</div></div>
        {factor ? <Badge tone="green">ON</Badge> : <Badge tone="red">OFF</Badge>}
      </div>
      {!factor && !enroll && <Button className="mt-3" loading={busy} onClick={start}>Turn on two-step verification</Button>}
      {factor && <Button className="mt-3" variant="danger" onClick={disable}>Turn off</Button>}
      {enroll && (
        <div className="mt-4 grid gap-4 sm:grid-cols-[auto_1fr]">
          <img src={enroll.qr} alt="QR code to scan with your authenticator app" className="h-44 w-44 rounded-lg border border-slate-200 bg-white p-2" />
          <div className="space-y-3 text-sm">
            <p><b>1.</b> Scan the QR code with your authenticator app.<br /><span className="text-xs text-slate-500">Can't scan? Type this key in instead:</span> <code className="break-all rounded bg-slate-100 px-1.5 py-0.5 text-xs">{enroll.secret}</code></p>
            <p><b>2.</b> Enter the 6-digit code it shows:</p>
            <div className="flex gap-2"><input inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="123456" className={`${inputCls} !w-40 text-center tracking-[0.3em]`} /><Button loading={busy} disabled={code.length !== 6} onClick={confirm}>Confirm</Button></div>
            <p className="text-xs text-amber-800">Save the key somewhere safe (the Vault is a good place). If you lose your phone and the key, an admin has to reset your account.</p>
          </div>
        </div>
      )}
    </div>
  )
}

function PhoneAlerts() {
  const toast = useToast()
  const { user } = useAuth()
  const [state, setState] = useState<PushState | 'loading'>('loading')
  const [devices, setDevices] = useState(0)
  const [busy, setBusy] = useState(false)
  const refresh = async () => { setState(await pushState()); myDeviceCount().then(setDevices).catch(() => setDevices(0)) }
  useEffect(() => { refresh() }, [])
  const run = async (fn: () => Promise<void>, ok?: string) => { setBusy(true); try { await fn(); if (ok) toast(ok) } catch (e: any) { toast(e.message || 'Something went wrong', 'err') } finally { setBusy(false); refresh() } }
  const msg: Record<string, string> = {
    unsupported: 'This browser cannot receive phone alerts. Use Chrome or Edge on Android or desktop, or Safari on iPhone with the site added to your home screen.',
    'needs-install': 'On iPhone, alerts only work from the home-screen icon. Tap Share → Add to Home Screen, then open FRX OS from that icon (not from Safari) and come back here.',
    'not-configured': 'Phone alerts are not switched on for this site yet (the alert key is missing from the site settings).',
    blocked: 'Notifications are blocked for this site. Allow them in your phone settings (iPhone: Settings → Notifications → FRX OS; Android: long-press the icon → Site settings), then reload.',
  }
  return (
    <Card className="mb-5">
      <CardHeader title="Phone alerts" sub="Get a real notification on your phone for new leads, tasks assigned to you, payments, overdue items and a morning summary." action={state === 'on' ? <Badge tone="green">ON for this device</Badge> : <Badge tone="slate">OFF</Badge>} />
      <div className="space-y-3 p-5 text-sm">
        {state === 'loading' && <p className="text-slate-500">Checking this device…</p>}
        {msg[state] && <p className="rounded-lg bg-amber-50 p-3 text-amber-900">{msg[state]}</p>}
        {state === 'off' && <div><Button loading={busy} onClick={() => run(() => enablePush(user!.id), 'Alerts are ON for this device')}>Turn on alerts on this device</Button><p className="mt-2 text-xs text-slate-500">Your phone will ask for permission. Do this once on each phone or computer you want alerts on.</p></div>}
        {state === 'on' && (
          <div className="flex flex-wrap gap-2">
            <Button loading={busy} onClick={() => run(async () => { const r = await sendTestAlert(); if (!r.sent) throw new Error('The test ran but nothing was delivered. Check the function secrets, or turn alerts off and on again on this device.'); toast(`Test sent to ${r.sent} device${r.sent === 1 ? '' : 's'} — check your phone`) })}>Send me a test alert</Button>
            <Button variant="secondary" loading={busy} onClick={() => run(disablePush, 'Alerts turned off for this device')}>Turn off on this device</Button>
          </div>
        )}
        <p className="text-xs text-slate-500">Devices receiving your alerts: <b>{devices}</b>. Alerts show only short headlines. They never contain passwords, vault contents or personal spending.{isIOS() ? '' : ''}</p>
      </div>
    </Card>
  )
}

export default function SettingsPage() {
  const toast = useToast()
  const { user } = useAuth()
  const profiles = useTable('profiles'), ratesRows = useTable('exchange_rates')
  const company = useCompany(), inv = useInvoiceSettings(), prefs = usePrefs()
  const notifPrefs = useSetting('notif_prefs', { 'follow-up': true, invoice: true, subscription: true, task: true, announcement: true, client: true })
  const [tab, setTab] = useState('company')
  const [co, setCo] = useState(company), [iv, setIv] = useState(inv), [pf, setPf] = useState(prefs)
  const [rates, setRates] = useState<Record<string, string>>({})
  const [pw, setPw] = useState('')
  useEffect(() => setCo(company), [JSON.stringify(company)])
  useEffect(() => setIv(inv), [JSON.stringify(inv)])
  useEffect(() => setPf(prefs), [JSON.stringify(prefs)])
  useEffect(() => setRates(Object.fromEntries(CURRENCIES.map((c) => [c, String(num(ratesRows.find((r) => r.id === c)?.rate_to_base) || DEFAULT_RATES[c])]))), [ratesRows.length])
  const [sample, setSample] = useState(hasSampleData())
  const [busy, setBusy] = useState(false)
  void update; void create; void currentRate

  const saveRates = async () => {
    for (const c of CURRENCIES) {
      const val = num(rates[c]); if (val <= 0) return toast(`Rate for ${c} must be positive`, 'err')
      const ex = snapshot('exchange_rates').find((r) => r.id === c)
      if (ex) await rawUpdate('exchange_rates', c, { rate_to_base: val, base: 'PKR' }, user?.id); else await rawInsert('exchange_rates', { id: c, rate_to_base: val, base: 'PKR' }, user?.id)
    }
    toast('Rates saved. They apply to NEW transactions; existing ones keep the rate saved with them.')
  }
  const field = (k: string, l: string, src: any, set: (v: any) => void, type = 'text') => <Field label={l}><input type={type} className={inputCls} value={src[k] ?? ''} onChange={(e) => set({ ...src, [k]: type === 'number' ? e.target.value : e.target.value })} /></Field>

  return (
    <>
      <PageHeader title="Settings" sub="Company, currency, invoices, categories and security" />
      <div className="mb-5"><Tabs value={tab} onChange={setTab} tabs={[{ id: 'company', label: 'Company' }, { id: 'partners', label: 'Partners' }, { id: 'currency', label: 'Currency' }, { id: 'invoice', label: 'Invoices & Terms' }, { id: 'leads', label: 'Lead statuses' }, { id: 'categories', label: 'Categories' }, { id: 'notifications', label: 'Notifications' }, { id: 'data', label: 'Data & export' }, { id: 'security', label: 'Security' }]} /></div>

      {tab === 'company' && <Card><CardHeader title="Company information" sub="Shown on invoices and PDFs" /><div className="grid gap-3 p-5 sm:grid-cols-2">
        {field('name', 'Company name', co, setCo)}{field('website', 'Website', co, setCo)}{field('email', 'Email', co, setCo)}{field('phone', 'Phone / WhatsApp', co, setCo)}{field('ceo', 'Founder & CEO', co, setCo)}{field('director', 'Co-founder & Director', co, setCo)}
        <div className="sm:col-span-2"><Button onClick={async () => { await saveSetting('company', co); toast('Company information saved') }}>Save</Button></div></div></Card>}

      {tab === 'partners' && <Card><CardHeader title="Partner accounts" sub="Both partners share one workspace" /><ul className="divide-y divide-slate-50">{profiles.map((p) => <li key={p.id} className="flex items-center gap-3 px-5 py-3.5"><Avatar name={p.short_name} color={p.avatar_color} size={36} /><div className="flex-1"><div className="text-sm font-medium">{p.full_name} {p.id === user?.id && <Badge tone="blue">you</Badge>}</div><div className="text-xs text-slate-500">{p.role_title} • {p.email}</div></div></li>)}</ul>
        <p className="border-t border-slate-100 p-5 text-xs text-slate-500">{IS_DEMO ? 'Demo mode: partners are local sample accounts. In production, accounts are Supabase Auth users listed in the profiles table.' : 'Partner accounts are managed in Supabase Authentication; add a matching row to the profiles table to grant workspace access.'}</p></Card>}

      {tab === 'currency' && <div className="grid gap-5 lg:grid-cols-2"><Card><CardHeader title="Reporting currency" /><div className="grid gap-3 p-5">
        <Field label="Base (reporting) currency"><Select value={pf.base_currency} onChange={(v) => setPf({ ...pf, base_currency: v })} options={[...CURRENCIES]} /></Field>
        <Field label="Revenue recognition"><Select value={pf.revenue_basis} onChange={(v) => setPf({ ...pf, revenue_basis: v as any })} options={[{ value: 'accrual', label: 'Accrual — revenue = invoiced (sent) + direct income' }, { value: 'cash', label: 'Cash — revenue = money actually received' }]} /></Field>
        <div><Button onClick={async () => { await saveSetting('prefs', pf); toast('Currency settings saved') }}>Save</Button></div>
        <p className="text-xs text-slate-500">Founder investments are never counted as revenue under either setting. Unpaid invoices are never counted as cash received.</p></div></Card>
        <Card><CardHeader title="Exchange rates" sub="Value of 1 unit in PKR. Starting values are placeholders — enter your own rates." /><div className="grid gap-3 p-5 sm:grid-cols-2">
          {CURRENCIES.map((c) => <Field key={c} label={`1 ${c} = PKR`}><input type="number" step="any" disabled={c === 'PKR'} className={inputCls} value={rates[c] ?? ''} onChange={(e) => setRates({ ...rates, [c]: e.target.value })} /></Field>)}
          <div className="sm:col-span-2"><Button onClick={saveRates}>Save rates</Button><p className="mt-2 text-xs text-slate-500">Each transaction stores the rate used when it was recorded, so changing rates later never rewrites history.</p></div></div></Card></div>}

      {tab === 'invoice' && <div className="space-y-5"><Card><CardHeader title="Invoice settings" /><div className="grid gap-3 p-5 sm:grid-cols-3">
        {field('prefix', 'Number prefix', iv, setIv)}{field('next_number', 'Next number', iv, setIv, 'number')}{field('digits', 'Digits', iv, setIv, 'number')}
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-[#2563EB]" checked={!!iv.year_in_number} onChange={(e) => setIv({ ...iv, year_in_number: e.target.checked })} />Include year</label>
        {field('payment_terms_days', 'Default net days', iv, setIv, 'number')}{field('tax_rate', 'Default tax %', iv, setIv, 'number')}
        <Field label="Default payment instructions" ><textarea rows={4} className={inputCls} value={iv.payment_instructions} onChange={(e) => setIv({ ...iv, payment_instructions: e.target.value })} /></Field>
        <Field label="PDF footer message" ><textarea rows={4} className={inputCls} value={iv.footer} onChange={(e) => setIv({ ...iv, footer: e.target.value })} /></Field>
        <div className="flex items-end"><p className="text-xs text-slate-500">Preview: <b>{iv.prefix}{iv.year_in_number ? new Date().getFullYear() + '-' : ''}{String(num(iv.next_number)).padStart(num(iv.digits) || 4, '0')}</b></p></div></div></Card>
        <Card><CardHeader title="Default Terms & Conditions" sub="Appear on every new invoice. Individual invoices can override them without changing these." action={<Button size="sm" variant="secondary" onClick={() => setIv({ ...iv, terms: DEFAULT_TERMS })}>Restore FRX template</Button>} />
          <p className="mx-5 mt-4 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">This is an editable business template, not jurisdiction-specific legal advice. Have it reviewed for the countries you operate in.</p>
          <div className="space-y-4 p-5">{(iv.terms || []).map((t: any, i: number) => <div key={i}><input className={`${inputCls} mb-1.5 font-medium`} value={t.title} onChange={(e) => setIv({ ...iv, terms: iv.terms.map((x: any, j: number) => (j === i ? { ...x, title: e.target.value } : x)) })} /><textarea rows={3} className={inputCls} value={t.body} onChange={(e) => setIv({ ...iv, terms: iv.terms.map((x: any, j: number) => (j === i ? { ...x, body: e.target.value } : x)) })} /></div>)}
            <div className="flex gap-2"><Button variant="secondary" onClick={() => setIv({ ...iv, terms: [...(iv.terms || []), { title: 'New section', body: '' }] })}><Plus size={14} /> Add section</Button><Button onClick={async () => { await saveSetting('invoice', { ...iv, next_number: num(iv.next_number), digits: num(iv.digits), payment_terms_days: num(iv.payment_terms_days), tax_rate: num(iv.tax_rate) }); toast('Invoice settings saved') }}>Save all</Button></div></div></Card></div>}

      {tab === 'leads' && <ListEditor id="lead_statuses" label="Lead statuses" defaults={LEAD_STATUSES} note="Keep 'Won / Converted' — it triggers client conversion. Renaming a status does not rename existing leads." />}
      {tab === 'categories' && <div className="space-y-5"><ListEditor id="expense_categories" label="Expense categories" defaults={EXPENSE_CATEGORIES} /><ListEditor id="subscription_categories" label="Subscription categories" defaults={SUB_CATEGORIES} />
        <Card className="p-5 text-xs text-slate-500">Lead industries per market: Local — {INDUSTRIES_LOCAL.join(', ')}. International — {INDUSTRIES_INTL.join(', ')}.</Card></div>}

      {tab === 'notifications' && <div>{!IS_DEMO && <PhoneAlerts />}<Card><CardHeader title="Notification preferences" sub="In-app notifications for both partners. FRX OS never sends email or WhatsApp on its own." /><div className="space-y-2 p-5">
        {([['follow-up', 'Follow-ups due or overdue'], ['task', 'Tasks assigned & overdue'], ['invoice', 'Invoice payments & overdue invoices'], ['subscription', 'Subscription renewals & expiry (30 / 7 / 3 days, on the day)'], ['lead', 'New leads added by your partner'], ['client', 'New clients'], ['announcement', 'Announcements']] as [string, string][]).map(([k, l]) => <label key={k} className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-[#2563EB]" checked={(notifPrefs as any)[k] !== false} onChange={async (e) => { await saveSetting('notif_prefs', { ...notifPrefs, [k]: e.target.checked }); toast('Saved') }} />{l}</label>)}</div></Card></div>}

      {tab === 'data' && <div className="grid gap-5 lg:grid-cols-2"><Card><CardHeader title="Data export" sub="Full backup of every table as JSON" /><div className="p-5"><Button onClick={() => { const dump: Record<string, any> = {}; TABLES.forEach((t) => (dump[t] = snapshot(t))); downloadBlob(`frx-business-os-backup-${today()}.json`, JSON.stringify(dump, null, 2), 'application/json'); toast('Backup downloaded') }}>Download JSON backup</Button><p className="mt-2 text-xs text-slate-500">Per-module CSV / PDF / Excel exports are under Reports.</p></div></Card>
        {IS_DEMO && <Card><CardHeader title="Sample data" sub="Clearly labelled “[Sample]” records so you can try the system" /><div className="p-5"><div className="flex gap-2"><Button loading={busy} disabled={sample} onClick={async () => { setBusy(true); try { await loadSampleData(); setSample(true); toast('Sample data loaded') } catch (e: any) { toast(e.message, 'err') } finally { setBusy(false) } }}>Load sample data</Button>
          <Button variant="danger" loading={busy} disabled={!sample} onClick={async () => { setBusy(true); try { await removeSampleData(); setSample(false); toast('Sample data removed') } finally { setBusy(false) } }}>Remove sample data</Button></div>
          <p className="mt-2 text-xs text-slate-500">Everything created by this button starts with "[Sample]" or "SAMPLE-". Your own records are never touched by removal.</p></div></Card>}</div>}

      {tab === 'security' && <Card><CardHeader title="Security" /><div className="space-y-4 p-5 text-sm text-slate-600">
        <ul className="list-disc space-y-1.5 pl-5"><li>Authentication: individual accounts via Supabase Auth (passwords are hashed by Supabase — never stored by this app).</li><li>Database: Row Level Security allows only users listed in <code>profiles</code> to read or write any table; the activity log is append-only.</li><li>No service-role key is used in this front-end; only the public anon key, which RLS constrains.</li><li>Disable public sign-ups in Supabase Authentication settings so nobody else can register.</li></ul>
        {!IS_DEMO && <TwoStep />}
        {IS_DEMO ? <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">Demo mode has no passwords or database security — it is for evaluation only.</p> : (
          <div className="max-w-sm"><Field label="Change my password"><input type="password" className={inputCls} value={pw} onChange={(e) => setPw(e.target.value)} placeholder="New password (min 8 chars)" /></Field>
            <Button className="mt-2" disabled={pw.length < 8} onClick={async () => { const { error } = await supabase!.auth.updateUser({ password: pw }); if (error) toast(error.message, 'err'); else { toast('Password updated'); setPw('') } }}>Update password</Button></div>)}</div></Card>}
    </>
  )
}
