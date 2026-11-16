import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ChevronDown, Plus, Trash2 } from 'lucide-react'
import { rawRemove, snapshot, useTable } from '../lib/db'
import { calcInvoice, create, currentRate, nextInvoiceNumber, recomputeInvoice, remove, saveSetting, update, useInvoiceSettings, useCompany } from '../lib/services'
import { CURRENCIES } from '../lib/constants'
import { addDays, cn, fmtMoney, num, today } from '../lib/util'
import { Button, Card, CardHeader, ClientSelect, Field, inputCls, PageHeader, ProjectSelect, Select, useToast } from '../components/ui'

type Item = { key: string; description: string; quantity: string; unit_price: string }
const blank = (): Item => ({ key: Math.random().toString(36).slice(2), description: '', quantity: '1', unit_price: '' })

export default function InvoiceEditor() {
  const { id } = useParams()
  const [sp] = useSearchParams()
  const nav = useNavigate()
  const toast = useToast()
  const clients = useTable('clients'), invoices = useTable('invoices'), allItems = useTable('invoice_items')
  const settings = useInvoiceSettings()
  const company = useCompany()
  const dupId = sp.get('duplicate')
  const existing = id ? invoices.find((i) => i.id === id) : undefined
  const source = existing || (dupId ? invoices.find((i) => i.id === dupId) : undefined)

  const [clientId, setClientId] = useState(sp.get('client') || '')
  const [mode, setMode] = useState<'existing' | 'new'>('existing')
  const [c, setC] = useState({ name: '', company: '', email: '', phone: '', address: '', saveClient: true })
  const [from, setFrom] = useState({ name: company.name, website: company.website, email: company.email, phone: company.phone, address: (company as any).address || '' })
  const [extras, setExtras] = useState<{ label: string; value: string }[]>([])
  const [projectId, setProjectId] = useState(sp.get('project') || '')
  const [projectName, setProjectName] = useState('')
  const [number, setNumber] = useState('')
  const [issue, setIssue] = useState(today())
  const [termsDays, setTermsDays] = useState(String(settings.payment_terms_days ?? 7))
  const [due, setDue] = useState(addDays(today(), settings.payment_terms_days ?? 7))
  const [currency, setCurrency] = useState('USD')
  const [rate, setRate] = useState('1')
  const [items, setItems] = useState<Item[]>([blank()])
  const [discount, setDiscount] = useState('0')
  const [tax, setTax] = useState(String(settings.tax_rate ?? 0))
  const [paymentTerms, setPaymentTerms] = useState('')
  const [instr, setInstr] = useState(settings.payment_instructions || '')
  const [notes, setNotes] = useState('')
  const [terms, setTerms] = useState<{ title: string; body: string }[]>(settings.terms || [])
  const [openTerm, setOpenTerm] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [ready, setReady] = useState(false)

  // initialise once (from existing/duplicate invoice, or defaults)
  useEffect(() => {
    if (ready) return
    if (id && !existing) return // wait for data
    if (source) {
      const its = allItems.filter((i) => i.invoice_id === source.id).sort((a, b) => num(a.position) - num(b.position))
      setClientId(source.client_id || ''); setMode(source.client_id ? 'existing' : 'new')
      setC({ name: source.client_name || '', company: source.client_company || '', email: source.client_email || '', phone: source.client_phone || '', address: source.client_address || '', saveClient: false })
      if (source.company_info?.name) setFrom({ name: source.company_info.name || '', website: source.company_info.website || '', email: source.company_info.email || '', phone: source.company_info.phone || '', address: source.company_info.address || '' })
      setExtras(Array.isArray(source.extra_fields) ? source.extra_fields : [])
      setProjectId(source.project_id || ''); setProjectName(source.project_name || '')
      setCurrency(source.currency); setRate(String(source.rate_to_base)); setDiscount(String(source.discount || 0)); setTax(String(source.tax_rate || 0))
      setPaymentTerms(source.payment_terms || ''); setInstr(source.payment_instructions || ''); setNotes(source.notes || ''); setTerms(source.terms || settings.terms || [])
      setItems(its.length ? its.map((i) => ({ key: i.id, description: i.description, quantity: String(i.quantity), unit_price: String(i.unit_price) })) : [blank()])
      if (existing) { setNumber(existing.number); setIssue(existing.issue_date); setDue(existing.due_date || ''); }
      else setNumber(nextInvoiceNumber())
    } else {
      setNumber(nextInvoiceNumber())
      const cl = clients.find((x) => x.id === clientId)
      if (cl) { setCurrency(cl.currency || 'USD'); setRate(String(currentRate(cl.currency || 'USD'))); setC((x) => ({ ...x, name: cl.name || '', company: cl.company || '', email: cl.email || '', phone: cl.phone || '', address: cl.address || '' })) } else setRate(String(currentRate('USD')))
    }
    setReady(true)
  }, [existing, source, clients.length, ready])

  const client = clients.find((x) => x.id === clientId)
  const totals = useMemo(() => calcInvoice(items, discount, tax), [items, discount, tax])
  const setItem = (k: string, patch: Partial<Item>) => setItems((x) => x.map((i) => (i.key === k ? { ...i, ...patch } : i)))
  const termsCustomised = JSON.stringify(terms) !== JSON.stringify(settings.terms || [])

  async function save(markSent: boolean) {
    const validItems = items.filter((i) => i.description.trim())
    if (!validItems.length) return toast('Add at least one service line with a description', 'err')
    if (validItems.some((i) => num(i.quantity) <= 0 || num(i.unit_price) < 0)) return toast('Check quantities and prices', 'err')
    if (mode === 'existing' && !clientId) return toast('Choose a client', 'err')
    if (!(c.name.trim() || c.company.trim())) return toast('Enter the client name or company', 'err')
    if (!number.trim()) return toast('Invoice number is required', 'err')
    if (snapshot('invoices').some((i) => i.number === number.trim() && i.id !== existing?.id)) return toast(`Invoice number ${number} already exists`, 'err')
    if (num(discount) > totals.subtotal) return toast('Discount cannot exceed the subtotal', 'err')
    setBusy(true)
    try {
      let cid = mode === 'existing' ? clientId : null
      const cname = c.name || c.company, ccompany = c.company || c.name, cemail = c.email, caddr = c.address
      if (mode === 'new') {
        if (c.saveClient) { const nc = await create('clients', { name: c.name || c.company, company: c.company || c.name, email: c.email, phone: c.phone, address: c.address, currency, category: 'New', payment_status: 'Pending', services: [], onboarding: [], client_since: today() }); cid = nc.id }
      }
      const proj = snapshot('projects').find((p) => p.id === projectId)
      const base = {
        number: number.trim(), client_id: cid, client_name: cname, client_company: ccompany, client_email: cemail, client_phone: c.phone, client_address: caddr,
        company_info: from, extra_fields: extras.filter((x) => x.label.trim() && x.value.trim()),
        project_id: projectId || null, project_name: proj?.name || projectName || null, issue_date: issue, due_date: due || null, currency, rate_to_base: num(rate) || currentRate(currency),
        discount: num(discount), tax_rate: num(tax), payment_terms: paymentTerms, payment_instructions: instr, notes, terms, ...totals,
      }
      let inv
      if (existing) {
        inv = await update('invoices', existing.id, { ...base, ...(markSent && existing.status === 'Draft' ? { status: 'Sent' } : {}) })
        for (const old of snapshot('invoice_items').filter((i) => i.invoice_id === existing.id)) await rawRemove('invoice_items', old.id)
      } else {
        inv = await create('invoices', { ...base, status: markSent ? 'Sent' : 'Draft', amount_paid: 0, balance: totals.total })
        // consume the number so the next suggestion advances
        const m = number.match(/(\d+)$/); if (m && num(m[1]) >= num(settings.next_number)) await saveSetting('invoice', { ...settings, next_number: num(m[1]) + 1 })
      }
      for (const [i, it] of validItems.entries()) await create('invoice_items', { invoice_id: inv.id, description: it.description.trim(), quantity: num(it.quantity), unit_price: num(it.unit_price), position: i }, { silent: true })
      await recomputeInvoice(inv.id)
      toast(existing ? 'Invoice updated' : markSent ? 'Invoice created and marked as sent' : 'Draft saved')
      nav(`/invoices/${inv.id}`)
    } catch (e: any) { toast(e.message || 'Could not save invoice', 'err') } finally { setBusy(false) }
  }

  if (existing?.status === 'Cancelled') return <Card className="p-8 text-center text-sm text-slate-500">Cancelled invoices cannot be edited. Duplicate it to start a new one.</Card>
  return (
    <>
      <PageHeader title={existing ? `Edit ${existing.number}` : dupId ? 'Duplicate invoice' : 'New invoice'} sub="Totals are calculated for you; defaults come from Settings → Invoice Settings." actions={<>
        <Button variant="secondary" onClick={() => nav(-1)}>Cancel</Button>
        {(!existing || existing.status === 'Draft') && <Button variant="secondary" loading={busy} onClick={() => save(false)}>{existing ? 'Save draft' : 'Save as draft'}</Button>}
        <Button loading={busy} onClick={() => save(true)}>{existing && existing.status !== 'Draft' ? 'Save changes' : 'Save & mark as sent'}</Button>
      </>} />
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader title="Client" action={<div className="flex rounded-lg border border-slate-200 p-0.5 text-xs">{(['existing', 'new'] as const).map((m) => <button key={m} onClick={() => setMode(m)} className={cn('rounded-md px-2.5 py-1', mode === m ? 'bg-[#0B1F3A] text-white' : 'text-slate-500')}>{m === 'existing' ? 'Existing client' : 'New client'}</button>)}</div>} />
            <div className="grid gap-3 p-5 sm:grid-cols-2">
              {mode === 'existing' && (
                <Field label="Client *" className="sm:col-span-2"><ClientSelect value={clientId} placeholder="Select client\u2026" onChange={(v) => {
                  setClientId(v)
                  const cl = clients.find((x) => x.id === v)
                  if (cl) { setC((x) => ({ ...x, name: cl.name || '', company: cl.company || '', email: cl.email || '', phone: cl.phone || '', address: cl.address || '' })); if (!existing) { setCurrency(cl.currency || currency); setRate(String(currentRate(cl.currency || currency))) } }
                }} /></Field>
              )}
              <p className="text-xs text-slate-500 sm:col-span-2">{mode === 'existing' ? 'Filled from the client profile. Change anything below for this invoice only \u2014 the client profile itself is not changed.' : 'Enter the client\'s details.'}</p>
              <Field label="Client name"><input className={inputCls} value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} /></Field>
              <Field label="Company"><input className={inputCls} value={c.company} onChange={(e) => setC({ ...c, company: e.target.value })} /></Field>
              <Field label="Email"><input className={inputCls} type="email" value={c.email} onChange={(e) => setC({ ...c, email: e.target.value })} /></Field>
              <Field label="Phone"><input className={inputCls} value={c.phone} onChange={(e) => setC({ ...c, phone: e.target.value })} /></Field>
              <Field label="Address" className="sm:col-span-2"><textarea rows={2} className={inputCls} value={c.address} onChange={(e) => setC({ ...c, address: e.target.value })} /></Field>
              {mode === 'new' && !existing && <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" className="accent-[#2563EB]" checked={c.saveClient} onChange={(e) => setC({ ...c, saveClient: e.target.checked })} />Also save as a client profile</label>}
              <Field label="Project (optional)"><ProjectSelect value={projectId} clientId={mode === 'existing' ? clientId : undefined} onChange={setProjectId} /></Field>
              {!projectId && <Field label="Or project name"><input className={inputCls} value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="e.g. Website redesign" /></Field>}
            </div>
          </Card>

          <Card>
            <CardHeader title="Your details on this invoice" sub="Prefilled from Settings \u2192 Company. Edit here to change this invoice only." />
            <div className="grid gap-3 p-5 sm:grid-cols-2">
              <Field label="Company name"><input className={inputCls} value={from.name} onChange={(e) => setFrom({ ...from, name: e.target.value })} /></Field>
              <Field label="Website"><input className={inputCls} value={from.website} onChange={(e) => setFrom({ ...from, website: e.target.value })} /></Field>
              <Field label="Email"><input className={inputCls} type="email" value={from.email} onChange={(e) => setFrom({ ...from, email: e.target.value })} /></Field>
              <Field label="Phone"><input className={inputCls} value={from.phone} onChange={(e) => setFrom({ ...from, phone: e.target.value })} /></Field>
              <Field label="Address (optional)" className="sm:col-span-2"><input className={inputCls} value={from.address} onChange={(e) => setFrom({ ...from, address: e.target.value })} placeholder="Office address to print on the invoice" /></Field>
            </div>
          </Card>

          <Card>
            <CardHeader title="Extra details" sub="Add any custom line shown next to the invoice details, such as PO number, tax ID or contract reference." />
            <div className="space-y-2 p-5">
              {extras.map((x, i) => (
                <div key={i} className="flex gap-2">
                  <input className={cn(inputCls, 'flex-1')} placeholder="Label (e.g. PO Number)" value={x.label} onChange={(e) => setExtras((a) => a.map((y, j) => (j === i ? { ...y, label: e.target.value } : y)))} />
                  <input className={cn(inputCls, 'flex-[2]')} placeholder="Value" value={x.value} onChange={(e) => setExtras((a) => a.map((y, j) => (j === i ? { ...y, value: e.target.value } : y)))} />
                  <button className="px-1 text-slate-300 hover:text-red-500" onClick={() => setExtras((a) => a.filter((_, j) => j !== i))}><Trash2 size={15} /></button>
                </div>
              ))}
              <Button variant="secondary" size="sm" onClick={() => setExtras((a) => [...a, { label: '', value: '' }])}><Plus size={13} /> Add a detail</Button>
            </div>
          </Card>

          <Card>
            <CardHeader title="Services" />
            <div className="space-y-2 p-5">
              <div className="hidden grid-cols-12 gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400 sm:grid"><span className="col-span-6">Description</span><span className="col-span-2">Qty</span><span className="col-span-2">Unit price</span><span className="col-span-2 text-right">Amount</span></div>
              {items.map((it) => (
                <div key={it.key} className="grid grid-cols-12 items-start gap-2">
                  <textarea rows={1} className={cn(inputCls, 'col-span-12 sm:col-span-6')} placeholder="Service / description" value={it.description} onChange={(e) => setItem(it.key, { description: e.target.value })} />
                  <input type="number" min="0" step="any" className={cn(inputCls, 'col-span-4 sm:col-span-2')} value={it.quantity} onChange={(e) => setItem(it.key, { quantity: e.target.value })} />
                  <input type="number" min="0" step="any" className={cn(inputCls, 'col-span-5 sm:col-span-2')} placeholder="0.00" value={it.unit_price} onChange={(e) => setItem(it.key, { unit_price: e.target.value })} />
                  <div className="col-span-3 flex items-center justify-end gap-1 pt-2 text-sm font-medium sm:col-span-2"><span className="tabular-nums">{fmtMoney(num(it.quantity) * num(it.unit_price), currency)}</span>
                    {items.length > 1 && <button className="text-slate-300 hover:text-red-500" onClick={() => setItems((x) => x.filter((i) => i.key !== it.key))}><Trash2 size={14} /></button>}</div>
                </div>
              ))}
              <Button variant="secondary" size="sm" onClick={() => setItems((x) => [...x, blank()])}><Plus size={13} /> Add line</Button>
            </div>
          </Card>

          <Card>
            <CardHeader title="Payment & notes" />
            <div className="grid gap-3 p-5">
              <Field label="Payment instructions"><textarea rows={4} className={inputCls} value={instr} onChange={(e) => setInstr(e.target.value)} placeholder="Bank name, account title, IBAN / account number, PayPal / Wise details…" /></Field>
              <Field label="Payment terms (shown on invoice)"><input className={inputCls} value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} placeholder={`e.g. Net ${termsDays} days — 50% advance`} /></Field>
              <Field label="Additional notes"><textarea rows={2} className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
            </div>
          </Card>

          <Card>
            <CardHeader title="Terms & Conditions" sub={termsCustomised ? 'Customised for this invoice — global defaults are unchanged' : 'Using global defaults. Edits here apply to this invoice only.'}
              action={termsCustomised ? <Button size="sm" variant="secondary" onClick={() => setTerms(settings.terms || [])}>Reset to defaults</Button> : undefined} />
            <div className="divide-y divide-slate-50">
              {terms.map((t, i) => (
                <div key={i}>
                  <button className="flex w-full items-center justify-between px-5 py-2.5 text-left text-sm font-medium hover:bg-slate-50" onClick={() => setOpenTerm(openTerm === i ? null : i)}><span>{i + 1}. {t.title}</span><ChevronDown size={14} className={cn('transition', openTerm === i && 'rotate-180')} /></button>
                  {openTerm === i && <div className="px-5 pb-3"><textarea rows={4} className={inputCls} value={t.body} onChange={(e) => setTerms((x) => x.map((y, j) => (j === i ? { ...y, body: e.target.value } : y)))} /></div>}
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Invoice details" />
            <div className="grid gap-3 p-5">
              <Field label="Invoice number"><input className={inputCls} value={number} onChange={(e) => setNumber(e.target.value)} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Invoice date"><input type="date" className={inputCls} value={issue} onChange={(e) => { setIssue(e.target.value); setDue(addDays(e.target.value, num(termsDays))) }} /></Field>
                <Field label="Net days"><input type="number" className={inputCls} value={termsDays} onChange={(e) => { setTermsDays(e.target.value); setDue(addDays(issue, num(e.target.value))) }} /></Field>
              </div>
              <Field label="Due date"><input type="date" className={inputCls} value={due} onChange={(e) => setDue(e.target.value)} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Currency"><Select value={currency} onChange={(v) => { setCurrency(v); setRate(String(currentRate(v))) }} options={[...CURRENCIES]} /></Field>
                <Field label="Rate to reporting"><input type="number" step="any" className={inputCls} value={rate} onChange={(e) => setRate(e.target.value)} /></Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label={`Discount (${currency})`}><input type="number" min="0" step="any" className={inputCls} value={discount} onChange={(e) => setDiscount(e.target.value)} /></Field>
                <Field label="Tax %"><input type="number" min="0" step="any" className={inputCls} value={tax} onChange={(e) => setTax(e.target.value)} /></Field>
              </div>
            </div>
          </Card>
          <Card className="p-5 text-sm">
            <div className="space-y-2">
              <div className="flex justify-between text-slate-600"><span>Subtotal</span><span className="tabular-nums">{fmtMoney(totals.subtotal, currency)}</span></div>
              {num(discount) > 0 && <div className="flex justify-between text-slate-600"><span>Discount</span><span className="tabular-nums">- {fmtMoney(num(discount), currency)}</span></div>}
              {num(tax) > 0 && <div className="flex justify-between text-slate-600"><span>Tax ({num(tax)}%)</span><span className="tabular-nums">{fmtMoney(totals.tax_amount, currency)}</span></div>}
              <div className="flex justify-between border-t border-slate-200 pt-3 text-base font-semibold text-[#0B1F3A]"><span>Total</span><span className="tabular-nums">{fmtMoney(totals.total, currency)}</span></div>
            </div>
          </Card>
        </div>
      </div>
    </>
  )
}
void remove
