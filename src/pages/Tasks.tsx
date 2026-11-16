import { useState } from 'react'
import { useTable, byId } from '../lib/db'
import { getCurrentUserId, partnerName, update, notify } from '../lib/services'
import { NOTE_KINDS, PRIORITIES, TASK_CATEGORIES, TASK_STATUSES } from '../lib/constants'
import { cn, fmtDate, timeAgo, today } from '../lib/util'
import { Badge, PageHeader, PartnerChip, Select, statusTone, Tabs } from '../components/ui'
import { EntityManager, type FieldDef } from '../components/Entity'
import { useAuth } from '../lib/auth'

const taskFields: FieldDef[] = [
  { key: 'title', label: 'Task Title', required: true, span: 2 },
  { key: 'description', label: 'Description', type: 'textarea' },
  { key: 'assigned_to', label: 'Assigned Partner', type: 'partner', default: () => getCurrentUserId() },
  { key: 'priority', label: 'Priority', type: 'select', options: PRIORITIES, default: 'medium' },
  { key: 'due_date', label: 'Due Date', type: 'date' },
  { key: 'category', label: 'Category', type: 'select', options: TASK_CATEGORIES, default: 'Other' },
  { key: 'status', label: 'Status', type: 'select', options: TASK_STATUSES, default: 'To Do' },
  { key: 'client_id', label: 'Related Client', type: 'client' },
  { key: 'project_id', label: 'Related Project', type: 'project' },
]
const noteFields: FieldDef[] = [
  { key: 'title', label: 'Title', required: true, span: 2 },
  { key: 'kind', label: 'Type', type: 'select', options: NOTE_KINDS, default: 'note' },
  { key: 'pinned', label: 'Pinned', type: 'checkbox', hint: 'Pin to top' },
  { key: 'body', label: 'Content', type: 'textarea' },
]

export default function Tasks() {
  const { user } = useAuth()
  const tasks = useTable('business_tasks'), leads = useTable('leads')
  const [tab, setTab] = useState('mine')
  const t = today()
  const open = (x: any) => !['Completed', 'Cancelled'].includes(x.status)
  const filters: Record<string, (x: any) => boolean> = {
    mine: (x) => x.assigned_to === user?.id && open(x), partner: (x) => x.assigned_to && x.assigned_to !== user?.id && open(x), all: () => true,
    today: (x) => x.due_date === t && open(x), overdue: (x) => !!x.due_date && x.due_date < t && open(x), done: (x) => x.status === 'Completed',
  }
  const count = (k: string) => tasks.filter(filters[k]).length
  const other = useTable('profiles').find((p) => p.id !== user?.id)

  return (
    <>
      <PageHeader title="Tasks & Operations" sub="Shared to-dos for both partners, plus decisions and ideas" />
      <div className="mb-4"><Tabs value={tab} onChange={setTab} tabs={[
        { id: 'mine', label: 'My Tasks', count: count('mine') }, { id: 'partner', label: `${other?.short_name || 'Partner'}'s Tasks`, count: count('partner') }, { id: 'all', label: 'All Tasks', count: count('all') },
        { id: 'today', label: "Today's", count: count('today') }, { id: 'overdue', label: 'Overdue', count: count('overdue') }, { id: 'done', label: 'Completed', count: count('done') }, { id: 'notes', label: 'Shared Notes' },
      ]} /></div>
      {tab === 'notes' ? (
        <EntityManager table="business_notes" noun="note" fields={noteFields} initialSort={{ key: 'created_at', dir: -1 }} searchKeys={['title', 'body', 'kind']}
          columns={[
            { key: 'title', label: 'Note', render: (r) => <div><div className="font-medium text-[#0B1F3A]">{r.pinned ? '\u{1F4CC} ' : ''}{r.title}</div><div className="line-clamp-2 max-w-xl whitespace-pre-wrap text-xs text-slate-500">{r.body}</div></div> },
            { key: 'kind', label: 'Type', render: (r) => <Badge tone={r.kind === 'announcement' ? 'violet' : r.kind === 'decision' ? 'green' : r.kind === 'idea' ? 'amber' : 'slate'}>{r.kind}</Badge> },
            { key: 'created_by', label: 'By', render: (r) => partnerName(r.created_by) }, { key: 'created_at', label: 'When', render: (r) => timeAgo(r.created_at) },
          ]}
          afterSave={async (row, isNew) => { if (isNew && row.kind === 'announcement') await notify({ title: `Announcement: ${row.title}`, body: row.body, link: '/tasks', kind: 'announcement' }) }} />
      ) : (
        <EntityManager table="business_tasks" noun="task" fields={taskFields} filterRows={(r) => r.filter(filters[tab])} initialSort={{ key: 'due_date', dir: 1 }} searchKeys={['title', 'description', 'category', 'status']}
          rowClass={(r) => (open(r) && r.due_date && r.due_date < t ? 'bg-red-50/40' : '')}
          beforeSave={(v, ex) => ({ ...v, completed_at: v.status === 'Completed' ? ex?.completed_at || new Date().toISOString() : null })}
          afterSave={async (row, isNew) => { if (row.assigned_to && row.assigned_to !== getCurrentUserId() && (isNew)) await notify({ title: `New task for you: ${row.title}`, body: `Assigned by ${partnerName(getCurrentUserId())}`, link: '/tasks', user_id: row.assigned_to, kind: 'task' }) }}
          columns={[
            { key: 'title', label: 'Task', render: (r) => <div><div className={cn('font-medium text-[#0B1F3A]', r.status === 'Completed' && 'text-slate-400 line-through')}>{r.title}</div><div className="text-xs text-slate-500">{[r.category, byId('clients', r.client_id)?.company, byId('projects', r.project_id)?.name, leads.find((l) => l.id === r.lead_id)?.business_name].filter(Boolean).join(' • ')}</div></div> },
            { key: 'status', label: 'Status', render: (r) => <Select className="!w-32 !py-1 text-xs" value={r.status} onChange={(v) => update('business_tasks', r.id, { status: v, completed_at: v === 'Completed' ? new Date().toISOString() : null })} options={TASK_STATUSES} /> },
            { key: 'priority', label: 'Priority', render: (r) => <Badge tone={r.priority === 'high' ? 'red' : r.priority === 'medium' ? 'amber' : 'slate'}>{r.priority}</Badge> },
            { key: 'due_date', label: 'Due', render: (r) => <span className={cn(open(r) && r.due_date && r.due_date < t && 'font-medium text-red-600')}>{fmtDate(r.due_date)}</span> },
            { key: 'assigned_to', label: 'Assigned', render: (r) => <PartnerChip id={r.assigned_to} /> },
            { key: 'created_by', label: 'Created by', render: (r) => partnerName(r.created_by) },
          ]} />
      )}
    </>
  )
}
void statusTone
