import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowRightCircle, CalendarPlus, Check, Globe, Mail, MessageCircle, Pencil, Phone, Trash2, Upload } from 'lucide-react'
import { resolveFileUrl, uploadFile, useTable } from '../lib/db'
import { create, remove, useList, partnerName, getCurrentUserId } from '../lib/services'
import { completeFollowUp, logLeadActivity, rescheduleFollowUp, scheduleFollowUp, setLeadStatus } from '../lib/leadOps'
import { ACTIVITY_TYPES } from '../lib/constants'
import { cn, fmtCompact, fmtDate, fmtDateTime, nowLocalInput, num, safeUrl, today } from '../lib/util'
import { Badge, Button, Card, CardHeader, Empty, Field, inputCls, PartnerChip, PartnerSelect, Select, statusTone, Tabs, useToast } from '../components/ui'
import { LeadForm } from './Leads'
import { convertLead } from '../lib/services'

function FileThumb({ doc }: { doc: any }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => { resolveFileUrl(doc.file_url).then(setUrl) }, [doc.file_url])
  const img = (doc.mime || '').startsWith('image/')
  return (
    <a href={url || '#'} target="_blank" rel="noreferrer" className="group block overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
      {img && url ? <img src={url} alt={doc.name} className="h-28 w-full object-cover" /> : <div className="flex h-28 items-center justify-center text-xs text-slate-400">{doc.mime || 'file'}</div>}
      <div className="truncate border-t border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-600 group-hover:text-[#2563EB]">{doc.name}</div>
    </a>
  )
}

