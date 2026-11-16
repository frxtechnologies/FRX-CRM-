import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Ban, CheckCircle2, Copy, Download, Pencil, Printer, Send, Trash2, Wallet } from 'lucide-react'
import { byId, useTable } from '../lib/db'
import { deleteInvoice, deleteInvoiceWarning, partnerName, recomputeInvoice, recordInvoicePayment, remove, update, useCompany, useInvoiceSettings } from '../lib/services'
import { buildInvoicePdf, invoiceFileName } from '../lib/pdf'
import { PAYMENT_METHODS } from '../lib/constants'
import { downloadBlob, fmtDate, fmtMoney, num, today } from '../lib/util'
import { Badge, Button, Card, CardHeader, Empty, Field, inputCls, Modal, Select, statusTone, useToast } from '../components/ui'

export default function InvoiceDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  const invoices = useTable('invoices'), allItems = useTable('invoice_items'), allPays = useTable('invoice_payments')
  const company = useCompany(), settings = useInvoiceSettings()
  const inv = invoices.find((i) => i.id === id)
  const [paying, setPaying] = useState(false)
  const [pay, setPay] = useState({ amount: '', date: today(), method: 'Bank Transfer', reference: '', notes: '' })
  const [busy, setBusy] = useState(false)
  if (!inv) return <Empty title="Invoice not found" />
  const items = allItems.filter((i) => i.invoice_id === id).sort((a, b) => num(a.position) - num(b.position))
  const pays = allPays.filter((p) => p.invoice_id === id).sort((a, b) => a.date.localeCompare(b.date))
  const locked = inv.status === 'Cancelled'
  const co = { ...company, ...Object.fromEntries(Object.entries((inv.company_info as Record<string, string>) || {}).filter(([, v]) => v)) } as typeof company & { address?: string }
  const extras: { label: string; value: string }[] = Array.isArray(inv.extra_fields) ? inv.extra_fields.filter((x: any) => x.label && x.value) : []

  const pdf = async () => buildInvoicePdf({ invoice: inv, items, payments: pays, company: co, footer: settings.footer })
  const run = async (fn: () => Promise<any>, ok: string) => { setBusy(true); try { await fn(); toast(ok) } catch (e: any) { toast(e.message || 'Failed', 'err') } finally { setBusy(false) } }

  return (
    <>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2"><h1 className="text-xl font-semibold text-[#0B1F3A]">{inv.number}</h1><Badge tone={statusTone(inv.status)}>{inv.status}</Badge></div>
          <p className="mt-1 text-sm text-slate-500">{inv.client_id ? <Link className="text-[#2563EB] hover:underline" to={`/clients/${inv.client_id}`}>{inv.client_company || inv.client_name}</Link> : inv.client_company || inv.client_name} • created by {partnerName(inv.created_by)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" loading={busy} onClick={() => run(async () => { const d = await pdf(); downloadBlob(invoiceFileName(inv), d.output('blob'), 'application/pdf') }, 'PDF downloaded')}><Download size={14} /> PDF</Button>
          <Button variant="secondary" loading={busy} onClick={() => run(async () => { const d = await pdf(); d.autoPrint(); const url = URL.createObjectURL(d.output('blob')); window.open(url, '_blank') }, 'Opened for printing')}><Printer size={14} /> Print</Button>
          <Button variant="secondary" onClick={() => nav(`/invoices/new?duplicate=${inv.id}`)}><Copy size={14} /> Duplicate</Button>
          {!locked && <Button variant="secondary" onClick={() => nav(`/invoices/${inv.id}/edit`)}><Pencil size={14} /> Edit</Button>}
          {inv.status === 'Draft' && <Button variant="secondary" onClick={() => run(async () => { await update('invoices', inv.id, { status: 'Sent' }); await recomputeInvoice(inv.id) }, 'Marked as sent')}><Send size={14} /> Mark sent</Button>}
          {!locked && inv.status !== 'Draft' && num(inv.balance) > 0 && <Button onClick={() => { setPay({ ...pay, amount: String(inv.balance) }); setPaying(true) }}><Wallet size={14} /> Record payment</Button>}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="rounded-t-xl bg-[#071426] p-6 text-white">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-center gap-3"><img src="/frx-logo.webp" className="h-14 w-14 rounded object-contain" alt="" /><div><div className="text-lg font-semibold">{co.name}</div><div className="text-xs text-[#60A5FA]">{[co.website, co.email, co.phone, co.address].filter(Boolean).join(' • ')}</div></div></div>
              <div className="text-right"><div className="text-2xl font-bold tracking-wide">INVOICE</div><div className="text-sm text-[#60A5FA]">{inv.number}</div></div>
            </div>
          </div>
          <div className="h-1 bg-[#2563EB]" />
          <div className="grid gap-6 p-6 text-sm sm:grid-cols-2">
            <div><p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Bill to</p><p className="font-semibold">{inv.client_company || inv.client_name}</p><p className="whitespace-pre-line text-slate-500">{[inv.client_company && inv.client_name, inv.client_email, inv.client_phone, inv.client_address].filter(Boolean).join('\n')}</p></div>
            <dl className="space-y-1">{([['Invoice date', fmtDate(inv.issue_date)], ['Due date', fmtDate(inv.due_date)], ['Currency', inv.currency], ['Project', inv.project_name], ...extras.map((x) => [x.label, x.value] as [string, string])] as [string, string][]).filter(([, v]) => v).map(([k, v]) => <div key={k} className="flex justify-between"><dt className="text-slate-500">{k}</dt><dd className="font-medium">{v}</dd></div>)}</dl>
          </div>
          <div className="overflow-x-auto px-6">
            <table className="w-full text-sm"><thead><tr className="bg-[#071426] text-left text-[11px] uppercase tracking-wide text-white"><th className="px-3 py-2">#</th><th className="px-3 py-2">Description</th><th className="px-3 py-2 text-right">Qty</th><th className="px-3 py-2 text-right">Unit price</th><th className="px-3 py-2 text-right">Amount</th></tr></thead>
              <tbody>{items.map((it, i) => <tr key={it.id} className={i % 2 ? '' : 'bg-slate-50'}><td className="px-3 py-2 text-slate-400">{i + 1}</td><td className="whitespace-pre-wrap px-3 py-2">{it.description}</td><td className="px-3 py-2 text-right">{num(it.quantity)}</td><td className="px-3 py-2 text-right tabular-nums">{fmtMoney(num(it.unit_price), inv.currency)}</td><td className="px-3 py-2 text-right font-medium tabular-nums">{fmtMoney(num(it.quantity) * num(it.unit_price), inv.currency)}</td></tr>)}</tbody></table>
          </div>
          <div className="flex justify-end p-6"><div className="w-full max-w-xs space-y-1.5 text-sm">
            <div className="flex justify-between text-slate-600"><span>Subtotal</span><span className="tabular-nums">{fmtMoney(num(inv.subtotal), inv.currency)}</span></div>
            {num(inv.discount) > 0 && <div className="flex justify-between text-slate-600"><span>Discount</span><span className="tabular-nums">- {fmtMoney(num(inv.discount), inv.currency)}</span></div>}
            {num(inv.tax_rate) > 0 && <div className="flex justify-between text-slate-600"><span>Tax ({num(inv.tax_rate)}%)</span><span className="tabular-nums">{fmtMoney(num(inv.tax_amount), inv.currency)}</span></div>}
            <div className="flex justify-between border-t pt-2 font-semibold"><span>Total</span><span className="tabular-nums">{fmtMoney(num(inv.total), inv.currency)}</span></div>
            {num(inv.amount_paid) > 0 && <div className="flex justify-between text-slate-600"><span>Amount paid</span><span className="tabular-nums">- {fmtMoney(num(inv.amount_paid), inv.currency)}</span></div>}
            <div className="flex justify-between rounded-lg bg-[#2563EB] px-3 py-2.5 font-semibold text-white"><span>{num(inv.balance) <= 0 && num(inv.total) > 0 ? 'Paid in full' : 'Balance due'}</span><span className="tabular-nums">{fmtMoney(num(inv.balance), inv.currency)}</span></div>
          </div></div>
          {(inv.payment_instructions || inv.payment_terms || inv.notes) && <div className="space-y-3 border-t border-slate-100 p-6 text-sm">{([['Payment instructions', inv.payment_instructions], ['Payment terms', inv.payment_terms], ['Notes', inv.notes]] as [string, string][]).filter(([, v]) => v).map(([k, v]) => <div key={k}><p className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-[#2563EB]">{k}</p><p className="whitespace-pre-wrap text-slate-600">{v}</p></div>)}</div>}
          {(inv.terms || []).length > 0 && <details className="border-t border-slate-100 p-6 text-sm"><summary className="cursor-pointer font-medium text-[#0B1F3A]">Terms & Conditions ({inv.terms.length} sections — included in the PDF)</summary><ol className="mt-3 space-y-2 text-slate-600">{inv.terms.map((t: any, i: number) => <li key={i}><b>{i + 1}. {t.title}</b><br />{t.body}</li>)}</ol></details>}
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Payments" sub={`${fmtMoney(num(inv.amount_paid), inv.currency)} of ${fmtMoney(num(inv.total), inv.currency)} received`} />
            {pays.length === 0 ? <p className="p-5 text-sm text-slate-500">No payments recorded yet.</p> : (
              <ul className="divide-y divide-slate-50 text-sm">{pays.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 px-5 py-3"><div><div className="font-medium tabular-nums">{fmtMoney(num(p.amount), inv.currency)}</div><div className="text-xs text-slate-500">{fmtDate(p.date)} • {p.method} • {partnerName(p.created_by)}{p.reference ? ` • ${p.reference}` : ''}</div></div>
                  {!locked && <button className="text-slate-300 hover:text-red-500" title="Remove payment" onClick={() => { if (window.confirm('Remove this payment? The matching income entry is removed and the balance is restored.')) run(async () => { await remove('invoice_payments', p.id); if (p.income_id && byId('income_transactions', p.income_id)) await remove('income_transactions', p.income_id, { silent: true }); await recomputeInvoice(inv.id) }, 'Payment removed') }}><Trash2 size={14} /></button>}</li>))}</ul>
            )}
          </Card>
          <Card className="p-5 text-sm">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Actions</p>
            <div className="space-y-2">
              {!locked && inv.status !== 'Paid' && <Button variant="danger" className="w-full" onClick={() => { if (window.confirm('Cancel this invoice? It stops counting as revenue and receivables. Recorded payments stay in income.')) run(async () => { await update('invoices', inv.id, { status: 'Cancelled', balance: 0 }) }, 'Invoice cancelled') }}><Ban size={14} /> Cancel invoice</Button>}
              <Button variant="danger" className="w-full" onClick={() => { if (window.confirm(deleteInvoiceWarning(inv.id))) run(async () => { await deleteInvoice(inv.id); nav('/invoices') }, 'Invoice deleted') }}><Trash2 size={14} /> Delete invoice</Button>
              {locked && <Button variant="secondary" className="w-full" onClick={() => run(async () => { await update('invoices', inv.id, { status: 'Draft' }); await recomputeInvoice(inv.id) }, 'Reopened as draft')}><CheckCircle2 size={14} /> Reopen as draft</Button>}
              <p className="text-[11px] text-slate-400">FRX OS never emails invoices on its own — download the PDF and send it yourself, then mark it as sent.</p>
            </div>
          </Card>
        </div>
      </div>

      <Modal open={paying} onClose={() => setPaying(false)} title="Record payment" footer={<><Button variant="secondary" onClick={() => setPaying(false)}>Cancel</Button>
        <Button loading={busy} onClick={() => run(async () => { await recordInvoicePayment(inv.id, { amount: num(pay.amount), date: pay.date, method: pay.method, reference: pay.reference, notes: pay.notes }); setPaying(false) }, 'Payment recorded — balance updated')}>Record payment</Button></>}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={`Amount (${inv.currency}) — balance ${fmtMoney(num(inv.balance), inv.currency)}`} className="sm:col-span-2"><input type="number" step="any" className={inputCls} value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} /></Field>
          <Field label="Date received"><input type="date" className={inputCls} value={pay.date} onChange={(e) => setPay({ ...pay, date: e.target.value })} /></Field>
          <Field label="Method"><Select value={pay.method} onChange={(v) => setPay({ ...pay, method: v })} options={PAYMENT_METHODS} /></Field>
          <Field label="Reference"><input className={inputCls} value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} /></Field>
          <Field label="Notes"><input className={inputCls} value={pay.notes} onChange={(e) => setPay({ ...pay, notes: e.target.value })} /></Field>
        </div>
        <p className="mt-3 text-xs text-slate-500">This also records the money as received income, in the invoice's currency.</p>
      </Modal>
    </>
  )
}
