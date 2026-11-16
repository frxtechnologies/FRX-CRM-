import { useTable } from '../lib/db'
import { currentRate, getCurrentUserId, monthlyCostBase, subEffectiveStatus, useList, usePrefs } from '../lib/services'
import { BILLING_CYCLES, CURRENCIES, PAYMENT_METHODS } from '../lib/constants'
import { addDays, cn, daysBetween, fmtCompact, fmtDate, fmtMoney, num, today } from '../lib/util'
import { Badge, PageHeader, PartnerChip, Stat, statusTone } from '../components/ui'
import { EntityManager, type FieldDef } from '../components/Entity'

export default function Subscriptions() {
  const subs = useTable('subscriptions')
  const base = usePrefs().base_currency
  const cats = useList('subscription_categories')
  const t = today()
  const live = subs.filter((s) => ['Active', 'Expiring Soon'].includes(subEffectiveStatus(s)))
  const monthly = live.reduce((s, x) => s + monthlyCostBase(x), 0)
  const upcoming = subs.filter((s) => { const d = s.renewal_date || s.expiration_date; return !['Cancelled', 'Paused'].includes(s.status) && d && d >= t && d <= addDays(t, 30) }).sort((a, b) => (a.renewal_date || a.expiration_date).localeCompare(b.renewal_date || b.expiration_date))
  const fields: FieldDef[] = [
    { key: 'name', label: 'Subscription Name', required: true }, { key: 'provider', label: 'Provider' },
    { key: 'category', label: 'Category', type: 'select', options: cats, default: 'Other' }, { key: 'plan', label: 'Subscription Plan' },
    { key: 'amount', label: 'Amount', type: 'number', required: true }, { key: 'currency', label: 'Currency', type: 'currency', default: 'USD' },
    { key: 'rate_to_base', label: 'Rate to reporting currency', type: 'number', default: () => currentRate('USD') },
    { key: 'billing_cycle', label: 'Billing Cycle', type: 'select', options: BILLING_CYCLES, default: 'Monthly' },
    { key: 'purchase_date', label: 'Purchase Date', type: 'date' }, { key: 'start_date', label: 'Start Date', type: 'date' },
    { key: 'renewal_date', label: 'Renewal Date', type: 'date' }, { key: 'expiration_date', label: 'Expiration Date', type: 'date' },
    { key: 'recurring', label: 'Renewal type', type: 'checkbox', hint: 'Auto-renews (recurring). Leave unticked for manual renewal — we never assume it renews.' },
    { key: 'payment_method', label: 'Payment Method', type: 'select', options: PAYMENT_METHODS }, { key: 'account_email', label: 'Account Email', type: 'email' },
    { key: 'responsible_to', label: 'Responsible Partner', type: 'partner', default: () => getCurrentUserId() },
    { key: 'status', label: 'Status', type: 'select', options: ['Active', 'Paused', 'Cancelled'], default: 'Active', hint: '"Expiring Soon" and "Expired" are set automatically from the dates.' },
    { key: 'reminder_days', label: 'Reminder days before renewal (comma separated)', default: '30,7,3,0', hint: 'Default 30, 7, 3 and on the day (0).' },
    { key: 'notes', label: 'Notes', type: 'textarea' },
  ]
  return (
    <>
      <PageHeader title="Subscriptions & Software" sub="Tools, hosting and domains — with renewal alerts for both partners" />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Active subscriptions" value={live.length} /><Stat label="Monthly cost" value={fmtCompact(monthly, base)} sub={`in ${base}`} /><Stat label="Annual cost" value={fmtCompact(monthly * 12, base)} sub="monthly cost x 12" />
        <Stat label="Renewals in 30 days" value={upcoming.length} tone={upcoming.length ? 'blue' : undefined} /><Stat label="Expired" value={subs.filter((s) => subEffectiveStatus(s) === 'Expired').length} tone={subs.some((s) => subEffectiveStatus(s) === 'Expired') ? 'red' : undefined} />
      </div>
      {upcoming.length > 0 && <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm"><b className="text-amber-900">Upcoming</b><ul className="mt-1.5 space-y-1">{upcoming.map((s) => { const d = s.renewal_date || s.expiration_date; const left = daysBetween(t, d); return <li key={s.id} className="flex justify-between text-amber-900"><span>{s.name} — {s.recurring ? 'renews' : 'expires (manual renewal)'}</span><span>{fmtDate(d)} • {left === 0 ? 'today' : `${left}d`} • {fmtMoney(num(s.amount), s.currency)}</span></li> })}</ul></div>}
      <EntityManager table="subscriptions" noun="subscription" fields={fields} initialSort={{ key: 'renewal_date', dir: 1 }} searchKeys={['name', 'provider', 'category', 'account_email', 'plan']}
        beforeSave={(v) => ({ ...v, rate_to_base: num(v.rate_to_base) || currentRate(v.currency), reminder_days: String(v.reminder_days ?? '30,7,3,0').split(',').map((x) => parseInt(x.trim(), 10)).filter((x) => Number.isFinite(x) && x >= 0) })}
        columns={[
          { key: 'name', label: 'Subscription', render: (r) => <div><div className="font-medium text-[#0B1F3A]">{r.name}</div><div className="text-xs text-slate-500">{r.provider}{r.plan ? ` • ${r.plan}` : ''}</div></div> },
          { key: 'category', label: 'Category', render: (r) => <Badge>{r.category}</Badge> },
          { key: 'amount', label: 'Cost', align: 'right', render: (r) => <div>{fmtMoney(num(r.amount), r.currency)}<div className="text-[11px] text-slate-400">{r.billing_cycle}</div></div> },
          { key: 'renewal_date', label: 'Renewal / expiry', render: (r) => { const d = r.renewal_date || r.expiration_date; return d ? <div><span className={cn(d < t && 'text-red-600')}>{fmtDate(d)}</span><div className="text-[11px] text-slate-400">{r.recurring ? 'auto-renews' : 'manual renewal'}</div></div> : '—' } },
          { key: 'effective', label: 'Status', render: (r) => <Badge tone={statusTone(subEffectiveStatus(r))}>{subEffectiveStatus(r)}</Badge>, sortValue: subEffectiveStatus, csv: subEffectiveStatus },
          { key: 'responsible_to', label: 'Responsible', render: (r) => <PartnerChip id={r.responsible_to} /> },
        ]} />
    </>
  )
}
void CURRENCIES
