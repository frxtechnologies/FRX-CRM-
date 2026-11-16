import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CLIENT_CATEGORIES, COUNTRIES, CURRENCIES, PAYMENT_STATUSES, SERVICES } from '../lib/constants'
import { getCurrentUserId } from '../lib/services'
import { useTable } from '../lib/db'
import { fmtCompact, fmtDate, num, today } from '../lib/util'
import { Badge, PageHeader, PartnerChip, statusTone, Tabs } from '../components/ui'
import { EntityManager, type FieldDef } from '../components/Entity'

export const clientFields: FieldDef[] = [
  { key: 'name', label: 'Client Name', required: true },
  { key: 'company', label: 'Company Name', required: true },
  { key: 'email', label: 'Email', type: 'email' },
  { key: 'phone', label: 'Phone' },
  { key: 'country', label: 'Country', type: 'select', options: COUNTRIES },
  { key: 'website', label: 'Website' },
  { key: 'address', label: 'Address', span: 2 },
  { key: 'industry', label: 'Industry' },
  { key: 'assigned_to', label: 'Assigned Partner', type: 'partner', default: () => getCurrentUserId() },
  { key: 'client_since', label: 'Client Since', type: 'date', default: () => today() },
  { key: 'category', label: 'Category', type: 'select', options: CLIENT_CATEGORIES, default: 'New' },
  { key: 'services', label: 'Services Purchased', type: 'multi', options: SERVICES },
  { key: 'contract_value', label: 'Contract Value', type: 'number' },
  { key: 'currency', label: 'Currency', type: 'select', options: [...CURRENCIES], default: 'USD' },
  { key: 'payment_status', label: 'Payment Status', type: 'select', options: PAYMENT_STATUSES, default: 'Pending' },
  { key: 'notes', label: 'Client Notes', type: 'textarea' },
]

export default function Clients() {
  const nav = useNavigate()
  const clients = useTable('clients'), projects = useTable('projects')
  const [cat, setCat] = useState('all')
  const count = (c: string) => clients.filter((x) => x.category === c).length
  return (
    <>
      <PageHeader title="Clients" sub="Enrolled clients. Convert a lead to carry over its details and history." />
      <div className="mb-4"><Tabs value={cat} onChange={setCat} tabs={[{ id: 'all', label: 'All', count: clients.length }, ...CLIENT_CATEGORIES.map((c) => ({ id: c, label: c, count: count(c) }))]} /></div>
      <EntityManager table="clients" noun="client" fields={clientFields} filterRows={(r) => (cat === 'all' ? r : r.filter((x) => x.category === cat))}
        initialSort={{ key: 'client_since', dir: -1 }} onRowClick={(r) => nav(`/clients/${r.id}`)}
        searchKeys={['name', 'company', 'email', 'phone', 'country', 'industry']}
        onDeleted={undefined}
        columns={[
          { key: 'company', label: 'Client', render: (r) => <div><div className="font-medium text-[#0B1F3A]">{r.company}</div><div className="text-xs text-slate-500">{r.name}</div></div> },
          { key: 'country', label: 'Country' },
          { key: 'category', label: 'Category', render: (r) => <Badge tone={statusTone(r.category)}>{r.category}</Badge> },
          { key: 'projects', label: 'Projects', render: (r) => projects.filter((p) => p.client_id === r.id).length, sortValue: (r) => projects.filter((p) => p.client_id === r.id).length, csv: (r) => projects.filter((p) => p.client_id === r.id).length },
          { key: 'contract_value', label: 'Contract', align: 'right', render: (r) => (num(r.contract_value) ? fmtCompact(num(r.contract_value), r.currency) : '—') },
          { key: 'payment_status', label: 'Payment', render: (r) => <Badge tone={statusTone(r.payment_status)}>{r.payment_status}</Badge> },
          { key: 'assigned_to', label: 'Owner', render: (r) => <PartnerChip id={r.assigned_to} /> },
          { key: 'client_since', label: 'Since', render: (r) => fmtDate(r.client_since) },
        ]} />
    </>
  )
}
