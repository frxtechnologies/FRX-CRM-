import { useState } from 'react'
import { useTable } from '../lib/db'
import { partnerName } from '../lib/services'
import { fmtDateTime } from '../lib/util'
import { Avatar, Badge, Card, Empty, PageHeader, Select } from '../components/ui'

const ENTITY: Record<string, string> = { leads: 'Lead', clients: 'Client', projects: 'Project', business_tasks: 'Task', invoices: 'Invoice', invoice_payments: 'Payment', income_transactions: 'Income', expense_transactions: 'Expense', investments: 'Investment', subscriptions: 'Subscription', follow_ups: 'Follow-up', lead_activities: 'Activity', documents: 'Document', business_notes: 'Note', project_tasks: 'Project task' }

export default function ActivityLog() {
  const logs = useTable('activity_logs'), profiles = useTable('profiles')
  const [who, setWho] = useState(''), [ent, setEnt] = useState(''), [limit, setLimit] = useState(100)
  const rows = logs.filter((l) => (!who || l.user_id === who) && (!ent || l.entity === ent)).sort((a, b) => b.created_at.localeCompare(a.created_at))
  return (
    <>
      <PageHeader title="Activity Log" sub="Every change either partner makes, with who and when. This log is append-only." actions={<>
        <Select className="!w-auto" value={who} onChange={setWho} placeholder="Both partners" options={profiles.map((p) => ({ value: p.id, label: p.short_name }))} />
        <Select className="!w-auto" value={ent} onChange={setEnt} placeholder="All record types" options={Object.entries(ENTITY).map(([value, label]) => ({ value, label }))} />
      </>} />
      <Card>
        {rows.length === 0 ? <Empty title="No activity recorded yet" /> : (
          <ul className="divide-y divide-slate-50">
            {rows.slice(0, limit).map((a) => {
              const p = profiles.find((x) => x.id === a.user_id)
              return (
                <li key={a.id} className="flex items-start gap-3 px-5 py-3 text-sm">
                  <Avatar name={p?.short_name} color={p?.avatar_color} size={28} />
                  <div className="min-w-0 flex-1"><b>{partnerName(a.user_id)}</b> {a.summary}</div>
                  {a.entity && ENTITY[a.entity] && <Badge>{ENTITY[a.entity]}</Badge>}
                  <span className="shrink-0 text-xs text-slate-400">{fmtDateTime(a.created_at)}</span>
                </li>
              )
            })}
          </ul>
        )}
        {rows.length > limit && <div className="border-t border-slate-100 p-3 text-center"><button className="text-sm text-[#2563EB]" onClick={() => setLimit(limit + 200)}>Show more ({rows.length - limit} older)</button></div>}
      </Card>
    </>
  )
}
