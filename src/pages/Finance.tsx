import { useMemo, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { byId, useTable, useVersion, type Row } from '../lib/db'
import { currentRate, financeSummary, getCurrentUserId, partnerName, toBase, useList, usePrefs } from '../lib/services'
import { CURRENCIES, INVESTORS, PAYMENT_METHODS } from '../lib/constants'
import { cn, fmtCompact, fmtDate, fmtMoney, isoDate, monthKey, num, today } from '../lib/util'
import { Badge, Card, CardHeader, PageHeader, Select, Stat, Tabs } from '../components/ui'
import { EntityManager, type FieldDef } from '../components/Entity'
import { useSetting } from '../lib/services'


function MoneyTabs() {
  return (
    <div className="mb-5 flex gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1 w-fit max-w-full">
      {([['/finance/pnl', 'Profit & Loss'], ['/finance/income', 'Money in'], ['/finance/expenses', 'Money out'], ['/finance/investments', 'Investments']] as const).map(([to, l]) => (
        <NavLink key={to} to={to} className={({ isActive }) => cn('whitespace-nowrap rounded-xl px-4 py-2 text-sm font-medium transition', isActive ? 'bg-[#2563EB] text-white shadow' : 'text-slate-600 hover:text-slate-900')}>{l}</NavLink>
      ))}
    </div>
  )
}

const money = (r: Row) => fmtMoney(num(r.amount), r.currency)
const baseAmt = (r: Row) => toBase(num(r.amount), r.rate_to_base)
const rateField: FieldDef = { key: 'rate_to_base', label: 'Rate to reporting currency', type: 'number', hint: 'Units of the reporting currency per 1 unit of this currency, saved with the transaction. Defaults from Settings → Currency.' }

export function Income() {
  const base = usePrefs().base_currency
  const fields: FieldDef[] = [
    { key: 'name', label: 'Transaction Name', required: true, span: 2 },
    { key: 'client_id', label: 'Client', type: 'client' }, { key: 'project_id', label: 'Related Project', type: 'project' },
    { key: 'amount', label: 'Amount received', type: 'number', required: true },
    { key: 'currency', label: 'Currency', type: 'currency', default: base },
    { ...rateField, default: 1 },
    { key: 'date', label: 'Date', type: 'date', required: true },
    { key: 'method', label: 'Payment Method', type: 'select', options: PAYMENT_METHODS }, { key: 'reference', label: 'Reference Number' },
    { key: 'notes', label: 'Notes', type: 'textarea' },
  ]
  return (
    <>
      <MoneyTabs />
      <PageHeader title="Income" sub="Money actually received. Unpaid invoices are never counted here — payments recorded on an invoice appear automatically." />
      <EntityManager table="income_transactions" noun="income entry" createLabel="Record income" fields={fields} initialSort={{ key: 'date', dir: -1 }} searchKeys={['name', 'reference', 'method', 'notes']}
        beforeSave={(v) => { if (v.invoice_id) throw new Error('Edit invoice payments from the invoice'); return { ...v, rate_to_base: num(v.rate_to_base) || currentRate(v.currency) } }}
        columns={[
          { key: 'date', label: 'Date', render: (r) => fmtDate(r.date) }, { key: 'name', label: 'Transaction', render: (r) => <div><div className="font-medium text-[#0B1F3A]">{r.name}</div><div className="text-xs text-slate-500">{byId('clients', r.client_id)?.company}</div></div> },
          { key: 'amount', label: 'Amount', align: 'right', render: money }, { key: 'base', label: `In ${base}`, align: 'right', render: (r) => fmtCompact(baseAmt(r), base), sortValue: baseAmt, csv: baseAmt },
          { key: 'method', label: 'Method' }, { key: 'invoice_id', label: 'Invoice', render: (r) => (r.invoice_id ? <Link className="text-[#2563EB]" to={`/invoices/${r.invoice_id}`}>{byId('invoices', r.invoice_id)?.number}</Link> : 'Direct') },
          { key: 'created_by', label: 'Recorded by', render: (r) => partnerName(r.created_by) },
        ]} />
    </>
  )
}

export function Expenses() {
  const base = usePrefs().base_currency
  const cats = useList('expense_categories')
  const fields: FieldDef[] = [
    { key: 'name', label: 'Expense Name', required: true, span: 2 },
    { key: 'category', label: 'Category', type: 'select', options: cats, default: 'Other' },
    { key: 'amount', label: 'Amount', type: 'number', required: true },
    { key: 'currency', label: 'Currency', type: 'currency', default: base }, { ...rateField, default: 1 },
    { key: 'date', label: 'Date', type: 'date', required: true },
    { key: 'method', label: 'Payment Method', type: 'select', options: PAYMENT_METHODS },
    { key: 'description', label: 'Description', type: 'textarea' },
    { key: 'receipt_url', label: 'Receipt Upload', type: 'file' },
  ]
  return (
    <>
      <MoneyTabs />
      <PageHeader title="Expenses" sub="Where the money goes. Each entry keeps its own currency and the rate used for reporting." />
      <EntityManager table="expense_transactions" noun="expense" fields={fields} initialSort={{ key: 'date', dir: -1 }} searchKeys={['name', 'category', 'description', 'method']}
        beforeSave={(v) => { const { mime, size, ...rest } = v; return { ...rest, rate_to_base: num(rest.rate_to_base) || currentRate(rest.currency) } }}
        columns={[
          { key: 'date', label: 'Date', render: (r) => fmtDate(r.date) }, { key: 'name', label: 'Expense', render: (r) => <span className="font-medium text-[#0B1F3A]">{r.name}</span> }, { key: 'category', label: 'Category', render: (r) => <Badge>{r.category}</Badge> },
          { key: 'amount', label: 'Amount', align: 'right', render: money }, { key: 'base', label: `In ${base}`, align: 'right', render: (r) => fmtCompact(baseAmt(r), base), sortValue: baseAmt, csv: baseAmt },
          { key: 'method', label: 'Method' }, { key: 'receipt_url', label: 'Receipt', render: (r) => (r.receipt_url ? <Badge tone="green">attached</Badge> : '—'), csv: (r) => (r.receipt_url ? 'yes' : '') },
          { key: 'created_by', label: 'Recorded by', render: (r) => partnerName(r.created_by) },
        ]} />
    </>
  )
}

export function Investments() {
  const base = usePrefs().base_currency
  const inv = useTable('investments')
  const total = inv.reduce((s, r) => s + baseAmt(r), 0)
  const by = (n: string) => inv.filter((r) => r.investor === n).reduce((s, r) => s + baseAmt(r), 0)
  const fields: FieldDef[] = [
    { key: 'investor', label: 'Investor', type: 'select', options: INVESTORS, required: true },
    { key: 'investor_name', label: 'Name (if Other Sources)' },
    { key: 'amount', label: 'Amount', type: 'number', required: true }, { key: 'currency', label: 'Currency', type: 'currency', default: base }, { ...rateField, default: 1 },
    { key: 'date', label: 'Investment Date', type: 'date', required: true },
    { key: 'purpose', label: 'Investment Purpose', span: 2 }, { key: 'description', label: 'Description', type: 'textarea' },
  ]
  return (
    <>
      <MoneyTabs />
      <PageHeader title="Business Investment" sub="Capital put into FRX by the founders or others. This is NOT sales revenue and is never included in profit." />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Total invested" value={fmtCompact(total, base)} /><Stat label="Feroze" value={fmtCompact(by('Feroze'), base)} /><Stat label="Raaef" value={fmtCompact(by('Raaef'), base)} /><Stat label="Other sources" value={fmtCompact(by('Other Sources'), base)} />
      </div>
      <EntityManager table="investments" noun="investment" fields={fields} initialSort={{ key: 'date', dir: -1 }} searchKeys={['investor', 'investor_name', 'purpose', 'description']}
        beforeSave={(v) => ({ ...v, rate_to_base: num(v.rate_to_base) || currentRate(v.currency) })}
        columns={[
          { key: 'date', label: 'Date', render: (r) => fmtDate(r.date) }, { key: 'investor', label: 'Investor', render: (r) => <span className="font-medium">{r.investor}{r.investor_name ? ` — ${r.investor_name}` : ''}</span> },
          { key: 'amount', label: 'Amount', align: 'right', render: money }, { key: 'base', label: `In ${base}`, align: 'right', render: (r) => fmtCompact(baseAmt(r), base), sortValue: baseAmt, csv: baseAmt },
          { key: 'purpose', label: 'Purpose' }, { key: 'created_by', label: 'Recorded by', render: (r) => partnerName(r.created_by) },
        ]} />
    </>
  )
}

export function periodRange(kind: string, year: number, idx: number) {
  if (kind === 'all') return {}
  if (kind === 'year') return { from: `${year}-01-01`, to: `${year}-12-31` }
  if (kind === 'quarter') { const m0 = idx * 3; return { from: isoDate(new Date(year, m0, 1)), to: isoDate(new Date(year, m0 + 3, 0)) } }
  return { from: isoDate(new Date(year, idx, 1)), to: isoDate(new Date(year, idx + 1, 0)) }
}

export function ProfitLoss() {
  useVersion()
  const prefs = usePrefs(); const base = prefs.base_currency
  const [kind, setKind] = useState<'month' | 'quarter' | 'year' | 'all'>('month')
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear()); const [idx, setIdx] = useState(now.getMonth())
  const range = periodRange(kind, year, kind === 'quarter' ? Math.min(idx, 3) : idx)
  const fin = financeSummary(range)
  const rates = useSetting('prefs', {}) // re-render on settings change
  void rates
  const expenses = useTable('expense_transactions'), income = useTable('income_transactions')
  const byCat = useMemo(() => {
    const m = new Map<string, number>()
    expenses.filter((e) => (!range.from || e.date >= range.from) && (!range.to || e.date <= range.to)).forEach((e) => m.set(e.category, (m.get(e.category) || 0) + baseAmt(e)))
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [expenses, kind, year, idx])
  const months = useMemo(() => {
    const keys = new Map<string, { k: string; Revenue: number; Expenses: number }>()
    const g = (k: string) => (keys.has(k) ? keys.get(k)! : (keys.set(k, { k, Revenue: 0, Expenses: 0 }), keys.get(k)!))
    income.forEach((i) => { g(monthKey(i.date)).Revenue += baseAmt(i) }); expenses.forEach((e) => { g(monthKey(e.date)).Expenses += baseAmt(e) })
    return [...keys.values()].sort((a, b) => a.k.localeCompare(b.k)).slice(-12).map((x) => ({ ...x, Revenue: Math.round(x.Revenue), Expenses: Math.round(x.Expenses) }))
  }, [income, expenses])
  const unusualRates = CURRENCIES.length

  const Row2 = ({ k, v, strong, tone, hint }: { k: string; v: number; strong?: boolean; tone?: boolean; hint?: string }) => (
    <div className={cn('flex items-baseline justify-between py-2.5', strong && 'border-t-2 border-slate-200 pt-3 text-base font-semibold')}>
      <div><span className={strong ? '' : 'text-slate-600'}>{k}</span>{hint && <div className="text-[11px] text-slate-400">{hint}</div>}</div>
      <span className={cn('tabular-nums', tone && (v >= 0 ? 'text-emerald-600' : 'text-red-600'))}>{fmtMoney(v, base)}</span>
    </div>
  )
  return (
    <>
      <MoneyTabs />
      <PageHeader title="Profit & Loss" sub={`All figures in ${base}, each transaction converted at the rate saved with it (${unusualRates} supported currencies).`} actions={<>
        <Select className="!w-auto" value={kind} onChange={(v) => setKind(v as any)} options={[{ value: 'month', label: 'Monthly' }, { value: 'quarter', label: 'Quarterly' }, { value: 'year', label: 'Yearly' }, { value: 'all', label: 'All time' }]} />
        {kind !== 'all' && <Select className="!w-auto" value={String(year)} onChange={(v) => setYear(Number(v))} options={[...Array(6)].map((_, i) => String(now.getFullYear() - i))} />}
        {kind === 'month' && <Select className="!w-auto" value={String(idx)} onChange={(v) => setIdx(Number(v))} options={['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((m, i) => ({ value: String(i), label: m }))} />}
        {kind === 'quarter' && <Select className="!w-auto" value={String(Math.min(idx, 3))} onChange={(v) => setIdx(Number(v))} options={['Q1', 'Q2', 'Q3', 'Q4'].map((m, i) => ({ value: String(i), label: m }))} />}
      </>} />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Revenue" value={fmtCompact(fin.revenue, base)} sub={fin.basis === 'accrual' ? 'invoiced + direct income' : 'cash basis'} /><Stat label="Expenses" value={fmtCompact(fin.expenses, base)} />
        <Stat label="Net profit" value={fmtCompact(fin.netProfit, base)} tone={fin.netProfit >= 0 ? 'green' : 'red'} /><Stat label="Net cash position" value={fmtCompact(fin.netCash, base)} tone={fin.netCash >= 0 ? 'green' : 'red'} sub="cash in + investment − expenses" />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Statement" sub={fin.basis === 'accrual' ? 'Accrual basis (change in Settings → Currency)' : 'Cash basis (change in Settings → Currency)'} />
          <div className="divide-y divide-slate-50 px-5 py-2 text-sm">
            <Row2 k="Invoiced revenue" v={fin.invoiced} hint="Sent, partially paid, paid & overdue invoices issued in the period" />
            <Row2 k="Direct income (not tied to an invoice)" v={fin.directIncome} />
            <Row2 k="Total recognized revenue" v={fin.revenue} />
            <Row2 k="Business expenses" v={-fin.expenses} />
            <Row2 k="Net operating profit" v={fin.netProfit} strong tone />
          </div>
          <div className="divide-y divide-slate-50 border-t border-slate-100 px-5 py-2 text-sm">
            <Row2 k="Cash received" v={fin.cashReceived} hint="Payments actually received in the period" />
            <Row2 k="Outstanding receivables" v={fin.receivables} hint="Unpaid invoice balances right now" />
            <Row2 k="Founder / other investment" v={fin.investments} hint="Not revenue — excluded from profit" />
            <Row2 k="Net cash position" v={fin.netCash} strong tone />
          </div>
        </Card>
        <div className="space-y-5">
          <Card><CardHeader title="Monthly revenue vs expenses" sub="Cash received (income entries) vs expenses" />
            <div className="h-60 p-3"><ResponsiveContainer><BarChart data={months}><CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} /><XAxis dataKey="k" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} /><YAxis tick={{ fontSize: 11 }} width={56} tickLine={false} axisLine={false} tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : v)} /><Tooltip formatter={(v: any) => fmtCompact(Number(v), base)} /><Legend /><Bar dataKey="Revenue" fill="#2563EB" radius={3} /><Bar dataKey="Expenses" fill="#f59e0b" radius={3} /></BarChart></ResponsiveContainer></div></Card>
          <Card><CardHeader title="Expenses by category" />
            <ul className="divide-y divide-slate-50 text-sm">{byCat.length === 0 && <li className="p-5 text-slate-500">No expenses in this period.</li>}{byCat.map(([c, v]) => <li key={c} className="flex justify-between px-5 py-2"><span>{c}</span><b className="tabular-nums">{fmtCompact(v, base)}</b></li>)}</ul></Card>
        </div>
      </div>
      <p className="mt-4 text-xs text-slate-400">Today is {fmtDate(today())}. Receivables are shown as of now and are not filtered by period.</p>
    </>
  )
}
void Tabs
