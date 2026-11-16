import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { FilePlus2, Pencil, Upload } from 'lucide-react'
import { uploadFile, useTable } from '../lib/db'
import { create, partnerName, update } from '../lib/services'
import { CLIENT_CATEGORIES, ONBOARDING_STEPS, PAYMENT_STATUSES } from '../lib/constants'
import { fmtCompact, fmtDate, fmtDateTime, num } from '../lib/util'
import { Badge, Button, Card, CardHeader, Empty, PartnerChip, Select, statusTone, Tabs, useToast } from '../components/ui'
import { DataTable, FormModal, initialValues } from '../components/Entity'
import { clientFields } from './Clients'
import VaultPanel from '../components/VaultPanel'

export default function ClientDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  const vault = useTable('vault_items'), clients = useTable('clients'), projects = useTable('projects'), invoices = useTable('invoices'), payments = useTable('invoice_payments'), docs = useTable('documents'), acts = useTable('lead_activities'), leads = useTable('leads')
  const client = clients.find((c) => c.id === id)
  const [tab, setTab] = useState('overview')
  const [editing, setEditing] = useState(false)
  if (!client) return <Empty title="Client not found" />
  const lead = leads.find((l) => l.id === client.lead_id)
  const myProjects = projects.filter((p) => p.client_id === id)
  const myInvoices = invoices.filter((i) => i.client_id === id)
  const myPayments = payments.filter((p) => myInvoices.some((i) => i.id === p.invoice_id))
  const myDocs = docs.filter((d) => d.client_id === id)
  const history = lead ? acts.filter((a) => a.lead_id === lead.id).sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)) : []
  const done: string[] = client.onboarding || []
  const outstanding = myInvoices.filter((i) => !['Draft', 'Cancelled'].includes(i.status)).reduce((s, i) => s + num(i.balance), 0)

  return (
    <>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2"><h1 className="text-xl font-semibold text-[#0B1F3A]">{client.company}</h1><Badge tone={statusTone(client.category)}>{client.category}</Badge></div>
          <p className="mt-1 text-sm text-slate-500">{client.name} • client since {fmtDate(client.client_since)} • owner {partnerName(client.assigned_to)}{lead && <> • from lead <Link className="text-[#2563EB] hover:underline" to={`/leads/${lead.id}`}>{lead.business_name}</Link></>}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setEditing(true)}><Pencil size={14} /> Edit</Button>
          <Button variant="secondary" onClick={() => nav(`/invoices/new?client=${id}`)}><FilePlus2 size={14} /> New invoice</Button>
          <Button onClick={() => nav(`/projects?new=1&client=${id}`)}>New project</Button>
        </div>
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'overview', label: 'Overview' }, { id: 'projects', label: 'Projects', count: myProjects.length }, { id: 'invoices', label: 'Invoices', count: myInvoices.length }, { id: 'payments', label: 'Payment history', count: myPayments.length }, { id: 'comms', label: 'Communication', count: history.length }, { id: 'logins', label: 'Logins', count: vault.filter((v) => v.client_id === id).length }, { id: 'docs', label: 'Documents', count: myDocs.length }]} />
      <div className="mt-4">
        {tab === 'overview' && (
          <div className="grid gap-5 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader title="Contact & contract" />
              <dl className="grid gap-x-8 px-5 py-3 text-sm sm:grid-cols-2">
                {([['Email', client.email], ['Phone', client.phone], ['Website', client.website], ['Country', client.country], ['Address', client.address], ['Industry', client.industry], ['Services', (client.services || []).join(', ')], ['Contract value', num(client.contract_value) ? fmtCompact(num(client.contract_value), client.currency) : ''], ['Outstanding', outstanding ? fmtCompact(outstanding, myInvoices[0]?.currency || client.currency) : 'None']] as [string, string][]).map(([k, v]) => <div key={k} className="flex justify-between gap-4 border-b border-slate-50 py-2"><dt className="text-slate-500">{k}</dt><dd className="text-right font-medium">{v || '—'}</dd></div>)}
              </dl>
              <div className="flex flex-wrap gap-3 border-t border-slate-100 p-4">
                <div><p className="mb-1 text-xs text-slate-500">Category</p><Select className="!w-auto" value={client.category} onChange={(v) => update('clients', client.id, { category: v })} options={CLIENT_CATEGORIES} /></div>
                <div><p className="mb-1 text-xs text-slate-500">Payment status</p><Select className="!w-auto" value={client.payment_status} onChange={(v) => update('clients', client.id, { payment_status: v })} options={PAYMENT_STATUSES} /></div>
              </div>
              {client.notes && <div className="border-t border-slate-100 p-5 text-sm"><p className="mb-1 text-xs font-semibold text-slate-500">Internal notes</p><p className="whitespace-pre-wrap text-slate-700">{client.notes}</p></div>}
            </Card>
            <Card>
              <CardHeader title="Onboarding checklist" sub={`${done.length}/${ONBOARDING_STEPS.length} complete`} />
              <ul className="space-y-1 p-4">
                {ONBOARDING_STEPS.map((s) => {
                  const on = done.includes(s)
                  return <li key={s}><label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50"><input type="checkbox" className="h-4 w-4 accent-[#2563EB]" checked={on} onChange={() => update('clients', client.id, { onboarding: on ? done.filter((x) => x !== s) : [...done, s] }, { summary: `${on ? 'unchecked' : 'completed'} onboarding step "${s}" for ${client.company}` })} /><span className={on ? 'text-slate-400 line-through' : ''}>{s}</span></label></li>
                })}
              </ul>
            </Card>
          </div>
        )}
        {tab === 'projects' && <DataTable rows={myProjects} onRowClick={(r) => nav(`/projects/${r.id}`)} columns={[{ key: 'name', label: 'Project' }, { key: 'status', label: 'Status', render: (r) => <Badge tone={statusTone(r.status)}>{r.status}</Badge> }, { key: 'due_date', label: 'Due', render: (r) => fmtDate(r.due_date) }, { key: 'amount', label: 'Amount', align: 'right', render: (r) => fmtCompact(num(r.amount), r.currency) }, { key: 'assigned_to', label: 'Owner', render: (r) => <PartnerChip id={r.assigned_to} /> }]} empty={<Empty title="No projects yet" />} />}
        {tab === 'invoices' && <DataTable rows={myInvoices} onRowClick={(r) => nav(`/invoices/${r.id}`)} columns={[{ key: 'number', label: 'Invoice' }, { key: 'issue_date', label: 'Issued', render: (r) => fmtDate(r.issue_date) }, { key: 'status', label: 'Status', render: (r) => <Badge tone={statusTone(r.status)}>{r.status}</Badge> }, { key: 'total', label: 'Total', align: 'right', render: (r) => fmtCompact(num(r.total), r.currency) }, { key: 'balance', label: 'Balance', align: 'right', render: (r) => fmtCompact(num(r.balance), r.currency) }]} empty={<Empty title="No invoices yet" />} />}
        {tab === 'payments' && <DataTable rows={myPayments} columns={[{ key: 'date', label: 'Date', render: (r) => fmtDate(r.date) }, { key: 'invoice_id', label: 'Invoice', render: (r) => invoices.find((i) => i.id === r.invoice_id)?.number }, { key: 'amount', label: 'Amount', align: 'right', render: (r) => fmtCompact(num(r.amount), invoices.find((i) => i.id === r.invoice_id)?.currency) }, { key: 'method', label: 'Method' }, { key: 'reference', label: 'Reference' }, { key: 'created_by', label: 'Recorded by', render: (r) => partnerName(r.created_by) }]} empty={<Empty title="No payments yet" />} />}
        {tab === 'comms' && (
          <Card>
            {!lead ? <Empty title="Created directly, not from a lead" hint="Communication history carries over automatically when a lead is converted." /> : history.length === 0 ? <Empty title="No recorded communication" /> : (
              <ul className="divide-y divide-slate-50">{history.map((a) => <li key={a.id} className="px-5 py-3 text-sm"><b>{a.type}</b> <span className="text-xs text-slate-400">{fmtDateTime(a.occurred_at)} • {partnerName(a.user_id)}</span>{a.notes && <p className="text-slate-600">{a.notes}</p>}</li>)}</ul>
            )}
          </Card>
        )}
        {tab === 'logins' && <VaultPanel clientId={id} />}
        {tab === 'docs' && (
          <Card className="p-5">
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-200 p-5 text-sm text-slate-500 hover:border-[#2563EB]"><Upload size={16} /> Upload contract, requirements or other document
              <input type="file" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; try { const url = await uploadFile(f); await create('documents', { name: f.name, category: 'Contracts', file_url: url, mime: f.type, size: f.size, client_id: id }); toast('Uploaded') } catch (er: any) { toast(er.message, 'err') } e.target.value = '' }} /></label>
            <ul className="mt-3 divide-y divide-slate-50 text-sm">{myDocs.map((d) => <li key={d.id} className="py-2">{d.name} <span className="text-xs text-slate-400">{d.category} • {fmtDate(d.created_at)}</span></li>)}</ul>
          </Card>
        )}
      </div>
      <FormModal open={editing} onClose={() => setEditing(false)} title="Edit client" fields={clientFields} initial={initialValues(clientFields, client)} onSubmit={async (v) => { await update('clients', client.id, v); toast('Client updated') }} />
    </>
  )
}
