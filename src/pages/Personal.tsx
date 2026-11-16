import { useMemo, useRef, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Plus } from 'lucide-react'
import { missingTables, useTable, type Row } from '../lib/db'
import { create, currentRate, getCurrentUserId, partnerName, remove, toBase, update, usePrefs } from '../lib/services'
import { CURRENCIES, PAYMENT_METHODS, PERSONAL_CATEGORIES } from '../lib/constants'
import { cn, fmtCompact, fmtDate, fmtMoney, isoDate, num, today } from '../lib/util'
import { Badge, Button, Card, CardHeader, Empty, PageHeader, PartnerChip, Select, useToast, inputCls } from '../components/ui'
import { DataTable, FormModal, initialValues, type FieldDef } from '../components/Entity'
import { useAuth } from '../lib/auth'

type Period = 'month' | 'last' | 'year' | 'all'

const rangeOf = (p: Period) => {
  const n = new Date(), y = n.getFullYear(), m = n.getMonth()
  if (p === 'month') return { from: isoDate(new Date(y, m, 1)), to: isoDate(new Date(y, m + 1, 0)) }
  if (p === 'last') return { from: isoDate(new Date(y, m - 1, 1)), to: isoDate(new Date(y, m, 0)) }
  if (p === 'year') return { from: `${y}-01-01`, to: `${y}-12-31` }
  return { from: '', to: '' }
}