export default function LeadDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  const leads = useTable('leads'), acts = useTable('lead_activities'), notes = useTable('lead_notes'), fus = useTable('follow_ups'), docs = useTable('documents')
  const statuses = useList('lead_statuses')
  const lead = leads.find((l) => l.id === id)
  const [tab, setTab] = useState('timeline')
  const [editing, setEditing] = useState(false)
  const [act, setAct] = useState({ type: ACTIVITY_TYPES[0], notes: '', next_action: '', user_id: getCurrentUserId() || '', when: nowLocalInput() })
  const [fu, setFu] = useState({ due: '', assigned: '', note: '' })
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const myActs = useMemo(() => acts.filter((a) => a.lead_id === id), [acts, id])
  const myFus = fus.filter((f) => f.lead_id === id)
  const myNotes = notes.filter((n) => n.lead_id === id)
  const myDocs = docs.filter((d) => d.lead_id === id)
  const timeline = useMemo(() => [
    ...myActs.map((a) => ({ k: 'activity', at: a.occurred_at, by: a.user_id, title: a.type, body: a.notes, next: a.next_action, id: a.id })),
    ...myNotes.map((n) => ({ k: 'note', at: n.created_at, by: n.created_by, title: 'Internal note', body: n.body, next: '', id: n.id })),
    ...myFus.filter((f) => f.status === 'completed').map((f) => ({ k: 'fu', at: f.completed_at || f.updated_at, by: f.completed_by, title: 'Follow-up completed', body: f.note, next: '', id: f.id })),
  ].sort((a, b) => b.at.localeCompare(a.at)), [myActs, myNotes, myFus])

  if (!lead) return <Empty title="Lead not found" action={<Button onClick={() => nav(-1)}>Go back</Button>} />
  const t = today()
  const pending = myFus.filter((f) => f.status === 'pending').sort((a, b) => a.due_date.localeCompare(b.due_date))
  const client = lead.converted_client_id

  const run = async (fn: () => Promise<any>, ok: string) => { setBusy(true); try { await fn(); toast(ok) } catch (e: any) { toast(e.message, 'err') } finally { setBusy(false) } }

  return (
    <>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2"><h1 className="text-xl font-semibold text-[#0B1F3A]">{lead.business_name}</h1><Badge tone={statusTone(lead.status)}>{lead.status}</Badge><Badge tone={lead.market === 'local' ? 'sky' : 'violet'}>{lead.market === 'local' ? 'Local' : 'International'}</Badge></div>
          <p className="mt-1 text-sm text-slate-500">Added {fmtDate(lead.created_at)} by {partnerName(lead.created_by)} • last updated by {partnerName(lead.updated_by)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select className="!w-auto" value={lead.status} onChange={(v) => run(async () => { await setLeadStatus(lead, v) }, 'Status updated')} options={statuses} />
          <Button variant="secondary" onClick={() => setEditing(true)}><Pencil size={14} /> Edit</Button>
          {client ? <Link to={`/clients/${client}`}><Button variant="secondary"><ArrowRightCircle size={14} /> View client</Button></Link>
            : <Button onClick={() => { if (window.confirm('Convert this lead into a client? The lead and its history are kept.')) run(async () => { const c = await convertLead(lead.id); nav(`/clients/${c.id}`) }, 'Converted to client') }}><ArrowRightCircle size={14} /> Convert to client</Button>}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5">
          <Card>
            <CardHeader title="Details" />
            <dl className="divide-y divide-slate-50 px-5 py-1 text-sm">
              {([
                ['Contact', lead.contact_person], ['Owner', <PartnerChip id={lead.assigned_to} />], ['Priority', <Badge tone={lead.priority === 'high' ? 'red' : lead.priority === 'medium' ? 'amber' : 'slate'}>{lead.priority}</Badge>],
                ['Location', [lead.city, lead.country].filter(Boolean).join(', ')], ['Industry', lead.industry], ['Business type', lead.business_type], ['Source', lead.source],
                ['Deal value', num(lead.deal_value) ? fmtCompact(num(lead.deal_value), lead.currency) : ''], ['Services', (lead.services || []).join(', ')],
                ['Next follow-up', lead.next_follow_up ? fmtDate(lead.next_follow_up) : ''], ['Last contact', fmtDate(lead.last_contact)],
              ] as [string, any][]).map(([k, v]) => <div key={k} className="flex justify-between gap-4 py-2"><dt className="text-slate-500">{k}</dt><dd className="text-right font-medium text-slate-800">{v || '—'}</dd></div>)}
            </dl>
            <div className="flex flex-wrap gap-2 border-t border-slate-100 p-4">
              {lead.phone && <a href={`tel:${lead.phone}`} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-xs hover:bg-slate-200"><Phone size={12} />{lead.phone}</a>}
              {(lead.whatsapp || lead.phone) && <a target="_blank" rel="noreferrer" href={`https://wa.me/${(lead.whatsapp || lead.phone).replace(/\D/g, '')}`} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs text-emerald-700 hover:bg-emerald-100"><MessageCircle size={12} />WhatsApp</a>}
              {lead.email && <a href={`mailto:${lead.email}`} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-xs hover:bg-slate-200"><Mail size={12} />{lead.email}</a>}
              {safeUrl(lead.website) && <a target="_blank" rel="noopener noreferrer" href={safeUrl(lead.website)!} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-xs hover:bg-slate-200"><Globe size={12} />Website</a>}
            </div>
            <p className="px-5 pb-3 text-[11px] text-slate-400">These links only open your own apps — FRX OS never sends messages or places calls for you. Log what you did in the timeline.</p>
            {(lead.tags?.length > 0 || lead.notes) && <div className="border-t border-slate-100 p-4 text-sm">{lead.tags?.length > 0 && <div className="mb-2 flex flex-wrap gap-1">{lead.tags.map((x: string) => <Badge key={x} tone="blue">{x}</Badge>)}</div>}{lead.notes && <p className="whitespace-pre-wrap text-slate-600">{lead.notes}</p>}</div>}
          </Card>

          <Card>
            <CardHeader title="Follow-ups" action={<span className="text-xs text-slate-400">{pending.length} pending</span>} />
            <div className="space-y-2 p-4">
              {pending.length === 0 && <p className="text-sm text-slate-500">No follow-up scheduled.</p>}
              {pending.map((f) => (
                <div key={f.id} className={cn('rounded-lg border p-3 text-sm', f.due_date < t ? 'border-red-200 bg-red-50' : f.due_date === t ? 'border-amber-200 bg-amber-50' : 'border-slate-200')}>
                  <div className="flex items-center justify-between"><b>{fmtDate(f.due_date)}{f.due_date < t && <span className="ml-2 text-xs font-medium text-red-600">overdue</span>}</b><PartnerChip id={f.assigned_to} /></div>
                  {f.note && <p className="mt-1 text-xs text-slate-600">{f.note}</p>}
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" onClick={() => { const n = window.prompt('Outcome / notes for this follow-up (optional)') ; if (n !== null) run(() => completeFollowUp(f, n), 'Follow-up completed') }}><Check size={12} /> Complete</Button>
                    <Button size="sm" variant="secondary" onClick={() => { const d = window.prompt('New date (YYYY-MM-DD)', f.due_date); if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) run(() => rescheduleFollowUp(f, d), 'Rescheduled') }}>Reschedule</Button>
                  </div>
                </div>
              ))}
              <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-3">
                <Field label="Date"><input type="date" className={inputCls} value={fu.due} onChange={(e) => setFu({ ...fu, due: e.target.value })} /></Field>
                <Field label="Assign to"><PartnerSelect value={fu.assigned || lead.assigned_to} onChange={(v) => setFu({ ...fu, assigned: v })} /></Field>
                <Field label="Note" className="col-span-2"><input className={inputCls} value={fu.note} onChange={(e) => setFu({ ...fu, note: e.target.value })} placeholder="What to follow up about" /></Field>
                <Button className="col-span-2" variant="secondary" loading={busy} onClick={() => { if (!fu.due) return toast('Pick a date', 'err'); run(async () => { await scheduleFollowUp(lead.id, fu.due, fu.assigned || lead.assigned_to, fu.note); setFu({ due: '', assigned: '', note: '' }) }, 'Follow-up scheduled') }}><CalendarPlus size={14} /> Schedule follow-up</Button>
              </div>
            </div>
          </Card>
        </div>

        <div className="space-y-4 lg:col-span-2">
          <Tabs value={tab} onChange={setTab} tabs={[{ id: 'timeline', label: 'Timeline', count: timeline.length }, { id: 'log', label: 'Log activity' }, { id: 'notes', label: 'Notes', count: myNotes.length }, { id: 'files', label: 'Files', count: myDocs.length }]} />
          {tab === 'log' && (
            <Card className="p-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Activity"><Select value={act.type} onChange={(v) => setAct({ ...act, type: v })} options={ACTIVITY_TYPES} /></Field>
                <Field label="Partner responsible"><PartnerSelect value={act.user_id} onChange={(v) => setAct({ ...act, user_id: v })} /></Field>
                <Field label="Date & time"><input type="datetime-local" className={inputCls} value={act.when} onChange={(e) => setAct({ ...act, when: e.target.value })} /></Field>
                <Field label="Next action"><input className={inputCls} value={act.next_action} onChange={(e) => setAct({ ...act, next_action: e.target.value })} placeholder="e.g. Send proposal on Friday" /></Field>
                <Field label="Notes" className="sm:col-span-2"><textarea rows={3} className={inputCls} value={act.notes} onChange={(e) => setAct({ ...act, notes: e.target.value })} placeholder="What was discussed?" /></Field>
              </div>
              <div className="mt-4 flex items-center justify-between"><p className="text-xs text-slate-400">Recording an activity does not change the lead's status — update that yourself.</p>
                <Button loading={busy} onClick={() => run(async () => { await logLeadActivity(lead.id, { type: act.type, notes: act.notes, next_action: act.next_action, user_id: act.user_id, occurred_at: new Date(act.when).toISOString() }); setAct({ ...act, notes: '', next_action: '', when: nowLocalInput() }); setTab('timeline') }, 'Activity logged')}>Save activity</Button></div>
            </Card>
          )}
          {tab === 'timeline' && (
            <Card>
              {timeline.length === 0 ? <Empty title="No activity yet" hint="Log calls, emails, WhatsApp messages and meetings to build the timeline." action={<Button onClick={() => setTab('log')}>Log activity</Button>} /> : (
                <ol className="relative p-5">
                  {timeline.map((e) => (
                    <li key={e.k + e.id} className="relative pb-5 pl-6 last:pb-0">
                      <span className="absolute left-0 top-1.5 h-2.5 w-2.5 rounded-full bg-[#2563EB] ring-4 ring-blue-50" />
                      <span className="absolute left-[4px] top-4 h-full w-px bg-slate-200 last:hidden" />
                      <div className="flex flex-wrap items-center gap-2 text-sm"><b className="text-[#0B1F3A]">{e.title}</b><span className="text-xs text-slate-400">{fmtDateTime(e.at)} • {partnerName(e.by)}</span></div>
                      {e.body && <p className="mt-0.5 whitespace-pre-wrap text-sm text-slate-600">{e.body}</p>}
                      {e.next && <p className="mt-1 text-xs text-[#2563EB]">Next: {e.next}</p>}
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          )}
          {tab === 'notes' && (
            <Card className="p-5">
              <textarea rows={3} className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Internal note or comment visible to both partners…" />
              <div className="mt-2 flex justify-end"><Button disabled={!note.trim()} onClick={() => run(async () => { await create('lead_notes', { lead_id: lead.id, body: note.trim() }, { summary: `added a note on ${lead.business_name}` }); setNote('') }, 'Note added')}>Add note</Button></div>
              <div className="mt-4 space-y-3">{myNotes.slice().reverse().map((n) => <div key={n.id} className="rounded-lg bg-slate-50 p-3 text-sm"><div className="mb-1 flex justify-between text-xs text-slate-400"><span>{partnerName(n.created_by)} • {fmtDateTime(n.created_at)}</span><button onClick={() => remove('lead_notes', n.id, { silent: true })}><Trash2 size={12} /></button></div><p className="whitespace-pre-wrap">{n.body}</p></div>)}</div>
            </Card>
          )}
          {tab === 'files' && (
            <Card className="p-5">
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-200 p-5 text-sm text-slate-500 hover:border-[#2563EB] hover:text-[#2563EB]">
                <Upload size={16} /> Upload logo, screenshot or reference image
                <input type="file" hidden multiple onChange={async (e) => {
                  for (const file of Array.from(e.target.files || [])) {
                    try { const url = await uploadFile(file); await create('documents', { name: file.name, category: file.type.startsWith('image/') ? 'Screenshots' : 'Other', file_url: url, mime: file.type, size: file.size, lead_id: lead.id }); toast(`${file.name} uploaded`) } catch (err: any) { toast(err.message, 'err') }
                  }
                  e.target.value = ''
                }} />
              </label>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">{myDocs.map((d) => <FileThumb key={d.id} doc={d} />)}</div>
            </Card>
          )}
        </div>
      </div>
      <LeadForm open={editing} onClose={() => setEditing(false)} market={lead.market} lead={lead} />
    </>
  )
}
