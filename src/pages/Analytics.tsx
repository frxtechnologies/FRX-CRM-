import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useTable, type Row } from '../lib/db'
import { toBase, usePrefs } from '../lib/services'
import { LOST_STATUSES, WON } from '../lib/constants'
import { addDays, fmtCompact, monthKey, num, today } from '../lib/util'
import { Card, CardHeader, Empty, PageHeader, Select, Stat } from '../components/ui'

const CALLS = ['Called', 'Call Answered', 'Call Not Answered']
const REPLIES = ['Email Replied', 'WhatsApp Replied']

export default function Analytics() {
  const leads = useTable('leads'), acts = useTable('lead_activities'), logs = useTable('activity_logs'), clients = useTable('clients'), income = useTable('income_transactions'), invoices = useTable('invoices'), profiles = useTable('profiles')
  const base = usePrefs().base_currency
  const [range, setRange] = useState('all')
  const from = range === 'all' ? '' : addDays(today(), -Number(range))

  const m = useMemo(() => {
    const inR = (iso: string) => !from || iso.slice(0, 10) >= from
    const statusLogLeads = (status: string) => new Set(logs.filter((l) => l.entity === 'leads' && l.summary.includes(`lead status to ${status}`) && inR(l.created_at)).map((l) => l.entity_id))
    const meetingLeads = statusLogLeads('Meeting Scheduled'), proposalLeads = statusLogLeads('Proposal Sent')
    const revenueOf = (leadId: string) => { const c = clients.find((x) => x.lead_id === leadId); return c ? income.filter((i) => i.client_id === c.id && inR(i.date)).reduce((s, i) => s + toBase(num(i.amount), i.rate_to_base), 0) : 0 }
    const invoicedOf = (leadId: string) => { const c = clients.find((x) => x.lead_id === leadId); return c ? invoices.filter((i) => i.client_id === c.id && !['Draft', 'Cancelled'].includes(i.status)).reduce((s, i) => s + toBase(num(i.total), i.rate_to_base), 0) : 0 }

    // `L` = leads in scope; `A` = recorded activities in scope; `added` = leads added override (for partner rows)
    const calc = (L: Row[], A: Row[], added = L.filter((l) => inR(l.created_at)).length) => {
      const ids = new Set(L.map((l) => l.id))
      const cnt = (types: string[]) => A.filter((a) => types.includes(a.type) && inR(a.occurred_at)).length
      const meetings = new Set<string>([...L.filter((l) => l.status === 'Meeting Scheduled' || meetingLeads.has(l.id)).map((l) => l.id), ...A.filter((a) => a.type === 'Meeting Completed' && inR(a.occurred_at)).map((a) => a.lead_id)].filter((x) => ids.has(x)))
      const proposals = new Set<string>([...L.filter((l) => l.status === 'Proposal Sent' || proposalLeads.has(l.id)).map((l) => l.id), ...A.filter((a) => a.type === 'Proposal Sent' && inR(a.occurred_at)).map((a) => a.lead_id)].filter((x) => ids.has(x)))
      const won = L.filter((l) => l.status === WON), lost = L.filter((l) => l.status === 'Lost')
      const contacted = L.filter((l) => l.last_contact || !['New Lead', 'Not Contacted', 'Ready to Contact'].includes(l.status)).length
      const revenue = L.reduce((s, l) => s + revenueOf(l.id), 0)
      const invoiced = won.reduce((s, l) => s + invoicedOf(l.id), 0)
      const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '—')
      return {
        added, calls: cnt(CALLS), answered: cnt(['Call Answered']), emails: cnt(['Email Sent']), replies: cnt(REPLIES), whatsapp: cnt(['WhatsApp Message Sent']),
        meetings: meetings.size, proposals: proposals.size, won: won.length, lost: lost.length, revenue,
        conv: pct(won.length, L.length), c2m: pct(meetings.size, contacted), p2c: pct(L.filter((l) => l.status === WON && proposals.has(l.id)).length, proposals.size),
        avgDeal: won.length && invoiced ? invoiced / won.length : 0,
      }
    }
    const rows: { group: string; label: string; v: ReturnType<typeof calc> }[] = []
    for (const p of profiles) rows.push({ group: 'Partner', label: p.short_name, v: calc(leads.filter((l) => l.assigned_to === p.id), acts.filter((a) => a.user_id === p.id), leads.filter((l) => l.created_by === p.id && inR(l.created_at)).length) })
    for (const mk of ['local', 'international']) rows.push({ group: 'Market', label: mk === 'local' ? 'Local (Pakistan)' : 'International', v: calc(leads.filter((l) => l.market === mk), acts.filter((a) => leads.some((l) => l.id === a.lead_id && l.market === mk))) })
    for (const s of [...new Set(leads.map((l) => l.source).filter(Boolean))]) rows.push({ group: 'Source', label: s, v: calc(leads.filter((l) => l.source === s), acts.filter((a) => leads.some((l) => l.id === a.lead_id && l.source === s))) })
    for (const s of [...new Set(leads.map((l) => l.industry).filter(Boolean))]) rows.push({ group: 'Industry', label: s, v: calc(leads.filter((l) => l.industry === s), acts.filter((a) => leads.some((l) => l.id === a.lead_id && l.industry === s))) })
    const total = calc(leads, acts)
    // monthly won deals + revenue
    const mm = new Map<string, { k: string; Won: number; Revenue: number }>()
    const g = (k: string) => (mm.has(k) ? mm.get(k)! : (mm.set(k, { k, Won: 0, Revenue: 0 }), mm.get(k)!))
    leads.filter((l) => l.status === WON).forEach((l) => { const dt = (l.updated_at || l.created_at).slice(0, 7); g(dt).Won++ })
    income.forEach((i) => { g(monthKey(i.date)).Revenue += Math.round(toBase(num(i.amount), i.rate_to_base)) })
    return { rows, total, monthly: [...mm.values()].sort((a, b) => a.k.localeCompare(b.k)).slice(-12) }
  }, [leads, acts, logs, clients, income, invoices, profiles, from])

  const cols: [string, (v: any) => any][] = [['Leads added', (v) => v.added], ['Calls', (v) => v.calls], ['Answered', (v) => v.answered], ['Emails', (v) => v.emails], ['Replies', (v) => v.replies], ['WhatsApp', (v) => v.whatsapp], ['Meetings', (v) => v.meetings], ['Proposals', (v) => v.proposals], ['Won', (v) => v.won], ['Lost', (v) => v.lost], ['Revenue', (v) => fmtCompact(v.revenue, base)], ['Conv.', (v) => v.conv], ['Contact→Mtg', (v) => v.c2m], ['Proposal→Client', (v) => v.p2c], ['Avg deal', (v) => (v.avgDeal ? fmtCompact(v.avgDeal, base) : '—')]]
  const T = m.total
  return (
    <>
      <PageHeader title="Sales Analytics" sub="Calculated only from activities and transactions you've recorded — nothing is estimated." actions={<Select className="!w-auto" value={range} onChange={setRange} options={[{ value: 'all', label: 'All time' }, { value: '30', label: 'Last 30 days' }, { value: '90', label: 'Last 90 days' }, { value: '365', label: 'Last 12 months' }]} />} />
      {leads.length === 0 ? <Card><Empty title="No data to analyse yet" hint="Add leads and log calls, emails and meetings; analytics fill in from those records." /></Card> : (<>
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
          <Stat label="Leads" value={leads.length} /><Stat label="Calls made" value={T.calls} sub={`${T.answered} answered`} /><Stat label="Emails sent" value={T.emails} /><Stat label="Replies" value={T.replies} />
          <Stat label="Meetings" value={T.meetings} /><Stat label="Proposals" value={T.proposals} /><Stat label="Deals won" value={T.won} tone="green" sub={`conversion ${T.conv}`} /><Stat label="Revenue (cash)" value={fmtCompact(T.revenue, base)} />
        </div>
        <Card className="mb-5">
          <CardHeader title="Monthly sales performance" sub="Deals won (by month the lead was last updated to Won) and cash received" />
          <div className="h-64 p-3"><ResponsiveContainer><BarChart data={m.monthly}><CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} /><XAxis dataKey="k" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} /><YAxis yAxisId="l" allowDecimals={false} tick={{ fontSize: 11 }} width={30} tickLine={false} axisLine={false} /><YAxis yAxisId="r" orientation="right" tick={{ fontSize: 11 }} width={56} tickLine={false} axisLine={false} tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : v)} /><Tooltip /><Legend /><Bar yAxisId="l" dataKey="Won" fill="#2563EB" radius={3} /><Bar yAxisId="r" dataKey="Revenue" fill="#60A5FA" radius={3} /></BarChart></ResponsiveContainer></div>
        </Card>
        {['Partner', 'Market', 'Source', 'Industry'].map((g) => {
          const rs = m.rows.filter((r) => r.group === g)
          if (!rs.length) return null
          return (
            <Card key={g} className="mb-5">
              <CardHeader title={`By ${g.toLowerCase()}`} />
              <div className="overflow-x-auto"><table className="w-full text-sm">
                <thead><tr className="border-b border-slate-100 bg-slate-50/70 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500"><th className="px-4 py-2.5">{g}</th>{cols.map(([c]) => <th key={c} className="whitespace-nowrap px-3 py-2.5 text-right">{c}</th>)}</tr></thead>
                <tbody>{rs.map((r) => <tr key={r.label} className="border-b border-slate-50"><td className="px-4 py-2.5 font-medium text-[#0B1F3A]">{r.label}</td>{cols.map(([c, f]) => <td key={c} className="px-3 py-2.5 text-right tabular-nums text-slate-700">{f(r.v)}</td>)}</tr>)}</tbody>
              </table></div>
            </Card>
          )
        })}
        <p className="text-xs text-slate-400">Notes: each logged call outcome (Called / Answered / Not Answered) counts as one call — log one entry per call. Partner rows count activities by who performed them and deals by lead owner. Meetings and proposals count distinct leads that were set to the status or have a logged activity. Revenue is cash received from the lead's client. Avg deal = invoiced total of won clients ÷ deals won.</p>
      </>)}
    </>
  )
}
