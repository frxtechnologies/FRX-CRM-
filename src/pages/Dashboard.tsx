import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { AlertTriangle, Settings2 } from 'lucide-react'
import { useTable, useVersion } from '../lib/db'
import { financeSummary, subEffectiveStatus, toBase, usePrefs, useList, partnerName } from '../lib/services'
import { CONTACTED_STATUSES } from '../lib/constants'
import { addDays, cn, fmtCompact, fmtDate, num, today, timeAgo } from '../lib/util'
import { Badge, Card, CardHeader, Empty, PageHeader, Select, Stat, statusTone } from '../components/ui'
import { useAuth } from '../lib/auth'

type Period = 'daily' | 'weekly' | 'monthly' | 'yearly'
const WIDGETS = [['sales', 'Revenue graph'], ['leads', 'Lead overview'], ['finance', 'Financial overview'], ['today', "Today's activities"], ['alerts', 'Business alerts'], ['activity', 'Recent activity']] as const

function bucketKey(d: string, p: Period) {
  if (p === 'daily') return d
  if (p === 'monthly') return d.slice(0, 7)
  if (p === 'yearly') return d.slice(0, 4)
  const dt = new Date(d + 'T00:00:00'); const day = (dt.getDay() + 6) % 7; dt.setDate(dt.getDate() - day)
  return dt.toISOString().slice(0, 10)
}

