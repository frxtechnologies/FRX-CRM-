import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { CalendarDays, ChevronLeft, ChevronRight, LayoutGrid, Plus, Table2 } from 'lucide-react'
import { useTable, byId, type Row } from '../lib/db'
import { create, update, remove, getCurrentUserId } from '../lib/services'
import { CURRENCIES, PRIORITIES, PROJECT_STATUSES, SERVICES } from '../lib/constants'
import { cn, fmtCompact, fmtDate, isoDate, num, today } from '../lib/util'
import { Badge, Button, Card, Empty, PageHeader, PartnerChip, statusTone, useToast } from '../components/ui'
import { DataTable, FormModal, initialValues, type FieldDef } from '../components/Entity'

export const projectFields: FieldDef[] = [
  { key: 'name', label: 'Project Name', required: true, span: 2 },
  { key: 'client_id', label: 'Client', type: 'client', required: true },
  { key: 'assigned_to', label: 'Assigned Partner', type: 'partner', default: () => getCurrentUserId() },
  { key: 'status', label: 'Project Status', type: 'select', options: PROJECT_STATUSES, default: 'Not Started' },
  { key: 'priority', label: 'Priority', type: 'select', options: PRIORITIES, default: 'medium' },
  { key: 'start_date', label: 'Start Date', type: 'date' },
  { key: 'due_date', label: 'Expected Delivery Date', type: 'date' },
  { key: 'completed_date', label: 'Actual Completion Date', type: 'date' },
  { key: 'amount', label: 'Contract Amount', type: 'number' },
  { key: 'currency', label: 'Currency', type: 'select', options: [...CURRENCIES], default: 'USD' },
  { key: 'services', label: 'Services', type: 'multi', options: SERVICES },
  { key: 'description', label: 'Project Description', type: 'textarea' },
  { key: 'requirements', label: 'Client Requirements', type: 'textarea' },
]