export default function Personal() {
  const { user } = useAuth()
  const toast = useToast()
  const base = usePrefs().base_currency
  const all = useTable('personal_expenses'), profiles = useTable('profiles')
  const [period, setPeriod] = useState<Period>('month')
  const [who, setWho] = useState<'both' | string>('both')
  const [editing, setEditing] = useState<Row | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const [q, setQ] = useState({ name: '', amount: '', currency: base, category: 'Food & groceries' })
  const [busy, setBusy] = useState(false)

  const me = user?.id || getCurrentUserId() || ''
  const partner = profiles.find((p) => p.id !== me)
  const { from, to } = rangeOf(period)
  const inPeriod = useMemo(() => all.filter((e) => (!from || e.date >= from) && (!to || e.date <= to)), [all, from, to])
  const shown = who === 'both' ? inPeriod : inPeriod.filter((e) => e.owner_id === who)
  const inBase = (e: Row) => toBase(num(e.amount), e.rate_to_base)
  const sum = (rows: Row[]) => rows.reduce((s, e) => s + inBase(e), 0)
  const totalFor = (id: string) => sum(inPeriod.filter((e) => e.owner_id === id))

  const byCategory = useMemo(() => {
    const m = new Map<string, Record<string, number>>()
    for (const e of shown) { const r = m.get(e.category) || {}; r[e.owner_id] = (r[e.owner_id] || 0) + inBase(e); m.set(e.category, r) }
    return [...m.entries()].map(([category, r]) => ({ category, ...Object.fromEntries(profiles.map((p) => [p.short_name, Math.round(r[p.id] || 0)])), _t: Object.values(r).reduce((a, b) => a + b, 0) })).sort((a, b) => b._t - a._t)
  }, [shown, profiles])

  const fields: FieldDef[] = [
    { key: 'name', label: 'What was it for?', required: true, span: 2 },
    { key: 'amount', label: 'Amount', type: 'number', required: true },
    { key: 'currency', label: 'Currency', type: 'currency', default: base },
    { key: 'rate_to_base', label: 'Rate to reporting currency', type: 'number', default: 1, hint: 'Saved with the entry so later rate changes never rewrite it.' },
    { key: 'date', label: 'Date', type: 'date', required: true, default: () => today() },
    { key: 'category', label: 'Category', type: 'select', options: PERSONAL_CATEGORIES, default: 'Other' },
    { key: 'method', label: 'Paid with', type: 'select', options: PAYMENT_METHODS },
    { key: 'notes', label: 'Notes', type: 'textarea' },
  ]
  const init = useMemo(() => initialValues(fields, editing || {}), [editing])

  if (missingTables.has('personal_expenses')) return (
    <Card className="mx-auto max-w-xl p-6 text-sm"><h2 className="font-semibold text-[#0B1F3A]">One more database step</h2><p className="mt-2 text-slate-600">Personal expenses need their own table. In Supabase → SQL Editor, paste and run <code className="rounded bg-slate-100 px-1">supabase/6-personal-expenses.sql</code>, then reload this page.</p></Card>
  )

  async function quickAdd() {
    const amount = num(q.amount)
    if (!q.name.trim()) return nameRef.current?.focus()
    if (!(amount > 0)) return toast('Enter an amount greater than zero', 'err')
    setBusy(true)
    try {
      await create('personal_expenses', { owner_id: me, name: q.name.trim(), amount, currency: q.currency, rate_to_base: currentRate(q.currency), category: q.category, date: today() })
      toast(`Saved: ${q.name.trim()} — ${fmtMoney(amount, q.currency)}`)
      setQ({ ...q, name: '', amount: '' }); nameRef.current?.focus()
    } catch (e: any) { toast(e.message || 'Could not save', 'err') } finally { setBusy(false) }
  }

  const mine = (r: Row) => r.owner_id === me
  const periodLabel = { month: 'this month', last: 'last month', year: 'this year', all: 'in total' }[period]

  return (
    <>
      <PageHeader title="Personal spending" sub="Each partner's own spending, kept separate from business money. You can both see everything; only the owner can change their own entries."
        actions={<Select className="!w-auto" value={period} onChange={(v) => setPeriod(v as Period)} options={[{ value: 'month', label: 'This month' }, { value: 'last', label: 'Last month' }, { value: 'year', label: 'This year' }, { value: 'all', label: 'All time' }]} />} />

      <div className="mb-5 rounded-2xl border-2 border-[#2563EB]/25 bg-white p-4 shadow-sm">
        <h2 className="mb-2.5 text-base font-semibold text-[#0B1F3A]">Add a personal expense <span className="text-sm font-normal text-slate-400">— for {partnerName(me)}</span></h2>
        <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); quickAdd() }}>
          <input ref={nameRef} value={q.name} onChange={(e) => setQ({ ...q, name: e.target.value })} placeholder="What was it? e.g. Groceries" className="min-w-48 flex-[3] rounded-xl border border-slate-200 px-4 py-3 text-base outline-none placeholder:text-slate-400 focus:border-[#2563EB] focus:ring-4 focus:ring-[#2563EB]/10" />
          <input value={q.amount} onChange={(e) => setQ({ ...q, amount: e.target.value })} placeholder="Amount" inputMode="decimal" className="w-32 rounded-xl border border-slate-200 px-4 py-3 text-base outline-none placeholder:text-slate-400 focus:border-[#2563EB] focus:ring-4 focus:ring-[#2563EB]/10" />
          <Select className="!w-auto !rounded-xl !py-3 !text-base" value={q.currency} onChange={(v) => setQ({ ...q, currency: v })} options={[...CURRENCIES]} />
          <Select className="!w-auto !rounded-xl !py-3 !text-base" value={q.category} onChange={(v) => setQ({ ...q, category: v })} options={PERSONAL_CATEGORIES} />
          <Button type="submit" loading={busy} className="rounded-xl px-6 py-3 text-base"><Plus size={18} /> Add</Button>
        </form>
        <p className="mt-2 text-xs text-slate-400">Saved with today's date. Open an entry with the pencil to change the date, add notes or how you paid.</p>
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        {profiles.slice().sort((a, b) => (a.id === me ? -1 : b.id === me ? 1 : 0)).map((p) => (
          <button key={p.id} onClick={() => setWho(who === p.id ? 'both' : p.id)} className={cn('rounded-2xl border bg-white p-5 text-left shadow-sm transition hover:shadow-md', who === p.id ? 'border-[#2563EB] ring-2 ring-[#2563EB]/20' : 'border-slate-200')}>
            <div className="flex items-center justify-between text-sm font-medium text-slate-500"><PartnerChip id={p.id} />{p.id === me && <Badge tone="blue">you</Badge>}</div>
            <div className="mt-2 text-3xl font-bold tracking-tight text-[#0B1F3A]">{fmtCompact(totalFor(p.id), base)}</div>
            <div className="mt-0.5 text-xs text-slate-400">spent {periodLabel} · {inPeriod.filter((e) => e.owner_id === p.id).length} entries</div>
          </button>
        ))}
        <div className="rounded-2xl border border-slate-200 bg-[#0B1F3A] p-5 text-white shadow-sm">
          <div className="text-sm font-medium text-slate-300">Together</div>
          <div className="mt-2 text-3xl font-bold tracking-tight">{fmtCompact(sum(inPeriod), base)}</div>
          <div className="mt-0.5 text-xs text-slate-400">{periodLabel} · in {base}</div>
        </div>
      </div>

      <div className="mb-3 flex w-fit rounded-xl border border-slate-200 bg-white p-0.5">
        {([['both', 'Both'], [me, 'Mine'], [partner?.id || 'x', partner ? `${partner.short_name}'s` : 'Partner']] as [string, string][]).map(([k, l]) => (
          <button key={l} onClick={() => setWho(k)} className={cn('rounded-lg px-4 py-2 text-sm font-medium', who === k ? 'bg-[#0B1F3A] text-white' : 'text-slate-600')}>{l}</button>
        ))}
      </div>

      {byCategory.length > 0 && (
        <Card className="mb-5">
          <CardHeader title={`Where it went (${periodLabel})`} sub={`In ${base}, converted at each entry's saved rate`} />
          <div className="h-64 p-3"><ResponsiveContainer><BarChart data={byCategory}><CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} /><XAxis dataKey="category" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} interval={0} angle={-18} textAnchor="end" height={56} /><YAxis tick={{ fontSize: 11 }} width={52} tickLine={false} axisLine={false} tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : v)} /><Tooltip formatter={(v: any) => fmtCompact(Number(v), base)} /><Legend />
            {profiles.map((p, i) => <Bar key={p.id} dataKey={p.short_name} stackId="a" fill={i === 0 ? '#2563EB' : '#60A5FA'} radius={i === profiles.length - 1 ? [3, 3, 0, 0] : 0} />)}</BarChart></ResponsiveContainer></div>
        </Card>
      )}

      <DataTable rows={shown} exportName="personal-expenses" initialSort={{ key: 'date', dir: -1 }} searchKeys={['name', 'category', 'method', 'notes']}
        onEdit={(r) => setEditing(r)} canEdit={mine}
        onDelete={(r) => { if (window.confirm(`Delete "${r.name}" (${fmtMoney(num(r.amount), r.currency)})?`)) remove('personal_expenses', r.id).then(() => toast('Deleted')).catch((e) => toast(e.message, 'err')) }}
        empty={<Empty title={all.length === 0 ? 'No personal expenses yet' : 'Nothing in this view'} hint="Add one above. It takes a few seconds." />}
        columns={[
          { key: 'date', label: 'Date', render: (r) => fmtDate(r.date) },
          { key: 'name', label: 'What', render: (r) => <div><div className="font-medium text-[#0B1F3A]">{r.name}</div>{r.notes && <div className="max-w-xs truncate text-xs text-slate-500">{r.notes}</div>}</div> },
          { key: 'category', label: 'Category', render: (r) => <Badge>{r.category}</Badge> },
          { key: 'owner_id', label: 'Whose', render: (r) => <PartnerChip id={r.owner_id} />, sortValue: (r) => partnerName(r.owner_id), csv: (r) => partnerName(r.owner_id) },
          { key: 'amount', label: 'Amount', align: 'right', render: (r) => fmtMoney(num(r.amount), r.currency) },
          { key: 'base', label: `In ${base}`, align: 'right', render: (r) => fmtCompact(inBase(r), base), sortValue: inBase, csv: inBase },
          { key: 'method', label: 'Paid with' },
        ]} />
      <FormModal open={!!editing} onClose={() => setEditing(null)} title="Edit personal expense" fields={fields} initial={init}
        onSubmit={async (v) => { if (!editing || !mine(editing)) throw new Error('You can only edit your own entries'); await update('personal_expenses', editing.id, { ...v, rate_to_base: num(v.rate_to_base) || currentRate(v.currency) }); toast('Saved') }} />
      <p className="mt-4 text-xs text-slate-400">Personal spending is never included in the business profit and loss, revenue or cash totals.</p>
    </>
  )
}
void inputCls
