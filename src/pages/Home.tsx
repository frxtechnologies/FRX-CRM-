import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Check, ChevronRight, Plus } from 'lucide-react'
import { byId, useTable, useVersion } from '../lib/db'
import { create, financeSummary, getCurrentUserId, notify, partnerName, subEffectiveStatus, update, usePrefs } from '../lib/services'
import { completeFollowUp, rescheduleFollowUp } from '../lib/leadOps'
import { addDays, cn, fmtCompact, fmtDate, num, timeAgo, today } from '../lib/util'
import { Card, PartnerChip, PartnerSelect, inputCls, useToast } from '../components/ui'
import { useAuth } from '../lib/auth'
import QuickAddLead from '../components/QuickAddLead'

function Big({ label, value, hint, tone, to }: { label: string; value: string | number; hint?: string; tone?: 'red' | 'green' | 'blue'; to: string }) {
  return (
    <Link to={to} className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="text-sm font-medium text-slate-500">{label}</div>
      <div className={cn('mt-1 text-4xl font-bold tracking-tight', tone === 'red' ? 'text-red-600' : tone === 'green' ? 'text-emerald-600' : tone === 'blue' ? 'text-[#2563EB]' : 'text-[#0B1F3A]')}>{value}</div>
      {hint && <div className="mt-1 flex items-center justify-between text-xs text-slate-400">{hint}<ChevronRight size={14} className="opacity-0 transition group-hover:opacity-100" /></div>}
    </Link>
  )
}

