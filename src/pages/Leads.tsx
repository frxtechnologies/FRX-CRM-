import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CalendarClock, Download, LayoutGrid, MessageCircle, Phone, Search, SlidersHorizontal, Table2, Upload } from 'lucide-react'
import { useTable, type Row } from '../lib/db'
import { create, update, remove, useList, partnerName, getCurrentUserId } from '../lib/services'
import { findDuplicates, logLeadActivity, scheduleFollowUp, setLeadStatus } from '../lib/leadOps'
import QuickAddLead from '../components/QuickAddLead'
import { COUNTRIES, INDUSTRIES_INTL, INDUSTRIES_LOCAL, LEAD_SOURCES, PRIORITIES, SERVICES, CURRENCIES, ACTIVITY_TYPES, LOST_STATUSES, WON } from '../lib/constants'
import { addDays, cn, downloadBlob, fmtDate, num, parseCSV, toCSV, today } from '../lib/util'
import { Badge, Button, Card, Modal, PartnerChip, PartnerSelect, Select, statusTone, useToast, Empty } from '../components/ui'
import { FormModal, initialValues, type FieldDef } from '../components/Entity'

export function leadFields(market: 'local' | 'international', statuses: string[]): FieldDef[] {
  const local = market === 'local'
  return [
    { key: 'business_name', label: 'Business Name', required: true, span: 2 },
    { key: 'contact_person', label: 'Contact Person' },
    { key: 'email', label: 'Business Email', type: 'email' },
    { key: 'phone', label: 'Phone Number' },
    { key: 'whatsapp', label: 'WhatsApp Number' },
    { key: 'website', label: 'Website' },
    { key: 'country', label: 'Country', type: 'select', options: COUNTRIES, default: local ? 'Pakistan' : '' },
    { key: 'city', label: 'City' },
    { key: 'industry', label: 'Industry', type: 'select', options: local ? INDUSTRIES_LOCAL : INDUSTRIES_INTL },
    { key: 'business_type', label: 'Business Type' },
    { key: 'source', label: 'Lead Source', type: 'select', options: LEAD_SOURCES },
    { key: 'assigned_to', label: 'Assigned Partner', type: 'partner', default: () => getCurrentUserId() },
    { key: 'priority', label: 'Priority', type: 'select', options: PRIORITIES, default: 'medium' },
    { key: 'status', label: 'Status', type: 'select', options: statuses, default: 'New Lead' },
    { key: 'deal_value', label: 'Estimated Deal Value', type: 'number' },
    { key: 'currency', label: 'Currency', type: 'select', options: [...CURRENCIES], default: local ? 'PKR' : 'USD' },
    { key: 'services', label: 'Services Interested In', type: 'multi', options: SERVICES },
    { key: 'next_follow_up', label: 'Next Follow-up Date', type: 'date', hint: 'Creates an entry in the Follow-up Center' },
    { key: 'last_contact', label: 'Last Contact Date', type: 'date' },
    { key: 'tags_text', label: 'Tags (comma separated)', span: 2 },
    { key: 'notes', label: 'Business Notes', type: 'textarea' },
  ]
}

const priorityTone = (p: string) => (p === 'high' ? 'red' : p === 'medium' ? 'amber' : 'slate')