export default function Dashboard() {
  useVersion()
  const { user } = useAuth()
  const base = usePrefs().base_currency
  const leads = useTable('leads'), clients = useTable('clients'), projects = useTable('projects'), fus = useTable('follow_ups'), tasks = useTable('business_tasks')
  const income = useTable('income_transactions'), expenses = useTable('expense_transactions'), invoices = useTable('invoices'), subs = useTable('subscriptions'), logs = useTable('activity_logs'), profiles = useTable('profiles')
  const statuses = useList('lead_statuses')
  const t = today()
  const [period, setPeriod] = useState<Period>('monthly')
  const [range, setRange] = useState<'all' | '30' | '90' | 'year'>('all')
  const [who, setWho] = useState('')
  const [market, setMarket] = useState('')
  const [custom, setCustom] = useState(false)
  const storeKey = `frxos:widgets:${user?.id}`
  const [hidden, setHidden] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem(storeKey) || '[]') } catch { return [] } })
  const toggle = (k: string) => { const n = hidden.includes(k) ? hidden.filter((x) => x !== k) : [...hidden, k]; setHidden(n); try { localStorage.setItem(storeKey, JSON.stringify(n)) } catch { /* ignore */ } }
  const show = (k: string) => !hidden.includes(k)

  const from = range === 'all' ? undefined : range === 'year' ? `${t.slice(0, 4)}-01-01` : addDays(t, -Number(range))
  const L = useMemo(() => leads.filter((l) => (!who || l.assigned_to === who) && (!market || l.market === market) && (!from || l.created_at.slice(0, 10) >= from)), [leads, who, market, from])
  const fin = financeSummary({ from })
  const month = t.slice(0, 7)

  const series = useMemo(() => {
    const m = new Map<string, { k: string; Received: number; Expenses: number }>()
    const get = (k: string) => { if (!m.has(k)) m.set(k, { k, Received: 0, Expenses: 0 }); return m.get(k)! }
    income.forEach((i) => { get(bucketKey(i.date, period)).Received += toBase(num(i.amount), i.rate_to_base) })
    expenses.forEach((e) => { get(bucketKey(e.date, period)).Expenses += toBase(num(e.amount), e.rate_to_base) })
    const all = [...m.values()].sort((a, b) => a.k.localeCompare(b.k))
    return all.slice(period === 'daily' ? -30 : -12).map((x) => ({ ...x, Received: Math.round(x.Received), Expenses: Math.round(x.Expenses) }))
  }, [income, expenses, period])

  const leadCounts = ['New Lead', 'Not Contacted', 'Contacted', 'Interested', 'Follow-up Required', 'Negotiation', 'Won / Converted', 'Lost'].map((s) => ({ s, n: L.filter((l) => l.status === s).length }))
  const myFus = fus.filter((f) => f.status === 'pending' && (!who || f.assigned_to === who))
  const overdueFus = myFus.filter((f) => f.due_date < t), todayFus = myFus.filter((f) => f.due_date === t)
  const openTasks = tasks.filter((x) => !['Completed', 'Cancelled'].includes(x.status) && (!who || x.assigned_to === who))
  const overdueTasks = openTasks.filter((x) => x.due_date && x.due_date < t)
  const todayTasks = openTasks.filter((x) => x.due_date === t)
  const unpaid = invoices.filter((i) => ['Sent', 'Partially Paid', 'Overdue'].includes(i.status))
  const overdueInv = invoices.filter((i) => i.status === 'Overdue')
  const renewals = subs.filter((s) => { const st = subEffectiveStatus(s); const d = s.renewal_date || s.expiration_date; return st !== 'Cancelled' && st !== 'Paused' && d && d >= t && d <= addDays(t, 30) })
  const deadlines = [...projects.filter((p) => p.due_date === t && !['Completed', 'Cancelled'].includes(p.status)).map((p) => ({ label: `Project due: ${p.name}`, to: `/projects/${p.id}` })), ...invoices.filter((i) => i.due_date === t && num(i.balance) > 0 && !['Cancelled', 'Draft'].includes(i.status)).map((i) => ({ label: `Invoice due: ${i.number}`, to: `/invoices/${i.id}` }))]

  const alertCount = overdueFus.length + overdueInv.length + overdueTasks.length + renewals.length
  return (
    <>
      <PageHeader title={`Welcome back, ${user?.short_name}`} sub="Everything below is calculated from your recorded data."
        actions={<>
          <Select className="!w-auto" value={range} onChange={(v) => setRange(v as any)} options={[{ value: 'all', label: 'All time' }, { value: '30', label: 'Last 30 days' }, { value: '90', label: 'Last 90 days' }, { value: 'year', label: 'This year' }]} />
          <Select className="!w-auto" value={who} onChange={setWho} placeholder="Both partners" options={profiles.map((p) => ({ value: p.id, label: p.short_name }))} />
          <Select className="!w-auto" value={market} onChange={setMarket} placeholder="All markets" options={[{ value: 'local', label: 'Local' }, { value: 'international', label: 'International' }]} />
          <button onClick={() => setCustom(!custom)} className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50" title="Customize dashboard"><Settings2 size={16} /></button>
        </>} />
      {custom && <Card className="mb-4 flex flex-wrap gap-4 p-4 text-sm animate-in">{WIDGETS.map(([k, l]) => <label key={k} className="flex items-center gap-2"><input type="checkbox" className="accent-[#2563EB]" checked={show(k)} onChange={() => toggle(k)} />{l}</label>)}<span className="text-xs text-slate-400">Saved for you only. User/market filters apply to leads, follow-ups and tasks; finance is always shared.</span></Card>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Stat label="Total leads" value={L.length} />
        <Stat label="New this month" value={L.filter((l) => l.created_at.startsWith(month)).length} />
        <Stat label="Leads contacted" value={L.filter((l) => CONTACTED_STATUSES.includes(l.status)).length} />
        <Stat label="Follow-ups due" value={overdueFus.length + todayFus.length} tone={overdueFus.length ? 'red' : undefined} sub={overdueFus.length ? `${overdueFus.length} overdue` : 'today & overdue'} />
        <Stat label="Active clients" value={clients.filter((c) => !['Inactive', 'Completed Projects'].includes(c.category)).length} />
        <Stat label="Active projects" value={projects.filter((p) => !['Completed', 'Cancelled', 'On Hold'].includes(p.status)).length} />
        <Stat label="Total revenue" value={fmtCompact(fin.revenue, base)} sub={fin.basis === 'accrual' ? 'invoiced + direct income' : 'cash received'} />
        <Stat label="Total expenses" value={fmtCompact(fin.expenses, base)} />
        <Stat label="Net profit" value={fmtCompact(fin.netProfit, base)} tone={fin.netProfit >= 0 ? 'green' : 'red'} />
        <Stat label="Outstanding payments" value={fmtCompact(fin.receivables, base)} tone={fin.receivables > 0 ? 'blue' : undefined} sub="unpaid invoice balances" />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        {show('sales') && (
          <Card className="lg:col-span-2">
            <CardHeader title="Cash received vs expenses" sub={`In ${base}, converted at each transaction's saved rate`} action={
              <div className="flex rounded-lg border border-slate-200 p-0.5">{(['daily', 'weekly', 'monthly', 'yearly'] as Period[]).map((p) => <button key={p} onClick={() => setPeriod(p)} className={cn('rounded-md px-2.5 py-1 text-xs font-medium capitalize', period === p ? 'bg-[#0B1F3A] text-white' : 'text-slate-500')}>{p}</button>)}</div>} />
            <div className="h-72 p-4">
              {series.length === 0 ? <Empty title="No transactions yet" hint="Record income or expenses to see the trend." /> : (
                <ResponsiveContainer>
                  <AreaChart data={series}>
                    <defs><linearGradient id="g1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2563EB" stopOpacity={0.3} /><stop offset="100%" stopColor="#2563EB" stopOpacity={0} /></linearGradient></defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                    <XAxis dataKey="k" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} width={56} tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : v)} />
                    <Tooltip formatter={(v: any) => fmtCompact(Number(v), base)} />
                    <Area type="monotone" dataKey="Received" stroke="#2563EB" strokeWidth={2} fill="url(#g1)" />
                    <Area type="monotone" dataKey="Expenses" stroke="#f59e0b" strokeWidth={2} fill="none" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </Card>
        )}
        {show('finance') && (
          <Card>
            <CardHeader title="Financial overview" sub={`Reporting currency: ${base}`} />
            <dl className="divide-y divide-slate-50 px-5 py-1 text-sm">
              {([['Total income (cash received)', fin.cashReceived], ['Total expenses', fin.expenses], ['Net profit', fin.netProfit], ['Business investment', fin.investments], ['Outstanding client payments', fin.receivables]] as [string, number][]).map(([k, v]) => (
                <div key={k} className="flex justify-between py-2.5"><dt className="text-slate-500">{k}</dt><dd className={cn('font-semibold tabular-nums', k === 'Net profit' && (v >= 0 ? 'text-emerald-600' : 'text-red-600'))}>{fmtCompact(v, base)}</dd></div>
              ))}
            </dl>
            <p className="px-5 pb-4 text-[11px] text-slate-400">Founder investment is never counted as revenue. <Link to="/finance/pnl" className="text-[#2563EB]">Full P&amp;L →</Link></p>
          </Card>
        )}
        {show('leads') && (
          <Card>
            <CardHeader title="Lead overview" action={<Link to="/leads/international" className="text-xs text-[#2563EB]">Open</Link>} />
            <div className="h-56 p-3">
              <ResponsiveContainer><BarChart data={leadCounts} layout="vertical" margin={{ left: 20 }}><XAxis type="number" hide allowDecimals={false} /><YAxis type="category" dataKey="s" tick={{ fontSize: 11, fill: '#64748b' }} width={110} tickLine={false} axisLine={false} /><Tooltip /><Bar dataKey="n" fill="#2563EB" radius={4} /></BarChart></ResponsiveContainer>
            </div>
            <div className="px-5 pb-4 text-[11px] text-slate-400">{statuses.length - leadCounts.length} more statuses on the leads pages.</div>
          </Card>
        )}
        {show('today') && (
          <Card>
            <CardHeader title="Today's activities" />
            <ul className="max-h-64 divide-y divide-slate-50 overflow-y-auto text-sm">
              {todayFus.map((f) => <li key={f.id}><Link className="flex justify-between px-5 py-2.5 max-lg:min-h-11 max-lg:items-center hover:bg-slate-50" to={`/leads/${f.lead_id}`}><span>Follow-up: {leads.find((l) => l.id === f.lead_id)?.business_name}</span><Badge tone="blue">{partnerName(f.assigned_to)}</Badge></Link></li>)}
              {todayTasks.map((x) => <li key={x.id}><Link className="flex justify-between px-5 py-2.5 max-lg:min-h-11 max-lg:items-center hover:bg-slate-50" to="/tasks"><span>{x.category === 'Cold Calling' ? 'Call task' : 'Task'}: {x.title}</span><Badge>{partnerName(x.assigned_to)}</Badge></Link></li>)}
              {deadlines.map((d, i) => <li key={i}><Link className="block px-5 py-2.5 max-lg:min-h-11 max-lg:items-center hover:bg-slate-50" to={d.to}>{d.label}</Link></li>)}
              {todayFus.length + todayTasks.length + deadlines.length === 0 && <li className="p-6 text-center text-slate-500">Nothing scheduled for today.</li>}
            </ul>
          </Card>
        )}
        {show('alerts') && (
          <Card className={alertCount ? 'border-amber-200' : ''}>
            <CardHeader title="Business alerts" action={alertCount ? <AlertTriangle size={16} className="text-amber-500" /> : undefined} />
            <ul className="max-h-64 divide-y divide-slate-50 overflow-y-auto text-sm">
              {overdueFus.map((f) => <li key={f.id}><Link to={`/leads/${f.lead_id}`} className="flex justify-between px-5 py-2.5 max-lg:min-h-11 max-lg:items-center hover:bg-slate-50"><span>Overdue follow-up: {leads.find((l) => l.id === f.lead_id)?.business_name}</span><span className="text-xs text-red-600">{fmtDate(f.due_date)}</span></Link></li>)}
              {overdueInv.map((i) => <li key={i.id}><Link to={`/invoices/${i.id}`} className="flex justify-between px-5 py-2.5 max-lg:min-h-11 max-lg:items-center hover:bg-slate-50"><span>Overdue invoice {i.number}</span><span className="text-xs text-red-600">{fmtCompact(num(i.balance), i.currency)}</span></Link></li>)}
              {unpaid.filter((i) => i.status !== 'Overdue').slice(0, 5).map((i) => <li key={i.id}><Link to={`/invoices/${i.id}`} className="flex justify-between px-5 py-2.5 max-lg:min-h-11 max-lg:items-center hover:bg-slate-50"><span>Unpaid: {i.number}</span><span className="text-xs text-slate-500">due {fmtDate(i.due_date)}</span></Link></li>)}
              {overdueTasks.map((x) => <li key={x.id}><Link to="/tasks" className="flex justify-between px-5 py-2.5 max-lg:min-h-11 max-lg:items-center hover:bg-slate-50"><span>Overdue task: {x.title}</span><span className="text-xs text-red-600">{fmtDate(x.due_date)}</span></Link></li>)}
              {renewals.map((s) => <li key={s.id}><Link to="/subscriptions" className="flex justify-between px-5 py-2.5 max-lg:min-h-11 max-lg:items-center hover:bg-slate-50"><span>{s.name} {s.recurring ? 'renews' : 'expires'}</span><span className="text-xs text-amber-600">{fmtDate(s.renewal_date || s.expiration_date)}</span></Link></li>)}
              {alertCount + unpaid.length === 0 && <li className="p-6 text-center text-slate-500">No alerts — all clear.</li>}
            </ul>
          </Card>
        )}
        {show('activity') && (
          <Card className="lg:col-span-3">
            <CardHeader title="Recent activity" action={<Link to="/activity" className="text-xs text-[#2563EB]">View all</Link>} />
            <ul className="divide-y divide-slate-50 text-sm">
              {logs.slice().sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 8).map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-4 px-5 py-2.5"><span><b>{partnerName(a.user_id)}</b> {a.summary}</span><span className="shrink-0 text-xs text-slate-400">{timeAgo(a.created_at)}</span></li>
              ))}
              {logs.length === 0 && <li className="p-6 text-center text-slate-500">No activity yet.</li>}
            </ul>
          </Card>
        )}
      </div>
    </>
  )
}
