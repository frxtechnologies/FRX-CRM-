import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, CalendarClock } from 'lucide-react'
import { useTable, byId, type Row } from '../lib/db'
import { partnerName } from '../lib/services'
import { completeFollowUp, rescheduleFollowUp } from '../lib/leadOps'
import { cn, fmtDate, fmtDateTime, today } from '../lib/util'
import { Badge, Button, Card, Empty, PageHeader, PartnerChip, Select, Stat, statusTone, Tabs, useToast } from '../components/ui'

export default function FollowUps() {
  const fus = useTable('follow_ups'), leads = useTable('leads'), profiles = useTable('profiles')
  const toast = useToast()
  const [tab, setTab] = useState('today')
  const [who, setWho] = useState('')
  const [market, setMarket] = useState('')
  const t = today()

  const scoped = (r: Row) => (!who || r.assigned_to === who) && (!market || byId('leads', r.lead_id)?.market === market)
  const pending = fus.filter((f) => f.status === 'pending' && scoped(f))
  const lists: Record<string, Row[]> = useMemo(() => ({
    today: pending.filter((f) => f.due_date === t),
    overdue: pending.filter((f) => f.due_date < t).sort((a, b) => a.due_date.localeCompare(b.due_date)),
    upcoming: pending.filter((f) => f.due_date > t).sort((a, b) => a.due_date.localeCompare(b.due_date)),
    done: fus.filter((f) => f.status === 'completed' && scoped(f)).sort((a, b) => (b.completed_at || '').localeCompare(a.completed_at || '')),
  }), [fus, who, market])
  const noResponse = leads.filter((l) => l.status === 'No Response' && (!who || l.assigned_to === who) && (!market || l.market === market))
  const high = leads.filter((l) => l.priority === 'high' && !['Won / Converted', 'Lost', 'Not Interested'].includes(l.status) && (!who || l.assigned_to === who) && (!market || l.market === market))

  const act = async (fn: () => Promise<any>, ok: string) => { try { await fn(); toast(ok) } catch (e: any) { toast(e.message, 'err') } }

  const rows = lists[tab] || []
  return (
    <>
      <PageHeader title="Follow-up Center" sub="Nothing here is ever marked done automatically — you confirm each follow-up yourself."
        actions={<>
          <Select className="!w-auto" value={who} onChange={setWho} placeholder="Both partners" options={profiles.map((p) => ({ value: p.id, label: p.short_name }))} />
          <Select className="!w-auto" value={market} onChange={setMarket} placeholder="All markets" options={[{ value: 'local', label: 'Local' }, { value: 'international', label: 'International' }]} />
        </>} />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Due today" value={lists.today.length} tone={lists.today.length ? 'blue' : undefined} />
        <Stat label="Overdue" value={lists.overdue.length} tone={lists.overdue.length ? 'red' : undefined} />
        <Stat label="Upcoming" value={lists.upcoming.length} />
        <Stat label="Completed" value={lists.done.length} tone="green" />
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[
        { id: 'today', label: 'Due Today', count: lists.today.length }, { id: 'overdue', label: 'Overdue', count: lists.overdue.length }, { id: 'upcoming', label: 'Upcoming', count: lists.upcoming.length },
        { id: 'done', label: 'Completed', count: lists.done.length }, { id: 'noresp', label: 'No Response', count: noResponse.length }, { id: 'high', label: 'High Priority', count: high.length },
      ]} />
      <Card className="mt-4">
        {tab === 'noresp' || tab === 'high' ? (
          (tab === 'noresp' ? noResponse : high).length === 0 ? <Empty title="Nothing here" hint={tab === 'noresp' ? 'Leads set to "No Response" appear here.' : 'High-priority open leads appear here.'} /> : (
            <ul className="divide-y divide-slate-100">
              {(tab === 'noresp' ? noResponse : high).map((l) => (
                <li key={l.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                  <div><Link to={`/leads/${l.id}`} className="font-medium text-[#2563EB] hover:underline">{l.business_name}</Link><div className="text-xs text-slate-500">{l.industry} • last contact {fmtDate(l.last_contact)}</div></div>
                  <div className="flex items-center gap-3"><Badge tone={statusTone(l.status)}>{l.status}</Badge><PartnerChip id={l.assigned_to} /></div>
                </li>
              ))}
            </ul>
          )
        ) : rows.length === 0 ? <Empty title="Nothing here" hint={tab === 'done' ? 'Completed follow-ups will be listed here.' : 'No follow-ups in this category.'} /> : (
          <ul className="divide-y divide-slate-100">
            {rows.map((f) => {
              const l = byId('leads', f.lead_id)
              const overdue = f.status === 'pending' && f.due_date < t
              return (
                <li key={f.id} className={cn('flex flex-wrap items-center justify-between gap-3 px-5 py-3.5', overdue && 'bg-red-50/60')}>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2"><Link to={`/leads/${f.lead_id}`} className="font-medium text-[#2563EB] hover:underline">{l?.business_name || 'Lead'}</Link>{l && <Badge tone={l.market === 'local' ? 'sky' : 'violet'}>{l.market}</Badge>}{overdue && <Badge tone="red">Overdue {Math.round((new Date(t).getTime() - new Date(f.due_date).getTime()) / 86400000)}d</Badge>}</div>
                    <div className="mt-0.5 text-xs text-slate-500">{f.status === 'completed' ? `Completed ${fmtDateTime(f.completed_at)} by ${partnerName(f.completed_by)}` : `Due ${fmtDate(f.due_date)}`}{f.note ? ` • ${f.note}` : ''}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <PartnerChip id={f.assigned_to} />
                    {f.status === 'pending' && <>
                      <Button size="sm" onClick={() => { const n = window.prompt('Outcome / notes after the conversation (optional)'); if (n !== null) act(() => completeFollowUp(f, n), 'Marked completed') }}><Check size={12} /> Complete</Button>
                      <Button size="sm" variant="secondary" onClick={() => { const d = window.prompt('Reschedule to (YYYY-MM-DD)', f.due_date); if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) act(() => rescheduleFollowUp(f, d), 'Rescheduled') }}><CalendarClock size={12} /> Reschedule</Button>
                    </>}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </>
  )
}