export function LeadForm({ open, onClose, market, lead }: { open: boolean; onClose: () => void; market: 'local' | 'international'; lead?: Row | null }) {
  const statuses = useList('lead_statuses')
  const toast = useToast()
  const nav = useNavigate()
  const fields = useMemo(() => leadFields(market, statuses), [market, statuses])
  const init = useMemo(() => initialValues(fields, lead ? { ...lead, tags_text: (lead.tags || []).join(', ') } : {}), [fields, lead, open])
  const [dupes, setDupes] = useState<{ lead: Row; reason: string }[] | null>(null)
  const [pending, setPending] = useState<Record<string, any> | null>(null)

  async function save(v: Record<string, any>) {
    const { tags_text, ...rest } = v
    const payload: Record<string, any> = { ...rest, tags: String(tags_text || '').split(',').map((t) => t.trim()).filter(Boolean), market: lead?.market || market, dedupe_key: (v.business_name || '').toLowerCase().trim() }
    if (lead) {
      const nf = payload.next_follow_up
      delete payload.next_follow_up // follow-up dates are managed through follow_ups
      await update('leads', lead.id, payload)
      if (nf && nf !== lead.next_follow_up) await scheduleFollowUp(lead.id, nf, payload.assigned_to)
      toast('Lead updated'); return
    }
    const d = findDuplicates(payload)
    if (d.length && !pending) { setPending(v); setDupes(d); throw new Error('Possible duplicate found — review below')}
    const nf = payload.next_follow_up
    delete payload.next_follow_up
    const row = await create('leads', payload)
    if (nf) await scheduleFollowUp(row.id, nf, payload.assigned_to)
    toast('Lead added — your partner can see it immediately')
    setPending(null)
    return row
  }
  return (
    <>
      <FormModal open={open} onClose={onClose} title={lead ? 'Edit lead' : `Add ${market === 'local' ? 'local' : 'international'} lead`} fields={fields} initial={init} onSubmit={async (v) => { await save(v) }} />
      <Modal open={!!dupes} onClose={() => { setDupes(null); setPending(null) }} title="Possible duplicate"
        footer={<><Button variant="secondary" onClick={() => { setDupes(null); setPending(null) }}>Cancel</Button><Button onClick={async () => { const v = pending!; setDupes(null); try { await save(v); onClose() } catch (e: any) { toast(e.message, 'err') } }}>Add anyway</Button></>}>
        <p className="mb-3 text-sm text-slate-600">This looks like a lead that is already in the system:</p>
        {dupes?.map(({ lead: l, reason }) => (
          <div key={l.id} className="mb-2 flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
            <div><button className="font-medium text-[#2563EB] hover:underline" onClick={() => { nav(`/leads/${l.id}`); onClose(); setDupes(null) }}>{l.business_name}</button><div className="text-xs text-slate-500">{reason} • owned by {partnerName(l.assigned_to)} • {l.status}</div></div>
          </div>
        ))}
      </Modal>
    </>
  )
}

const ALIASES: Record<string, string[]> = {
  business_name: ['business name', 'business', 'company', 'name', 'company name'], contact_person: ['contact person', 'contact', 'person'], email: ['email', 'business email'],
  phone: ['phone', 'phone number', 'mobile'], whatsapp: ['whatsapp', 'whatsapp number'], website: ['website', 'url', 'site'], country: ['country'], city: ['city'],
  industry: ['industry'], business_type: ['business type', 'type'], source: ['source', 'lead source'], priority: ['priority'], deal_value: ['deal value', 'estimated deal value', 'value'],
  currency: ['currency'], status: ['status'], notes: ['notes', 'business notes'], tags: ['tags'],
}

const tone2cls: Record<string, string> = {
  green: 'bg-emerald-50 text-emerald-700 border-emerald-200', red: 'bg-red-50 text-red-700 border-red-200', amber: 'bg-amber-50 text-amber-800 border-amber-200',
  blue: 'bg-blue-50 text-blue-700 border-blue-200', slate: 'bg-slate-50 text-slate-700 border-slate-200', violet: 'bg-violet-50 text-violet-700 border-violet-200',
}
const FOLLOW_PICKS: [string, number][] = [['Tomorrow', 1], ['In 3 days', 3], ['Next week', 7], ['In 2 weeks', 14]]

function whenLabel(d: string, t: string) {
  const n = Math.round((new Date(d + 'T00:00:00').getTime() - new Date(t + 'T00:00:00').getTime()) / 86400000)
  if (n < 0) return `${-n} day${n === -1 ? '' : 's'} overdue`
  if (n === 0) return 'Today'
  if (n === 1) return 'Tomorrow'
  return fmtDate(d)
}

