import { useMemo, useState } from 'react'
import { Download, FileSpreadsheet, FileText } from 'lucide-react'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { useTable, snapshot, byId } from '../lib/db'
import { financeSummary, monthlyCostBase, partnerName, subEffectiveStatus, toBase, usePrefs, useCompany } from '../lib/services'
import { WON } from '../lib/constants'
import { downloadBlob, fmtMoney, num, toCSV, today } from '../lib/util'
import { loadLogo } from '../lib/pdf'
import { Button, Card, CardHeader, Field, inputCls, PageHeader, Select } from '../components/ui'

type Report = { title: string; cols: string[]; rows: (string | number)[][] }
const TYPES = ['Leads', 'Clients', 'Sales', 'Revenue', 'Expenses', 'Profit and Loss', 'Investments', 'Subscriptions', 'Projects', 'Tasks', 'Partner Performance'] as const

function build(type: string, from: string, to: string, base: string): Report {
  const inR = (d?: string) => !!d && (!from || d.slice(0, 10) >= from) && (!to || d.slice(0, 10) <= to)
  const S = snapshot
  switch (type) {
    case 'Leads': return { title: 'Leads', cols: ['Business', 'Market', 'Contact', 'Email', 'Phone', 'Country', 'Industry', 'Source', 'Status', 'Priority', 'Owner', 'Deal value', 'Currency', 'Added', 'Next follow-up'],
      rows: S('leads').filter((l) => inR(l.created_at)).map((l) => [l.business_name, l.market, l.contact_person || '', l.email || '', l.phone || '', l.country || '', l.industry || '', l.source || '', l.status, l.priority, partnerName(l.assigned_to), num(l.deal_value), l.currency || '', l.created_at.slice(0, 10), l.next_follow_up || '']) }
    case 'Clients': return { title: 'Clients', cols: ['Company', 'Name', 'Email', 'Country', 'Category', 'Payment status', 'Contract value', 'Currency', 'Owner', 'Since'],
      rows: S('clients').filter((c) => inR(c.client_since)).map((c) => [c.company, c.name, c.email || '', c.country || '', c.category, c.payment_status, num(c.contract_value), c.currency, partnerName(c.assigned_to), c.client_since || '']) }
    case 'Sales': return { title: 'Sales (won deals)', cols: ['Business', 'Market', 'Source', 'Owner', 'Deal value', 'Currency', 'Won / updated'],
      rows: S('leads').filter((l) => l.status === WON && inR(l.updated_at)).map((l) => [l.business_name, l.market, l.source || '', partnerName(l.assigned_to), num(l.deal_value), l.currency || '', l.updated_at.slice(0, 10)]) }
    case 'Revenue': return { title: 'Revenue (cash received)', cols: ['Date', 'Transaction', 'Client', 'Amount', 'Currency', `In ${base}`, 'Method', 'Reference', 'Recorded by'],
      rows: S('income_transactions').filter((i) => inR(i.date)).map((i) => [i.date, i.name, byId('clients', i.client_id)?.company || '', num(i.amount), i.currency, toBase(num(i.amount), i.rate_to_base), i.method || '', i.reference || '', partnerName(i.created_by)]) }
    case 'Expenses': return { title: 'Expenses', cols: ['Date', 'Expense', 'Category', 'Amount', 'Currency', `In ${base}`, 'Method', 'Recorded by'],
      rows: S('expense_transactions').filter((e) => inR(e.date)).map((e) => [e.date, e.name, e.category, num(e.amount), e.currency, toBase(num(e.amount), e.rate_to_base), e.method || '', partnerName(e.created_by)]) }
    case 'Profit and Loss': { const f = financeSummary({ from: from || undefined, to: to || undefined }); return { title: `Profit and Loss (${base})`, cols: ['Line', `Amount (${base})`], rows: [['Invoiced revenue', f.invoiced], ['Direct income (not invoiced)', f.directIncome], [`Recognized revenue (${f.basis})`, f.revenue], ['Business expenses', f.expenses], ['Net operating profit', f.netProfit], ['Cash received', f.cashReceived], ['Outstanding receivables (now)', f.receivables], ['Founder / other investment (not revenue)', f.investments], ['Net cash position', f.netCash]] } }
    case 'Investments': return { title: 'Investments', cols: ['Date', 'Investor', 'Amount', 'Currency', `In ${base}`, 'Purpose'],
      rows: S('investments').filter((i) => inR(i.date)).map((i) => [i.date, i.investor + (i.investor_name ? ` - ${i.investor_name}` : ''), num(i.amount), i.currency, toBase(num(i.amount), i.rate_to_base), i.purpose || '']) }
    case 'Subscriptions': return { title: 'Subscriptions', cols: ['Name', 'Provider', 'Category', 'Cost', 'Currency', 'Cycle', `Monthly (${base})`, 'Renewal', 'Expires', 'Renewal type', 'Status', 'Responsible'],
      rows: S('subscriptions').map((s) => [s.name, s.provider || '', s.category, num(s.amount), s.currency, s.billing_cycle, monthlyCostBase(s), s.renewal_date || '', s.expiration_date || '', s.recurring ? 'auto' : 'manual', subEffectiveStatus(s), partnerName(s.responsible_to)]) }
    case 'Projects': return { title: 'Projects', cols: ['Project', 'Client', 'Status', 'Priority', 'Start', 'Delivery', 'Completed', 'Amount', 'Currency', 'Owner'],
      rows: S('projects').filter((p) => !from && !to ? true : inR(p.start_date || p.created_at)).map((p) => [p.name, byId('clients', p.client_id)?.company || '', p.status, p.priority, p.start_date || '', p.due_date || '', p.completed_date || '', num(p.amount), p.currency, partnerName(p.assigned_to)]) }
    case 'Tasks': return { title: 'Tasks', cols: ['Task', 'Category', 'Status', 'Priority', 'Due', 'Assigned', 'Created by'],
      rows: S('business_tasks').filter((t) => inR(t.created_at)).map((t) => [t.title, t.category, t.status, t.priority, t.due_date || '', partnerName(t.assigned_to), partnerName(t.created_by)]) }
    default: return { title: 'Partner performance', cols: ['Partner', 'Leads added', 'Leads owned', 'Activities logged', 'Follow-ups completed', 'Tasks completed', 'Deals won'],
      rows: S('profiles').map((p) => [p.short_name, S('leads').filter((l) => l.created_by === p.id && inR(l.created_at)).length, S('leads').filter((l) => l.assigned_to === p.id).length, S('lead_activities').filter((a) => a.user_id === p.id && inR(a.occurred_at)).length, S('follow_ups').filter((f) => f.completed_by === p.id && inR(f.completed_at || '')).length, S('business_tasks').filter((t) => t.assigned_to === p.id && t.status === 'Completed' && inR(t.completed_at || '')).length, S('leads').filter((l) => l.assigned_to === p.id && l.status === WON).length]) }
  }
}