export default function Projects() {
  const nav = useNavigate()
  const toast = useToast()
  const [sp, setSp] = useSearchParams()
  const projects = useTable('projects'), clients = useTable('clients')
  const [view, setView] = useState<'list' | 'board' | 'calendar'>('list')
  const [editing, setEditing] = useState<Row | null>(null)
  const [creating, setCreating] = useState(sp.get('new') === '1')
  const [confirm, setConfirm] = useState<Row | null>(null)
  const init = useMemo(() => initialValues(projectFields, editing ? { ...editing } : { client_id: sp.get('client') || '' }), [editing, creating])
  const closeForm = () => { setCreating(false); setEditing(null); if (sp.get('new')) setSp({}) }

  async function save(v: Record<string, any>) {
    const payload = { ...v }
    if (payload.status === 'Completed' && !payload.completed_date) payload.completed_date = today()
    if (editing) { await update('projects', editing.id, payload); toast('Project updated') }
    else { await create('projects', payload); toast('Project created') }
  }
  const move = async (p: Row, status: string) => { await update('projects', p.id, { status, ...(status === 'Completed' && !p.completed_date ? { completed_date: today() } : {}) }); toast(`Moved to ${status}`) }

  const columns = [
    { key: 'name', label: 'Project', render: (r: Row) => <div><div className="font-medium text-[#0B1F3A]">{r.name}</div><div className="text-xs text-slate-500">{byId('clients', r.client_id)?.company}</div></div> },
    { key: 'status', label: 'Status', render: (r: Row) => <Badge tone={statusTone(r.status)}>{r.status}</Badge> },
    { key: 'priority', label: 'Priority', render: (r: Row) => <Badge tone={r.priority === 'high' ? 'red' : r.priority === 'medium' ? 'amber' : 'slate'}>{r.priority}</Badge> },
    { key: 'progress', label: 'Progress', render: (r: Row) => <Progress project={r} />, sortValue: (r: Row) => progressOf(r.id), csv: (r: Row) => progressOf(r.id) + '%' },
    { key: 'due_date', label: 'Delivery', render: (r: Row) => <span className={cn(r.due_date && r.due_date < today() && !['Completed', 'Cancelled'].includes(r.status) && 'font-medium text-red-600')}>{fmtDate(r.due_date)}</span> },
    { key: 'amount', label: 'Amount', align: 'right' as const, render: (r: Row) => fmtCompact(num(r.amount), r.currency) },
    { key: 'assigned_to', label: 'Owner', render: (r: Row) => <PartnerChip id={r.assigned_to} /> },
  ]

  return (
    <>
      <PageHeader title="Projects" sub="Delivery work for enrolled clients" actions={<Button onClick={() => { setEditing(null); setCreating(true) }} disabled={clients.length === 0}><Plus size={15} /> New project</Button>} />
      {clients.length === 0 && <div className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Projects belong to clients. Convert a lead or add a client first.</div>}
      <div className="mb-3 flex rounded-lg border border-slate-200 bg-white p-0.5 w-fit">
        {([['list', Table2, 'List'], ['board', LayoutGrid, 'Board'], ['calendar', CalendarDays, 'Calendar']] as const).map(([k, I, l]) => <button key={k} onClick={() => setView(k)} className={cn('flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium', view === k ? 'bg-[#0B1F3A] text-white' : 'text-slate-600')}><I size={13} />{l}</button>)}
      </div>
      {view === 'list' && <DataTable rows={projects} columns={columns} exportName="projects" onRowClick={(r) => nav(`/projects/${r.id}`)} onEdit={(r) => { setCreating(false); setEditing(r) }} onDelete={setConfirm} searchKeys={['name', 'status', 'description']} empty={<Empty title="No projects yet" hint="Create a project for a client to start tracking delivery." />} />}
      {view === 'board' && <Board projects={projects} onMove={move} onOpen={(id) => nav(`/projects/${id}`)} />}
      {view === 'calendar' && <CalendarView projects={projects} onOpen={(id) => nav(`/projects/${id}`)} />}
      <FormModal open={creating || !!editing} onClose={closeForm} title={editing ? 'Edit project' : 'New project'} fields={projectFields} initial={init} onSubmit={save} />
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#071426]/50 p-4"><div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl">
          <h3 className="font-semibold">Delete project?</h3><p className="mt-2 text-sm text-slate-600">Its tasks are removed too. Invoices and income linked to it stay in your finance records. Consider marking it Completed or Cancelled instead to preserve history.</p>
          <div className="mt-4 flex justify-end gap-2"><Button variant="secondary" onClick={() => setConfirm(null)}>Cancel</Button><Button variant="danger" onClick={async () => { await remove('projects', confirm.id); setConfirm(null); toast('Project deleted') }}>Delete</Button></div></div></div>
      )}
    </>
  )
}

import { snapshot } from '../lib/db'
export function progressOf(projectId: string) {
  const ts = snapshot('project_tasks').filter((t) => t.project_id === projectId)
  if (!ts.length) return byId('projects', projectId)?.status === 'Completed' ? 100 : 0
  return Math.round((ts.filter((t) => t.done).length / ts.length) * 100)
}
export function Progress({ project }: { project: Row }) {
  useTable('project_tasks')
  const p = progressOf(project.id)
  return <div className="flex items-center gap-2"><div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#2563EB]" style={{ width: `${p}%` }} /></div><span className="text-xs text-slate-500">{p}%</span></div>
}

