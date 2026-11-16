import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Plus, Trash2, Upload } from 'lucide-react'
import { uploadFile, useTable } from '../lib/db'
import { create, partnerName, remove, update } from '../lib/services'
import { PROJECT_STATUSES } from '../lib/constants'
import { cn, fmtCompact, fmtDate, fmtDateTime, num, today } from '../lib/util'
import { Badge, Button, Card, CardHeader, Empty, inputCls, PartnerChip, PartnerSelect, Select, statusTone, useToast } from '../components/ui'
import { Progress } from './Projects'

export default function ProjectDetail() {
  const { id } = useParams()
  const toast = useToast()
  const projects = useTable('projects'), clients = useTable('clients'), tasks = useTable('project_tasks'), docs = useTable('documents'), logs = useTable('activity_logs'), invoices = useTable('invoices'), income = useTable('income_transactions')
  const p = projects.find((x) => x.id === id)
  const [title, setTitle] = useState(''), [who, setWho] = useState(''), [due, setDue] = useState('')
  const [notes, setNotes] = useState<string | null>(null)
  if (!p) return <Empty title="Project not found" />
  const client = clients.find((c) => c.id === p.client_id)
  const myTasks = tasks.filter((t) => t.project_id === id).sort((a, b) => Number(a.done) - Number(b.done) || (a.due_date || '9').localeCompare(b.due_date || '9'))
  const myDocs = docs.filter((d) => d.project_id === id)
  const myInv = invoices.filter((i) => i.project_id === id)
  const received = income.filter((i) => i.project_id === id && i.currency === p.currency).reduce((s, i) => s + num(i.amount), 0)
  const timeline = logs.filter((l) => l.entity_id === id || (l.entity === 'project_tasks' && l.summary.includes(p.name))).sort((a, b) => b.created_at.localeCompare(a.created_at))
  const payStatus = myInv.length === 0 ? 'No invoice yet' : myInv.every((i) => i.status === 'Paid') ? 'Paid' : received > 0 ? 'Partially paid' : 'Unpaid'

  return (
    <>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div><div className="flex items-center gap-2"><h1 className="text-xl font-semibold text-[#0B1F3A]">{p.name}</h1><Badge tone={statusTone(p.status)}>{p.status}</Badge></div>
          <p className="mt-1 text-sm text-slate-500">{client ? <Link className="text-[#2563EB] hover:underline" to={`/clients/${client.id}`}>{client.company}</Link> : '—'} • owner {partnerName(p.assigned_to)} • delivery {fmtDate(p.due_date)}</p></div>
        <div className="flex items-center gap-3"><Progress project={p} />
          <Select className="!w-auto" value={p.status} onChange={(v) => update('projects', p.id, { status: v, ...(v === 'Completed' && !p.completed_date ? { completed_date: today() } : {}) })} options={PROJECT_STATUSES} />
          <Link to={`/invoices/new?client=${p.client_id}&project=${p.id}`}><Button variant="secondary">Invoice</Button></Link></div>
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader title="Tasks" sub={`${myTasks.filter((t) => t.done).length} of ${myTasks.length} done`} />
            <div className="flex flex-wrap gap-2 border-b border-slate-100 p-3">
              <input className={cn(inputCls, 'min-w-48 flex-1')} placeholder="Add a task…" value={title} onChange={(e) => setTitle(e.target.value)} />
              <PartnerSelect className="!w-32" value={who} onChange={setWho} />
              <input type="date" className={cn(inputCls, '!w-40')} value={due} onChange={(e) => setDue(e.target.value)} />
              <Button disabled={!title.trim()} onClick={async () => { await create('project_tasks', { project_id: p.id, title: title.trim(), assigned_to: who || null, due_date: due || null, done: false }, { summary: `added task "${title.trim()}" to ${p.name}` }); setTitle(''); setDue('') }}><Plus size={14} /> Add</Button>
            </div>
            {myTasks.length === 0 ? <Empty title="No tasks yet" hint="Break the project into tasks and assign them to a partner." /> : (
              <ul className="divide-y divide-slate-50">{myTasks.map((t) => (
                <li key={t.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <input type="checkbox" className="h-4 w-4 accent-[#2563EB]" checked={!!t.done} onChange={() => update('project_tasks', t.id, { done: !t.done }, { summary: `${t.done ? 'reopened' : 'completed'} task "${t.title}" in ${p.name}` })} />
                  <span className={cn('flex-1', t.done && 'text-slate-400 line-through')}>{t.title}</span>
                  {t.due_date && <span className={cn('text-xs', !t.done && t.due_date < today() ? 'font-medium text-red-600' : 'text-slate-400')}>{fmtDate(t.due_date)}</span>}
                  <PartnerChip id={t.assigned_to} />
                  <button className="text-slate-300 hover:text-red-500" onClick={() => remove('project_tasks', t.id, { silent: true })}><Trash2 size={13} /></button>
                </li>))}</ul>
            )}
          </Card>
          <Card>
            <CardHeader title="Files" />
            <div className="p-4">
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-200 p-4 text-sm text-slate-500 hover:border-[#2563EB]"><Upload size={15} /> Upload project file
                <input type="file" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; try { const url = await uploadFile(f); await create('documents', { name: f.name, category: 'Project Assets', file_url: url, mime: f.type, size: f.size, project_id: p.id, client_id: p.client_id }); toast('Uploaded') } catch (er: any) { toast(er.message, 'err') } e.target.value = '' }} /></label>
              <ul className="mt-3 divide-y divide-slate-50 text-sm">{myDocs.map((d) => <li key={d.id} className="py-2">{d.name} <span className="text-xs text-slate-400">{fmtDate(d.created_at)} • {partnerName(d.created_by)}</span></li>)}</ul>
            </div>
          </Card>
          <Card>
            <CardHeader title="Project activity" />
            <ul className="divide-y divide-slate-50 text-sm">{timeline.length === 0 && <li className="p-5 text-slate-500">No activity yet.</li>}{timeline.slice(0, 20).map((a) => <li key={a.id} className="flex justify-between gap-3 px-5 py-2.5"><span><b>{partnerName(a.user_id)}</b> {a.summary}</span><span className="shrink-0 text-xs text-slate-400">{fmtDateTime(a.created_at)}</span></li>)}</ul>
          </Card>
        </div>
        <div className="space-y-5">
          <Card>
            <CardHeader title="Overview" />
            <dl className="divide-y divide-slate-50 px-5 py-1 text-sm">
              {([['Contract', fmtCompact(num(p.amount), p.currency)], ['Payment', payStatus], ['Received', fmtCompact(received, p.currency)], ['Start', fmtDate(p.start_date)], ['Delivery', fmtDate(p.due_date)], ['Completed', fmtDate(p.completed_date)], ['Priority', p.priority], ['Services', (p.services || []).join(', ')]] as [string, string][]).map(([k, v]) => <div key={k} className="flex justify-between gap-4 py-2"><dt className="text-slate-500">{k}</dt><dd className="text-right font-medium">{v || '—'}</dd></div>)}
            </dl>
          </Card>
          {(p.description || p.requirements) && <Card className="p-5 text-sm">{p.description && <><p className="mb-1 text-xs font-semibold text-slate-500">Description</p><p className="mb-4 whitespace-pre-wrap">{p.description}</p></>}{p.requirements && <><p className="mb-1 text-xs font-semibold text-slate-500">Client requirements</p><p className="whitespace-pre-wrap">{p.requirements}</p></>}</Card>}
          <Card>
            <CardHeader title="Internal notes" />
            <div className="p-4"><textarea rows={5} className={inputCls} value={notes ?? p.notes ?? ''} onChange={(e) => setNotes(e.target.value)} placeholder="Notes for both partners…" />
              <div className="mt-2 flex justify-end"><Button size="sm" disabled={notes === null} onClick={async () => { await update('projects', p.id, { notes }, { summary: `updated notes on project ${p.name}` }); setNotes(null); toast('Notes saved') }}>Save notes</Button></div></div>
          </Card>
        </div>
      </div>
    </>
  )
}