export default function Home() {
  useVersion()
  const { user } = useAuth()
  const nav = useNavigate()
  const toast = useToast()
  const base = usePrefs().base_currency
  const profiles = useTable('profiles'), fus = useTable('follow_ups'), leads = useTable('leads'), tasks = useTable('business_tasks'), invoices = useTable('invoices'), subs = useTable('subscriptions'), logs = useTable('activity_logs')
  const t = today()
  const [title, setTitle] = useState('')
  const [due, setDue] = useState('')
  const [who, setWho] = useState(user?.id || '')
  const hour = new Date().getHours()
  const hello = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  const pending = fus.filter((f) => f.status === 'pending' && f.due_date <= t).sort((a, b) => a.due_date.localeCompare(b.due_date) || (a.assigned_to === user?.id ? -1 : 1))
  const overdue = pending.filter((f) => f.due_date < t)
  const openTasks = tasks.filter((x) => !['Completed', 'Cancelled'].includes(x.status))
    .sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999') || a.created_at.localeCompare(b.created_at))
  const mine = openTasks.filter((x) => !x.assigned_to || x.assigned_to === user?.id)
  const theirs = openTasks.filter((x) => x.assigned_to && x.assigned_to !== user?.id)
  const lateTasks = openTasks.filter((x) => x.due_date && x.due_date < t).length
  const addTask = async () => {
    if (!title.trim()) return
    try {
      const row = await create('business_tasks', { title: title.trim(), assigned_to: who || user?.id, due_date: due || null, priority: 'medium', category: 'Other', status: 'To Do' })
      if (row.assigned_to && row.assigned_to !== user?.id) await notify({ title: `New task for you: ${row.title}`, body: `From ${partnerName(user?.id)}`, link: '/tasks', user_id: row.assigned_to, kind: 'task' })
      setTitle(''); setDue(''); toast('Task added')
    } catch (e: any) { toast(e.message || 'Could not add task', 'err') }
  }
  const taskRow = (k: any) => {
    const late = k.due_date && k.due_date < t
    return (
      <li key={k.id} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-slate-50">
        <button onClick={() => run(() => update('business_tasks', k.id, { status: 'Completed', completed_at: new Date().toISOString() }), 'Task done')} title="Mark done" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-slate-300 text-transparent transition hover:border-[#2563EB] hover:bg-[#2563EB] hover:text-white"><Check size={13} /></button>
        <div className="min-w-0 flex-1"><div className="truncate font-medium text-slate-800">{k.title}</div>{k.due_date && <div className={cn('text-xs', late ? 'font-medium text-red-600' : k.due_date === t ? 'font-medium text-amber-600' : 'text-slate-400')}>{late ? 'Late · ' : k.due_date === t ? 'Today' : 'Due '}{k.due_date !== t && fmtDate(k.due_date)}</div>}</div>
        <PartnerChip id={k.assigned_to} />
      </li>
    )
  }
  const fresh = leads.filter((l) => ['New Lead', 'Not Contacted', 'Ready to Contact'].includes(l.status))
  const month = t.slice(0, 7)
  const fin = financeSummary({ from: `${month}-01`, to: `${month}-31` })
  const all = financeSummary()
  const heads = [
    ...invoices.filter((i) => i.status === 'Overdue').map((i) => ({ k: `i${i.id}`, text: `Invoice ${i.number} is overdue — ${fmtCompact(num(i.balance), i.currency)} unpaid`, to: `/invoices/${i.id}` })),
    ...subs.filter((s) => { const d = s.renewal_date || s.expiration_date; return !['Cancelled', 'Paused'].includes(s.status) && d && d >= t && d <= addDays(t, 7) }).map((s) => ({ k: `s${s.id}`, text: `${s.name} ${s.recurring ? 'renews' : 'expires'} on ${fmtDate(s.renewal_date || s.expiration_date)}`, to: '/subscriptions' })),
    ...subs.filter((s) => subEffectiveStatus(s) === 'Expired').map((s) => ({ k: `e${s.id}`, text: `${s.name} has expired`, to: '/subscriptions' })),
  ]
  const run = async (fn: () => Promise<any>, ok: string) => { try { await fn(); toast(ok) } catch (e: any) { toast(e.message || 'Failed', 'err') } }

  return (
    <>
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight text-[#0B1F3A]">{hello}, {user?.short_name}</h1>
        <p className="mt-1 text-slate-500">{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Big label="Follow-ups to do" value={pending.length} tone={pending.length ? 'blue' : undefined} hint="due today or late" to="/leads/follow-ups" />
        <Big label="Running late" value={overdue.length} tone={overdue.length ? 'red' : 'green'} hint={overdue.length ? 'needs attention' : 'nothing late'} to="/leads/follow-ups" />
        <Big label="Open tasks" value={openTasks.length} tone={lateTasks ? 'red' : undefined} hint={lateTasks ? `${lateTasks} late` : 'across both partners'} to="/tasks" />
        <Big label="Clients still owe you" value={fmtCompact(all.receivables, base)} tone={all.receivables ? 'blue' : undefined} hint="unpaid invoices" to="/invoices" />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <QuickAddLead />
          <section>
            <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-semibold text-[#0B1F3A]">Do these now</h2><Link to="/leads/follow-ups" className="text-sm text-[#2563EB]">All follow-ups</Link></div>
            {pending.length === 0 ? (
              <Card className="p-8 text-center"><div className="text-3xl">✨</div><p className="mt-2 font-medium text-slate-800">You're all caught up</p><p className="text-sm text-slate-500">No follow-ups due. Set a follow-up on a lead and it shows up here.</p></Card>
            ) : (
              <div className="space-y-2.5">
                {pending.slice(0, 8).map((f) => {
                  const l = byId('leads', f.lead_id)
                  const late = f.due_date < t
                  return (
                    <div key={f.id} className={cn('flex flex-wrap items-center gap-3 rounded-2xl border bg-white p-4 shadow-sm', late ? 'border-red-200' : 'border-slate-200')}>
                      <button onClick={() => nav(`/leads/${f.lead_id}`)} className="min-w-44 flex-1 text-left">
                        <div className="font-semibold text-[#0B1F3A]">{l?.business_name || 'Lead'}</div>
                        <div className={cn('text-sm', late ? 'font-medium text-red-600' : 'text-slate-500')}>{late ? `${Math.round((new Date(t).getTime() - new Date(f.due_date).getTime()) / 86400000)} days late` : 'Today'}{f.note ? ` · ${f.note}` : ''}</div>
                      </button>
                      <PartnerChip id={f.assigned_to} />
                      <button onClick={() => { const n = window.prompt('Quick note about how it went (optional)'); if (n !== null) run(() => completeFollowUp(f, n), 'Done — nice') }} className="inline-flex items-center gap-1.5 rounded-xl bg-[#2563EB] px-3.5 py-2 text-sm font-medium text-white hover:bg-[#1d4ed8]"><Check size={15} /> Done</button>
                      <button onClick={() => run(() => rescheduleFollowUp(f, addDays(t, 1)), 'Moved to tomorrow')} className="rounded-xl border border-slate-200 px-3.5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">Tomorrow</button>
                    </div>
                  )
                })}
                {pending.length > 8 && <Link to="/leads/follow-ups" className="block rounded-xl py-2 text-center text-sm text-[#2563EB]">+ {pending.length - 8} more</Link>}
              </div>
            )}
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[#0B1F3A]">Tasks <span className="ml-1 text-sm font-normal text-slate-400">{openTasks.length} open{lateTasks ? ` · ${lateTasks} late` : ''}</span></h2>
              <Link to="/tasks" className="text-sm text-[#2563EB]">All tasks</Link>
            </div>
            <Card className="p-4">
              <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); addTask() }}>
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a task… e.g. Send proposal to Northwind" className="min-w-52 flex-[3] rounded-xl border border-slate-200 px-4 py-2.5 outline-none placeholder:text-slate-400 focus:border-[#2563EB] focus:ring-4 focus:ring-[#2563EB]/10" />
                <PartnerSelect className="!w-auto !rounded-xl !py-2.5" value={who} onChange={setWho} />
                <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className={cn(inputCls, '!w-auto !rounded-xl !py-2.5')} title="Due date (optional)" />
                <button type="submit" disabled={!title.trim()} className="inline-flex items-center gap-1.5 rounded-xl bg-[#2563EB] px-4 py-2.5 font-medium text-white hover:bg-[#1d4ed8] disabled:opacity-40"><Plus size={16} /> Add</button>
              </form>
              {openTasks.length === 0 ? <p className="py-6 text-center text-sm text-slate-500">No open tasks. Add one above — it appears for both partners instantly.</p> : (
                <div className="mt-3 grid gap-x-6 gap-y-2 md:grid-cols-2">
                  <div><div className="mb-1 px-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Yours · {mine.length}</div><ul>{mine.slice(0, 6).map(taskRow)}</ul>{mine.length === 0 && <p className="px-2 py-2 text-sm text-slate-400">Nothing assigned to you.</p>}{mine.length > 6 && <Link to="/tasks" className="block px-2 py-1 text-sm text-[#2563EB]">+ {mine.length - 6} more</Link>}</div>
                  <div><div className="mb-1 px-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{partnerName(profiles.find((p) => p.id !== user?.id)?.id)}'s · {theirs.length}</div><ul>{theirs.slice(0, 6).map(taskRow)}</ul>{theirs.length === 0 && <p className="px-2 py-2 text-sm text-slate-400">Nothing assigned to your partner.</p>}{theirs.length > 6 && <Link to="/tasks" className="block px-2 py-1 text-sm text-[#2563EB]">+ {theirs.length - 6} more</Link>}</div>
                </div>
              )}
            </Card>
          </section>
        </div>

        <div className="space-y-6 lg:col-span-2">
          {heads.length > 0 && (
            <Card className="border-amber-200 bg-amber-50/60 p-5">
              <h2 className="mb-2 font-semibold text-amber-900">Heads up</h2>
              <ul className="space-y-1.5">{heads.map((h) => <li key={h.k}><Link to={h.to} className="flex items-center justify-between text-sm text-amber-900 hover:underline">{h.text}<ArrowRight size={14} /></Link></li>)}</ul>
            </Card>
          )}
          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold text-[#0B1F3A]">Money this month</h2><Link to="/finance/pnl" className="text-sm text-[#2563EB]">Details</Link></div>
            <dl className="space-y-3">
              <div className="flex items-baseline justify-between"><dt className="text-slate-500">Received</dt><dd className="text-xl font-semibold">{fmtCompact(fin.cashReceived, base)}</dd></div>
              <div className="flex items-baseline justify-between"><dt className="text-slate-500">Spent</dt><dd className="text-xl font-semibold">{fmtCompact(fin.expenses, base)}</dd></div>
              <div className="flex items-baseline justify-between border-t border-slate-100 pt-3"><dt className="font-medium text-slate-700">Profit</dt><dd className={cn('text-xl font-bold', fin.netProfit >= 0 ? 'text-emerald-600' : 'text-red-600')}>{fmtCompact(fin.netProfit, base)}</dd></div>
            </dl>
          </Card>
          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold text-[#0B1F3A]">What's happened</h2><Link to="/activity" className="text-sm text-[#2563EB]">Everything</Link></div>
            <ul className="space-y-2.5">
              {logs.slice().sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 6).map((a) => <li key={a.id} className="text-sm"><b className={a.user_id === getCurrentUserId() ? 'text-[#2563EB]' : 'text-slate-800'}>{a.user_id === getCurrentUserId() ? 'You' : partnerName(a.user_id)}</b> <span className="text-slate-600">{a.summary}</span> <span className="text-xs text-slate-400">{timeAgo(a.created_at)}</span></li>)}
              {logs.length === 0 && <li className="text-sm text-slate-500">Nothing yet. Both partners' changes will show up here.</li>}
            </ul>
          </Card>
          <Link to="/overview" className="block text-center text-sm text-slate-500 hover:text-[#2563EB]">Open the full business overview with charts →</Link>
        </div>
      </div>
    </>
  )
}