function LeadRow({ lead, statuses, selected, onToggle, onOpen }: { lead: Row; statuses: string[]; selected: boolean; onToggle: () => void; onOpen: () => void }) {
  const toast = useToast()
  const t = today()
  const closed = ['Won / Converted', 'Lost', 'Not Interested'].includes(lead.status)
  const overdue = !!lead.next_follow_up && lead.next_follow_up < t && !closed
  const dueToday = lead.next_follow_up === t && !closed
  const tone = statusTone(lead.status)
  const call = lead.phone || lead.whatsapp
  const run = async (fn: () => Promise<any>, ok: string) => { try { await fn(); toast(ok) } catch (e: any) { toast(e.message || 'Failed', 'err') } }
  return (
    <div className={cn('group relative rounded-2xl border bg-white p-4 shadow-sm transition hover:shadow-md', overdue ? 'border-red-200' : 'border-slate-200')}>
      <span className={cn('absolute inset-y-3 left-0 w-1 rounded-r-full', overdue ? 'bg-red-500' : dueToday ? 'bg-amber-400' : tone === 'green' ? 'bg-emerald-500' : 'bg-[#2563EB]/60')} />
      <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
        <input type="checkbox" className="mt-1.5 h-4 w-4 accent-[#2563EB]" checked={selected} onChange={onToggle} title="Select" />
        <button onClick={onOpen} className="min-w-48 flex-1 text-left">
          <div className="text-[17px] font-semibold leading-tight text-[#0B1F3A] group-hover:text-[#2563EB]">{lead.business_name}</div>
          <div className="mt-0.5 text-sm text-slate-500">{[lead.contact_person, [lead.city, lead.country].filter(Boolean).join(', '), lead.industry].filter(Boolean).join(' · ') || 'No details yet — open to add'}</div>
        </button>
        <select value={lead.status} onChange={(e) => run(async () => { await setLeadStatus(lead, e.target.value) }, 'Status updated')}
          className={cn('rounded-full border py-1.5 pl-3 pr-7 text-sm font-medium outline-none', tone2cls[tone] || tone2cls.slate)} title="Change status">
          {statuses.map((s) => <option key={s}>{s}</option>)}
        </select>
        <div className="flex min-w-24 items-center justify-end"><PartnerChip id={lead.assigned_to} /></div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 pl-8">
        {call ? <>
          <a href={`tel:${call}`} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-200"><Phone size={14} />{call}</a>
          <a target="_blank" rel="noreferrer" href={`https://wa.me/${(lead.whatsapp || lead.phone).replace(/\D/g, '')}`} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-100"><MessageCircle size={14} />WhatsApp</a>
        </> : <span className="text-sm text-slate-400">No phone yet</span>}
        <select value="" onChange={(e) => e.target.value && run(() => logLeadActivity(lead.id, { type: e.target.value }), `Logged: ${e.target.value}${['New Lead', 'Not Contacted', 'Ready to Contact'].includes(lead.status) ? ` — status is still "${lead.status}"; change it if you like` : ''}`)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-600 outline-none hover:border-slate-300" title="Record something you did">
          <option value="">+ I just did…</option>
          {ACTIVITY_TYPES.map((a) => <option key={a}>{a}</option>)}
        </select>
        <div className="ml-auto flex items-center gap-2">
          {lead.next_follow_up && !closed && <span className={cn('inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium', overdue ? 'bg-red-50 text-red-700' : dueToday ? 'bg-amber-50 text-amber-800' : 'bg-slate-50 text-slate-600')}><CalendarClock size={14} />Follow up: {whenLabel(lead.next_follow_up, t)}</span>}
          {!closed && <select value="" onChange={(e) => {
            const v = e.target.value; if (!v) return
            let d = ''
            if (v === 'pick') { const x = window.prompt('Follow-up date (YYYY-MM-DD)', addDays(t, 1)); if (!x || !/^\d{4}-\d{2}-\d{2}$/.test(x)) return; d = x } else d = addDays(t, Number(v))
            run(() => scheduleFollowUp(lead.id, d, lead.assigned_to), `Follow-up set for ${whenLabel(d, t)}`)
          }} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-600 outline-none hover:border-slate-300" title="Schedule a follow-up">
            <option value="">{lead.next_follow_up ? 'Reschedule…' : 'Set follow-up…'}</option>
            {FOLLOW_PICKS.map(([l, n]) => <option key={l} value={n}>{l}</option>)}<option value="pick">Pick a date…</option>
          </select>}
        </div>
      </div>
    </div>
  )
}

type Quick = 'all' | 'due' | 'new' | 'interested' | 'won'

export default function Leads({ market }: { market?: 'local' | 'international' }) {
  const allLeads = useTable('leads')
  const profiles = useTable('profiles')
  const statuses = useList('lead_statuses')
  const toast = useToast()
  const nav = useNavigate()
  const [view, setView] = useState<'list' | 'kanban'>('list')
  const [adding, setAdding] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [quick, setQuick] = useState<Quick>('all')
  const [q, setQ] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [f, setF] = useState({ status: '', partner: '', priority: '', source: '', industry: '', tag: '' })
  const fileRef = useRef<HTMLInputElement>(null)
  const t = today()

  const leads = useMemo(() => allLeads.filter((l) => !market || l.market === market), [allLeads, market])
  const open = (l: Row) => !['Won / Converted', 'Lost', 'Not Interested'].includes(l.status)
  const quickFns: Record<Quick, (l: Row) => boolean> = {
    all: () => true, due: (l) => open(l) && !!l.next_follow_up && l.next_follow_up <= t, new: (l) => ['New Lead', 'Not Contacted', 'Ready to Contact'].includes(l.status),
    interested: (l) => ['Interested', 'Meeting Scheduled', 'Negotiation', 'Proposal Sent', 'Follow-up Required'].includes(l.status), won: (l) => l.status === WON,
  }
  const search = q.trim().toLowerCase()
  const filtered = leads.filter((l) => quickFns[quick](l) && (!f.status || l.status === f.status) && (!f.partner || l.assigned_to === f.partner) && (!f.priority || l.priority === f.priority) && (!f.source || l.source === f.source) && (!f.industry || l.industry === f.industry) && (!f.tag || (l.tags || []).includes(f.tag))
    && (!search || [l.business_name, l.contact_person, l.email, l.phone, l.whatsapp, l.city, l.industry, l.notes, ...(l.tags || [])].some((v) => String(v ?? '').toLowerCase().includes(search))))
    .sort((a, b) => {
      // what needs attention first: overdue, then due today, then newest
      const rank = (l: Row) => (open(l) && l.next_follow_up ? (l.next_follow_up < t ? 0 : l.next_follow_up === t ? 1 : 3) : 2)
      return rank(a) - rank(b) || b.created_at.localeCompare(a.created_at)
    })
  const allTags = [...new Set(leads.flatMap((l) => l.tags || []))]
  const sources = [...new Set(leads.map((l) => l.source).filter(Boolean))], industries = [...new Set(leads.map((l) => l.industry).filter(Boolean))]
  const count = (k: Quick) => leads.filter(quickFns[k]).length

  async function importCsv(file: File) {
    const rows = parseCSV(await file.text())
    if (!rows.length) return toast('That CSV has no rows', 'err')
    let added = 0, dup = 0, bad = 0
    for (const r of rows) {
      const get = (k: string) => { const h = Object.keys(r).find((x) => ALIASES[k].includes(x.toLowerCase())); return h ? r[h] : '' }
      const base: Record<string, any> = {}
      for (const k of Object.keys(ALIASES)) base[k] = get(k)
      if (!base.business_name) { bad++; continue }
      if (findDuplicates(base).length) { dup++; continue }
      const mk = market || (/pakistan/i.test(base.country) || /^(\+?92|0?3\d{2})/.test((base.phone || '').replace(/[\s-]/g, '')) ? 'local' : 'international')
      const { tags, ...rest } = base
      await create('leads', { ...rest, deal_value: base.deal_value ? num(base.deal_value) : 0, currency: base.currency || (mk === 'local' ? 'PKR' : 'USD'), country: base.country || (mk === 'local' ? 'Pakistan' : ''),
        status: statuses.includes(base.status) ? base.status : 'New Lead', priority: PRIORITIES.includes((base.priority || '').toLowerCase()) ? base.priority.toLowerCase() : 'medium',
        tags: tags ? tags.split(/[;,]/).map((x: string) => x.trim()).filter(Boolean) : [], market: mk, assigned_to: getCurrentUserId(), services: [] }, { silent: true })
      added++
    }
    await import('../lib/services').then((s) => s.logActivity(`imported ${added} leads from CSV (${dup} duplicates skipped)`, 'leads'))
    toast(`Imported ${added} lead${added === 1 ? '' : 's'}. Skipped ${dup} duplicate${dup === 1 ? '' : 's'}${bad ? `, ${bad} without a business name` : ''}.`)
  }
  const exportCsv = () => downloadBlob(`${market || 'all'}-leads.csv`, toCSV(filtered.map((l) => ({ ...l, assigned: partnerName(l.assigned_to) })), [
    ['business_name', 'Business Name'], ['market', 'Market'], ['contact_person', 'Contact Person'], ['email', 'Email'], ['phone', 'Phone'], ['whatsapp', 'WhatsApp'], ['website', 'Website'], ['country', 'Country'], ['city', 'City'],
    ['industry', 'Industry'], ['business_type', 'Business Type'], ['source', 'Source'], ['assigned', 'Assigned'], ['status', 'Status'], ['priority', 'Priority'], ['deal_value', 'Deal Value'], ['currency', 'Currency'],
    ['services', 'Services'], ['tags', 'Tags'], ['next_follow_up', 'Next Follow-up'], ['last_contact', 'Last Contact'], ['notes', 'Notes'],
  ].map(([key, label]) => ({ key, label }))), 'text/csv;charset=utf-8')

  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const bulk = async (patch: Record<string, any>, label: string) => {
    for (const id of selected) await update('leads', id, patch, { silent: true })
    await import('../lib/services').then((s) => s.logActivity(`bulk-updated ${selected.size} leads (${label})`, 'leads'))
    toast(`${selected.size} leads updated`); setSelected(new Set())
  }
  const pill = (k: Quick, label: string, danger = false) => (
    <button key={k} onClick={() => setQuick(k)} className={cn('rounded-full border px-4 py-2 text-sm font-medium transition', quick === k ? 'border-[#0B1F3A] bg-[#0B1F3A] text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300')}>
      {label} <span className={cn('ml-1 rounded-full px-1.5 text-xs', quick === k ? 'bg-white/20' : danger && count(k) ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-500')}>{count(k)}</span>
    </button>
  )

  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#0B1F3A]">Leads</h1>
          <p className="mt-1 text-slate-500">{leads.length} {market === 'local' ? 'Pakistan' : market === 'international' ? 'international' : ''} lead{leads.length === 1 ? '' : 's'} · shared with your partner, live</p>
        </div>
        <div className="flex rounded-full border border-slate-200 bg-white p-1">
          {([[undefined, 'All', '/leads'], ['local', 'Pakistan', '/leads/local'], ['international', 'International', '/leads/international']] as const).map(([k, l, to]) => (
            <Link key={l} to={to} className={cn('rounded-full px-4 py-1.5 text-sm font-medium transition', market === k ? 'bg-[#2563EB] text-white shadow' : 'text-slate-600 hover:text-slate-900')}>{l}</Link>
          ))}
        </div>
      </div>

      <QuickAddLead market={market} onMore={() => setAdding(true)} />

      <div className="mb-4 mt-6 flex flex-wrap items-center gap-2">
        {pill('all', 'Everyone')}{pill('due', 'Follow up now', true)}{pill('new', 'Not contacted yet')}{pill('interested', 'Interested')}{pill('won', 'Won')}
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1 sm:max-w-sm"><Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, phone, city, notes…" className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm outline-none focus:border-[#2563EB] focus:ring-4 focus:ring-[#2563EB]/10" /></div>
        <button onClick={() => setShowFilters(!showFilters)} className={cn('inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2.5 text-sm font-medium', showFilters ? 'border-[#2563EB] text-[#2563EB]' : 'border-slate-200 bg-white text-slate-600')}><SlidersHorizontal size={15} /> Filters</button>
        <div className="flex rounded-xl border border-slate-200 bg-white p-0.5">
          {([['list', Table2, 'List'], ['kanban', LayoutGrid, 'Board']] as const).map(([k, I, l]) => <button key={k} onClick={() => setView(k)} className={cn('flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium', view === k ? 'bg-[#0B1F3A] text-white' : 'text-slate-600')}><I size={14} />{l}</button>)}
        </div>
        <div className="ml-auto flex gap-2">
          <input ref={fileRef} type="file" accept=".csv" hidden onChange={(e) => { const x = e.target.files?.[0]; if (x) importCsv(x); e.target.value = '' }} />
          <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}><Upload size={14} /> Import CSV</Button>
          <Button variant="secondary" size="sm" onClick={exportCsv}><Download size={14} /> Export</Button>
        </div>
      </div>
      {showFilters && (
        <div className="mb-4 flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-3 animate-in">
          <Select className="!w-auto" value={f.status} onChange={(v) => setF({ ...f, status: v })} placeholder="Any status" options={statuses} />
          <Select className="!w-auto" value={f.partner} onChange={(v) => setF({ ...f, partner: v })} placeholder="Both partners" options={profiles.map((p) => ({ value: p.id, label: p.short_name }))} />
          <Select className="!w-auto" value={f.priority} onChange={(v) => setF({ ...f, priority: v })} placeholder="Any priority" options={PRIORITIES} />
          {sources.length > 0 && <Select className="!w-auto" value={f.source} onChange={(v) => setF({ ...f, source: v })} placeholder="Any source" options={sources} />}
          {industries.length > 0 && <Select className="!w-auto" value={f.industry} onChange={(v) => setF({ ...f, industry: v })} placeholder="Any industry" options={industries} />}
          {allTags.length > 0 && <Select className="!w-auto" value={f.tag} onChange={(v) => setF({ ...f, tag: v })} placeholder="Any tag" options={allTags} />}
          <button className="text-sm text-slate-500 underline" onClick={() => setF({ status: '', partner: '', priority: '', source: '', industry: '', tag: '' })}>Clear</button>
        </div>
      )}

      {selected.size > 0 && (
        <div className="sticky top-20 z-10 mb-4 flex flex-wrap items-center gap-2 rounded-2xl bg-[#0B1F3A] p-3 text-sm text-white shadow-lg animate-in">
          <b>{selected.size} selected</b>
          <Select className="!w-auto !py-1.5" value="" onChange={(v) => v && bulk({ status: v }, `status → ${v}`)} placeholder="Change status…" options={statuses} />
          <PartnerSelect className="!w-auto !py-1.5" value="" onChange={(v) => v && bulk({ assigned_to: v }, `assigned to ${partnerName(v)}`)} placeholder="Give to…" />
          <Select className="!w-auto !py-1.5" value="" onChange={(v) => v && bulk({ priority: v }, `priority → ${v}`)} placeholder="Priority…" options={PRIORITIES} />
          <Button size="sm" variant="secondary" onClick={() => { const tag = window.prompt('Tag to add to selected leads'); if (tag) Promise.all([...selected].map((id) => { const l = allLeads.find((x) => x.id === id)!; return update('leads', id, { tags: [...new Set([...(l.tags || []), tag.trim()])] }, { silent: true }) })).then(() => { toast('Tag added'); setSelected(new Set()) }) }}>Add tag</Button>
          <Button size="sm" variant="danger" onClick={() => { if (window.confirm(`Permanently delete ${selected.size} leads and their history?`)) Promise.all([...selected].map((id) => remove('leads', id, { silent: true }))).then(() => { toast('Leads deleted'); setSelected(new Set()) }) }}>Delete</Button>
          <button className="ml-auto text-slate-300 hover:text-white" onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      )}

      {view === 'list' ? (
        filtered.length === 0 ? (
          <Card><Empty title={leads.length === 0 ? 'No leads yet — add your first one above' : 'No leads match this view'} hint={leads.length === 0 ? 'Type a business name and phone number, then press Enter. It takes five seconds.' : 'Try "Everyone" or clear your search and filters.'} /></Card>
        ) : (
          <div className="space-y-3">
            {filtered.map((l) => <LeadRow key={l.id} lead={l} statuses={statuses} selected={selected.has(l.id)} onToggle={() => toggle(l.id)} onOpen={() => nav(`/leads/${l.id}`)} />)}
          </div>
        )
      ) : (
        <Kanban leads={filtered} statuses={statuses.filter((s) => !LOST_STATUSES.includes(s) || filtered.some((l) => l.status === s))} onOpen={(id) => nav(`/leads/${id}`)} />
      )}
      <LeadForm open={adding} onClose={() => setAdding(false)} market={market || 'international'} />
    </>
  )
}

function Kanban({ leads, statuses, onOpen }: { leads: Row[]; statuses: string[]; onOpen: (id: string) => void }) {
  const toast = useToast()
  const [over, setOver] = useState<string | null>(null)
  const t = today()
  return (
    <div className="flex gap-3 overflow-x-auto pb-4">
      {statuses.map((s) => {
        const col = leads.filter((l) => l.status === s)
        return (
          <div key={s} onDragOver={(e) => { e.preventDefault(); setOver(s) }} onDragLeave={() => setOver(null)}
            onDrop={async (e) => { e.preventDefault(); setOver(null); const id = e.dataTransfer.getData('text/plain'); const l = leads.find((x) => x.id === id); if (l && (await setLeadStatus(l, s))) toast(`Moved to ${s}`) }}
            className={cn('w-64 shrink-0 rounded-xl bg-slate-100/80 p-2.5 transition', over === s && 'bg-blue-100 ring-2 ring-[#2563EB]/40')}>
            <div className="mb-2 flex items-center justify-between px-1"><span className="text-xs font-semibold text-slate-700">{s}</span><span className="rounded-full bg-white px-1.5 text-[11px] text-slate-500">{col.length}</span></div>
            <div className="space-y-2">
              {col.map((l) => (
                <Card key={l.id} className="cursor-grab p-3 active:cursor-grabbing">
                  <div draggable onDragStart={(e) => e.dataTransfer.setData('text/plain', l.id)} onClick={() => onOpen(l.id)}>
                    <div className="text-sm font-medium text-[#0B1F3A]">{l.business_name}</div>
                    <div className="mt-0.5 text-xs text-slate-500">{l.industry || l.contact_person}</div>
                    <div className="mt-2 flex items-center justify-between"><PartnerChip id={l.assigned_to} /><Badge tone={priorityTone(l.priority)}>{l.priority}</Badge></div>
                    {l.next_follow_up && <div className={cn('mt-2 text-[11px]', l.next_follow_up < t ? 'font-medium text-red-600' : 'text-slate-400')}>Follow-up {fmtDate(l.next_follow_up)}</div>}
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
