import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { useTable } from '../lib/db'
import { deleteInvoice, deleteInvoiceWarning, financeSummary, usePrefs } from '../lib/services'
import { fmtCompact, fmtDate, fmtMoney, num, today } from '../lib/util'
import { Badge, Button, Empty, PageHeader, Stat, statusTone, Tabs, useToast } from '../components/ui'
import { DataTable } from '../components/Entity'
import { INVOICE_STATUSES } from '../lib/constants'

export default function Invoices() {
  const nav = useNavigate()
  const toast = useToast()
  const invoices = useTable('invoices')
  const base = usePrefs().base_currency
  const [tab, setTab] = useState('all')
  const fin = financeSummary()
  const rows = tab === 'all' ? invoices : invoices.filter((i) => i.status === tab)
  const t = today()
  return (
    <>
      <PageHeader title="Invoices" sub="Branded invoices with partial payments and PDF export" actions={<Button onClick={() => nav('/invoices/new')}><Plus size={15} /> New invoice</Button>} />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Total invoiced" value={fmtCompact(fin.invoiced, base)} sub="excludes drafts & cancelled" /><Stat label="Outstanding" value={fmtCompact(fin.receivables, base)} tone={fin.receivables ? 'blue' : undefined} />
        <Stat label="Overdue invoices" value={invoices.filter((i) => i.status === 'Overdue').length} tone={invoices.some((i) => i.status === 'Overdue') ? 'red' : undefined} /><Stat label="Drafts" value={invoices.filter((i) => i.status === 'Draft').length} />
      </div>
      <div className="mb-4"><Tabs value={tab} onChange={setTab} tabs={[{ id: 'all', label: 'All', count: invoices.length }, ...INVOICE_STATUSES.map((s) => ({ id: s, label: s, count: invoices.filter((i) => i.status === s).length }))]} /></div>
      <DataTable rows={rows} exportName="invoices" onRowClick={(r) => nav(`/invoices/${r.id}`)} onDelete={(r) => { if (window.confirm(deleteInvoiceWarning(r.id))) deleteInvoice(r.id).then(() => toast('Invoice deleted')).catch((e) => toast(e.message, 'err')) }} initialSort={{ key: 'issue_date', dir: -1 }} searchKeys={['number', 'client_name', 'client_company', 'project_name', 'status']}
        empty={<Empty title="No invoices yet" hint="Create your first professional FRX invoice." action={<Button onClick={() => nav('/invoices/new')}><Plus size={14} /> New invoice</Button>} />}
        columns={[
          { key: 'number', label: 'Invoice', render: (r) => <span className="font-medium text-[#0B1F3A]">{r.number}</span> },
          { key: 'client_company', label: 'Client', render: (r) => <div><div>{r.client_company || r.client_name}</div><div className="text-xs text-slate-500">{r.project_name}</div></div> },
          { key: 'issue_date', label: 'Issued', render: (r) => fmtDate(r.issue_date) },
          { key: 'due_date', label: 'Due', render: (r) => <span className={r.due_date < t && num(r.balance) > 0 && !['Cancelled', 'Draft'].includes(r.status) ? 'font-medium text-red-600' : ''}>{fmtDate(r.due_date)}</span> },
          { key: 'status', label: 'Status', render: (r) => <Badge tone={statusTone(r.status)}>{r.status}</Badge> },
          { key: 'total', label: 'Total', align: 'right', render: (r) => fmtMoney(num(r.total), r.currency) },
          { key: 'balance', label: 'Balance', align: 'right', render: (r) => fmtMoney(num(r.balance), r.currency) },
        ]} />
    </>
  )
}