function Board({ projects, onMove, onOpen }: { projects: Row[]; onMove: (p: Row, s: string) => void; onOpen: (id: string) => void }) {
  const [over, setOver] = useState<string | null>(null)
  return (
    <div className="flex gap-3 overflow-x-auto pb-4">
      {PROJECT_STATUSES.map((s) => {
        const col = projects.filter((p) => p.status === s)
        return (
          <div key={s} onDragOver={(e) => { e.preventDefault(); setOver(s) }} onDragLeave={() => setOver(null)} onDrop={(e) => { e.preventDefault(); setOver(null); const p = projects.find((x) => x.id === e.dataTransfer.getData('text/plain')); if (p && p.status !== s) onMove(p, s) }}
            className={cn('w-64 shrink-0 rounded-xl bg-slate-100/80 p-2.5', over === s && 'bg-blue-100 ring-2 ring-[#2563EB]/40')}>
            <div className="mb-2 flex justify-between px-1 text-xs font-semibold text-slate-700"><span>{s}</span><span className="rounded-full bg-white px-1.5 text-slate-500">{col.length}</span></div>
            <div className="space-y-2">{col.map((p) => (
              <Card key={p.id} className="cursor-grab p-3"><div draggable onDragStart={(e) => e.dataTransfer.setData('text/plain', p.id)} onClick={() => onOpen(p.id)}>
                <div className="text-sm font-medium text-[#0B1F3A]">{p.name}</div><div className="text-xs text-slate-500">{byId('clients', p.client_id)?.company}</div>
                <div className="mt-2 flex items-center justify-between"><PartnerChip id={p.assigned_to} /><Progress project={p} /></div>
                {p.due_date && <div className="mt-1.5 text-[11px] text-slate-400">Due {fmtDate(p.due_date)}</div>}
              </div></Card>))}</div>
          </div>
        )
      })}
    </div>
  )
}

function CalendarView({ projects, onOpen }: { projects: Row[]; onOpen: (id: string) => void }) {
  const tasks = useTable('project_tasks')
  const [cur, setCur] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const first = new Date(cur); const startPad = (first.getDay() + 6) % 7
  const days = new Date(cur.getFullYear(), cur.getMonth() + 1, 0).getDate()
  const cells = Array.from({ length: Math.ceil((startPad + days) / 7) * 7 }, (_, i) => { const n = i - startPad + 1; return n >= 1 && n <= days ? isoDate(new Date(cur.getFullYear(), cur.getMonth(), n)) : null })
  const t = today()
  return (
    <Card>
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3"><b className="text-sm text-[#0B1F3A]">{cur.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</b>
        <div className="flex gap-1"><Button size="sm" variant="secondary" onClick={() => setCur(new Date(cur.getFullYear(), cur.getMonth() - 1, 1))}><ChevronLeft size={14} /></Button><Button size="sm" variant="secondary" onClick={() => setCur(new Date(cur.getFullYear(), cur.getMonth() + 1, 1))}><ChevronRight size={14} /></Button></div></div>
      <div className="grid grid-cols-7 border-b border-slate-100 text-center text-[11px] font-semibold uppercase text-slate-400">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d} className="py-2">{d}</div>)}</div>
      <div className="grid grid-cols-7">
        {cells.map((d, i) => (
          <div key={i} className={cn('min-h-24 border-b border-r border-slate-50 p-1.5 text-xs', d === t && 'bg-blue-50/50')}>
            {d && <><div className={cn('mb-1 text-slate-400', d === t && 'font-bold text-[#2563EB]')}>{Number(d.slice(8))}</div>
              {projects.filter((p) => p.due_date === d).map((p) => <button key={p.id} onClick={() => onOpen(p.id)} className="mb-0.5 block w-full truncate rounded bg-[#2563EB] px-1.5 py-0.5 text-left text-[11px] text-white">{p.name}</button>)}
              {tasks.filter((x) => x.due_date === d && !x.done).slice(0, 2).map((x) => <div key={x.id} className="mb-0.5 truncate rounded bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-800">{x.title}</div>)}</>}
          </div>
        ))}
      </div>
      <p className="p-3 text-[11px] text-slate-400"><span className="mr-3 inline-block h-2 w-2 rounded bg-[#2563EB]" />Project delivery <span className="ml-3 mr-1 inline-block h-2 w-2 rounded bg-amber-200" />Task deadline</p>
    </Card>
  )
}