export default function Reports() {
  const base = usePrefs().base_currency
  const company = useCompany()
  ;['leads', 'clients', 'projects', 'business_tasks', 'income_transactions', 'expense_transactions', 'investments', 'subscriptions', 'follow_ups', 'lead_activities', 'invoices'].forEach(() => {})
  useTable('leads'); useTable('clients'); useTable('income_transactions'); useTable('expense_transactions'); useTable('invoices'); useTable('subscriptions'); useTable('projects'); useTable('business_tasks'); useTable('investments'); useTable('follow_ups'); useTable('lead_activities')
  const [type, setType] = useState<string>('Leads')
  const [from, setFrom] = useState(''), [to, setTo] = useState('')
  const rep = useMemo(() => build(type, from, to, base), [type, from, to, base, snapshot('leads'), snapshot('income_transactions'), snapshot('expense_transactions'), snapshot('invoices'), snapshot('subscriptions'), snapshot('projects'), snapshot('business_tasks'), snapshot('clients'), snapshot('investments')])
  const stamp = `${rep.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${today()}`
  const objs = rep.rows.map((r) => Object.fromEntries(r.map((v, i) => [String(i), v])))
  const colDefs = rep.cols.map((c, i) => ({ key: String(i), label: c }))

  const excel = () => {
    const esc = (s: any) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    const html = `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body><table border="1"><tr>${rep.cols.map((c) => `<th style="background:#0B1F3A;color:#fff">${esc(c)}</th>`).join('')}</tr>${rep.rows.map((r) => `<tr>${r.map((v) => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</table></body></html>`
    downloadBlob(`${stamp}.xls`, html, 'application/vnd.ms-excel')
  }
  const pdf = async () => {
    const doc = new jsPDF({ orientation: rep.cols.length > 7 ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' })
    const W = doc.internal.pageSize.getWidth()
    doc.setFillColor(7, 20, 38); doc.rect(0, 0, W, 24, 'F'); doc.setFillColor(37, 99, 235); doc.rect(0, 24, W, 1, 'F')
    const logo = await loadLogo(); if (logo) doc.addImage(logo, 'PNG', 10, 3, 18, 18)
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.text(`${company.name} - ${rep.title}`, 32, 12)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(96, 165, 250); doc.text(`${from || 'start'} to ${to || 'today'}  |  generated ${today()}  |  ${rep.rows.length} rows`, 32, 18)
    autoTable(doc, { startY: 32, head: [rep.cols], body: rep.rows.map((r) => r.map((v) => (typeof v === 'number' ? v.toLocaleString('en-US', { maximumFractionDigits: 2 }) : String(v)))), styles: { fontSize: 7.5, cellPadding: 1.8 }, headStyles: { fillColor: [11, 31, 58], textColor: 255 }, alternateRowStyles: { fillColor: [247, 249, 252] }, margin: { left: 10, right: 10 } })
    doc.save(`${stamp}.pdf`)
  }
  void fmtMoney
  return (
    <>
      <PageHeader title="Reports & Exports" sub="Generate a report, then download it as PDF, CSV or Excel." />
      <Card className="mb-5">
        <div className="grid gap-3 p-5 sm:grid-cols-4">
          <Field label="Report"><Select value={type} onChange={setType} options={[...TYPES]} /></Field>
          <Field label="From"><input type="date" className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="To"><input type="date" className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} /></Field>
          <div className="flex items-end gap-2">
            <Button onClick={pdf}><FileText size={14} /> PDF</Button>
            <Button variant="secondary" onClick={() => downloadBlob(`${stamp}.csv`, toCSV(objs, colDefs), 'text/csv;charset=utf-8')}><Download size={14} /> CSV</Button>
            <Button variant="secondary" onClick={excel}><FileSpreadsheet size={14} /> Excel</Button>
          </div>
        </div>
        {['Subscriptions'].includes(type) && <p className="px-5 pb-4 text-xs text-slate-400">Date range does not apply to subscriptions.</p>}
      </Card>
      <Card>
        <CardHeader title={rep.title} sub={`${rep.rows.length} row${rep.rows.length === 1 ? '' : 's'}`} />
        <div className="max-h-[32rem] overflow-auto"><table className="w-full text-sm"><thead className="sticky top-0"><tr className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">{rep.cols.map((c) => <th key={c} className="whitespace-nowrap px-4 py-2.5">{c}</th>)}</tr></thead>
          <tbody>{rep.rows.map((r, i) => <tr key={i} className="border-b border-slate-50">{r.map((v, j) => <td key={j} className="whitespace-nowrap px-4 py-2 text-slate-700">{typeof v === 'number' ? v.toLocaleString('en-US', { maximumFractionDigits: 2 }) : v}</td>)}</tr>)}
            {rep.rows.length === 0 && <tr><td colSpan={rep.cols.length} className="p-8 text-center text-slate-500">No records in this range.</td></tr>}</tbody></table></div>
      </Card>
    </>
  )
}
