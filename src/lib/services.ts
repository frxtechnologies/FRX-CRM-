import { useMemo } from 'react'
import { rawInsert, rawInsertMany, rawRemoveMany, rawUpdate, rawRemove, snapshot, byId, useTable, type Row, type TableName } from './db'
import {
  BASE_DEFAULT, CONTACTED_STATUSES, DEFAULT_COMPANY, DEFAULT_INVOICE_SETTINGS, DEFAULT_RATES, EXPENSE_CATEGORIES,
  LEAD_STATUSES, SUB_CATEGORIES, WON,
} from './constants'
import { addDays, daysBetween, fmtMoney, isoDate, num, r2, today } from './util'

// ---------- current user + audited writes ----------
let currentUserId: string | undefined
export const setCurrentUserId = (id?: string) => { currentUserId = id }
export const getCurrentUserId = () => currentUserId

export const partnerName = (id?: string | null) => {
  const p = byId('profiles', id)
  return p ? (p.short_name as string) : 'System'
}

const LABEL: Partial<Record<TableName, [string, (r: Row) => string]>> = {
  leads: ['lead', (r) => r.business_name], clients: ['client', (r) => r.name], projects: ['project', (r) => r.name],
  business_tasks: ['task', (r) => r.title], project_tasks: ['project task', (r) => r.title],
  business_notes: ['note', (r) => r.title], income_transactions: ['income', (r) => r.name],
  expense_transactions: ['expense', (r) => r.name], investments: ['investment', (r) => `${r.investor} investment`],
  invoices: ['invoice', (r) => r.number], subscriptions: ['subscription', (r) => r.name], documents: ['document', (r) => r.name],
  follow_ups: ['follow-up', (r) => byId('leads', r.lead_id)?.business_name || 'lead'],
  lead_activities: ['activity', (r) => `${r.type} — ${byId('leads', r.lead_id)?.business_name || 'lead'}`],
  vault_items: ['vault login', (r) => r.title],
  personal_expenses: ['personal expense', (r) => r.name],
  invoice_payments: ['payment', (r) => `${fmtMoney(num(r.amount), byId('invoices', r.invoice_id)?.currency)} on ${byId('invoices', r.invoice_id)?.number}`],
}

export async function logActivity(summary: string, entity?: string, entityId?: string, action?: string) {
  await rawInsert('activity_logs', { user_id: currentUserId, action, entity, entity_id: entityId, summary }, currentUserId)
}

function diffSummary(table: TableName, before: Row, patch: Record<string, any>, after: Row) {
  const [noun, nm] = LABEL[table] || [table, () => '']
  const name = nm(after)
  if (table === 'leads' && patch.status && patch.status !== before.status) return `updated ${name}'s lead status to ${patch.status}`
  if (table === 'business_tasks' && patch.status === 'Completed' && before.status !== 'Completed') return `completed task "${name}"`
  if (table === 'follow_ups' && patch.status === 'completed') return `completed follow-up with ${name}`
  if (table === 'invoices' && patch.status && patch.status !== before.status) return `marked invoice ${name} as ${patch.status}`
  if (table === 'projects' && patch.status && patch.status !== before.status) return `moved project ${name} to ${patch.status}`
  return `updated ${noun} ${name}`
}

export async function create(table: TableName, values: Record<string, any>, opts: { silent?: boolean; summary?: string } = {}) {
  const row = await rawInsert(table, values, currentUserId)
  if (!opts.silent && LABEL[table]) {
    const [noun, nm] = LABEL[table]!
    await logActivity(opts.summary || `added ${noun === 'lead' && row.market ? row.market + ' lead' : 'new ' + noun} ${nm(row)}`, table, row.id, 'create')
    // tell the OTHER partner (this also becomes a phone alert); bulk imports use silent:true so they never spam
    if (table === 'leads') {
      const other = snapshot('profiles').find((p) => p.id !== currentUserId)
      if (other) await notify({ title: `New ${row.market === 'local' ? 'Pakistan' : 'international'} lead: ${row.business_name}`, body: `Added by ${partnerName(currentUserId)}`, link: `/leads/${row.id}`, user_id: other.id, kind: 'lead' })
    }
  }
  return row
}
export async function update(table: TableName, id: string, patch: Record<string, any>, opts: { silent?: boolean; summary?: string } = {}) {
  const before = byId(table, id)
  const row = await rawUpdate(table, id, patch, currentUserId)
  if (!opts.silent && before && LABEL[table]) await logActivity(opts.summary || diffSummary(table, before, patch, row), table, id, 'update')
  return row
}
export async function remove(table: TableName, id: string, opts: { silent?: boolean } = {}) {
  const before = byId(table, id)
  await rawRemove(table, id)
  if (!opts.silent && before && LABEL[table]) await logActivity(`deleted ${LABEL[table]![0]} ${LABEL[table]![1](before)}`, table, id, 'delete')
}

/** Bulk-add leads from a spreadsheet: one audit-log line and one alert to the other partner, not one per lead. */
export async function importLeads(rows: Record<string, any>[], label: string, onProgress?: (done: number) => void): Promise<Row[]> {
  let made: Row[] = []
  try {
    made = await rawInsertMany('leads', rows, currentUserId, onProgress)
  } catch (e: any) {
    made = e?.inserted || []
    if (made.length) await logActivity(`imported ${made.length} lead${made.length === 1 ? '' : 's'} from ${label} (stopped part-way)`, 'leads', undefined, 'import')
    throw e
  }
  await logActivity(`imported ${made.length} lead${made.length === 1 ? '' : 's'} from ${label}`, 'leads', undefined, 'import')
  const other = snapshot('profiles').find((p) => p.id !== currentUserId)
  if (other && made.length) await notify({ title: `${made.length} new lead${made.length === 1 ? '' : 's'} imported`, body: `${partnerName(currentUserId)} imported ${label}`, link: '/leads', user_id: other.id, kind: 'lead' })
  return made
}
export async function undoImportLeads(ids: string[], label: string) {
  const live = ids.filter((id) => byId('leads', id))
  await rawRemoveMany('leads', live)
  await logActivity(`undid the import of ${live.length} lead${live.length === 1 ? '' : 's'} from ${label}`, 'leads', undefined, 'delete')
}

export async function notify(n: { title: string; body?: string; link?: string; user_id?: string | null; kind?: string; dedupe_key?: string }) {
  if (n.kind && (getSetting('notif_prefs', {} as Record<string, boolean>) as Record<string, boolean>)[n.kind] === false) return
  if (n.dedupe_key && snapshot('notifications').some((x) => x.dedupe_key === n.dedupe_key)) return
  try { await rawInsert('notifications', { read_by: [], user_id: n.user_id ?? null, ...n }, currentUserId) } catch { /* duplicate from the other partner's session */ }
}

// ---------- settings ----------
export function useSettingsRows() { return useTable('app_settings') }
export function useSetting<T>(key: string, fallback: T): T {
  const rows = useTable('app_settings')
  return useMemo(() => {
    const r = rows.find((x) => x.id === key)
    return r ? ({ ...(typeof fallback === 'object' && !Array.isArray(fallback) ? (fallback as any) : {}), ...(Array.isArray(r.value) ? {} : r.value) } as T) : fallback
  }, [rows, key])
}
export function getSetting<T>(key: string, fallback: T): T {
  const r = snapshot('app_settings').find((x) => x.id === key)
  if (!r) return fallback
  return (Array.isArray(fallback) ? (r.value?.list ?? fallback) : { ...(fallback as any), ...r.value }) as T
}
export async function saveSetting(key: string, value: any) {
  const existing = snapshot('app_settings').find((x) => x.id === key)
  if (existing) await rawUpdate('app_settings', key, { value }, currentUserId)
  else await rawInsert('app_settings', { id: key, value }, currentUserId)
}
export function useList(key: 'lead_statuses' | 'expense_categories' | 'subscription_categories' | 'industries'): string[] {
  const rows = useTable('app_settings')
  const def = { lead_statuses: LEAD_STATUSES, expense_categories: EXPENSE_CATEGORIES, subscription_categories: SUB_CATEGORIES, industries: [] as string[] }[key]
  const r = rows.find((x) => x.id === key)
  return (r?.value?.list as string[]) || def
}
export const useCompany = () => useSetting('company', DEFAULT_COMPANY)
export const useInvoiceSettings = () => useSetting('invoice', DEFAULT_INVOICE_SETTINGS)
export const usePrefs = () => useSetting('prefs', { base_currency: BASE_DEFAULT, revenue_basis: 'accrual' as 'accrual' | 'cash' })
export const getBase = () => getSetting('prefs', { base_currency: BASE_DEFAULT, revenue_basis: 'accrual' }).base_currency as string

// ---------- exchange rates (reporting currency conversion) ----------
export function currentRate(cur: string): number {
  const base = getBase()
  const rows = snapshot('exchange_rates')
  const to = (c: string) => (c === 'PKR' ? 1 : num(rows.find((r) => r.id === c)?.rate_to_base) || DEFAULT_RATES[c] || 1)
  // rates are stored as "PKR per 1 unit"; convert to chosen base
  return to(cur) / to(base)
}
export const toBase = (amount: number, rate: number) => r2(num(amount) * (num(rate) || 1))

// ---------- invoices ----------
export function calcInvoice(items: { quantity?: any; unit_price?: any }[], discount: any, taxRate: any) {
  const subtotal = r2(items.reduce((s, i) => s + num(i.quantity) * num(i.unit_price), 0))
  const afterDiscount = Math.max(0, r2(subtotal - num(discount)))
  const tax_amount = r2(afterDiscount * (num(taxRate) / 100))
  return { subtotal, tax_amount, total: r2(afterDiscount + tax_amount) }
}

/** Single source of truth for invoice money: recompute totals, paid, balance, status from items + payments. */
export async function recomputeInvoice(invoiceId: string) {
  const inv = byId('invoices', invoiceId)
  if (!inv) return
  const items = snapshot('invoice_items').filter((i) => i.invoice_id === invoiceId)
  const pays = snapshot('invoice_payments').filter((p) => p.invoice_id === invoiceId)
  const c = calcInvoice(items as any[], inv.discount, inv.tax_rate)
  const paid = r2(pays.reduce((s, p) => s + num(p.amount), 0))
  const balance = r2(c.total - paid)
  let status = inv.status as string
  if (status !== 'Cancelled' && status !== 'Draft') {
    if (c.total > 0 && balance <= 0) status = 'Paid'
    else if (paid > 0) status = 'Partially Paid'
    else status = 'Sent'
    if (status !== 'Paid' && inv.due_date && inv.due_date < today()) status = 'Overdue'
  } else if (status === 'Draft' && paid > 0) status = c.total > 0 && balance <= 0 ? 'Paid' : 'Partially Paid'
  await rawUpdate('invoices', invoiceId, { ...c, amount_paid: paid, balance: Math.max(balance, 0), status }, currentUserId)
}

export function nextInvoiceNumber() {
  const s = getSetting('invoice', DEFAULT_INVOICE_SETTINGS)
  const used = new Set(snapshot('invoices').map((i) => i.number))
  let n = num(s.next_number) || 1001
  const fmt = (k: number) => `${s.prefix}${s.year_in_number ? new Date().getFullYear() + '-' : ''}${String(k).padStart(num(s.digits) || 4, '0')}`
  while (used.has(fmt(n))) n++
  return fmt(n)
}

export async function recordInvoicePayment(invoiceId: string, p: { amount: number; date: string; method?: string; reference?: string; notes?: string }) {
  const inv = byId('invoices', invoiceId)
  if (!inv) throw new Error('Invoice not found')
  if (inv.status === 'Cancelled') throw new Error('Cannot record a payment on a cancelled invoice')
  const amount = r2(num(p.amount))
  if (amount <= 0) throw new Error('Payment must be greater than zero')
  if (amount > num(inv.balance) + 0.005) throw new Error(`Payment exceeds the remaining balance (${fmtMoney(num(inv.balance), inv.currency)})`)
  // Money actually received -> income transaction, in the invoice currency with the invoice's reporting rate.
  const income = await create('income_transactions', {
    name: `Payment — ${inv.number}`, client_id: inv.client_id, project_id: inv.project_id, invoice_id: inv.id,
    amount, currency: inv.currency, rate_to_base: inv.rate_to_base, date: p.date, method: p.method, reference: p.reference, notes: p.notes,
  }, { silent: true })
  await create('invoice_payments', { invoice_id: invoiceId, amount, date: p.date, method: p.method, reference: p.reference, notes: p.notes, income_id: income.id })
  await recomputeInvoice(invoiceId)
  await notify({ title: `Payment received: ${fmtMoney(amount, inv.currency)}`, body: `${inv.number} — ${inv.client_name || ''}`, link: `/invoices/${invoiceId}`, kind: 'invoice' })
}

/** Permanently delete an invoice, its line items, its payments and the income entries those payments created. */
export async function deleteInvoice(invoiceId: string) {
  const inv = byId('invoices', invoiceId)
  if (!inv) throw new Error('Invoice not found')
  const pays = snapshot('invoice_payments').filter((p) => p.invoice_id === invoiceId)
  for (const p of pays) {
    if (p.income_id && byId('income_transactions', p.income_id)) await rawRemove('income_transactions', p.income_id)
    await rawRemove('invoice_payments', p.id)
  }
  // income rows tied to this invoice that lost their payment link
  for (const i of snapshot('income_transactions').filter((x) => x.invoice_id === invoiceId)) await rawRemove('income_transactions', i.id)
  for (const it of snapshot('invoice_items').filter((x) => x.invoice_id === invoiceId)) await rawRemove('invoice_items', it.id)
  await rawRemove('invoices', invoiceId)
  const extra = pays.length ? ` (also removed ${pays.length} recorded payment${pays.length === 1 ? '' : 's'} totalling ${fmtMoney(r2(pays.reduce((s, p) => s + num(p.amount), 0)), inv.currency)})` : ''
  await logActivity(`deleted invoice ${inv.number}${extra}`, 'invoices', invoiceId, 'delete')
}
export function deleteInvoiceWarning(invoiceId: string) {
  const inv = byId('invoices', invoiceId)!
  const pays = snapshot('invoice_payments').filter((p) => p.invoice_id === invoiceId)
  const total = r2(pays.reduce((s, p) => s + num(p.amount), 0))
  return `Permanently delete invoice ${inv.number}?

This cannot be undone.` + (pays.length ? `

It has ${pays.length} recorded payment${pays.length === 1 ? '' : 's'} (${fmtMoney(total, inv.currency)}). Those payments will ALSO be removed from your income and cash totals.

If you only want it to stop counting as owed, use "Cancel invoice" instead and keep the record.` : '')
}

// ---------- lead -> client conversion (lead record is preserved) ----------
export async function convertLead(leadId: string) {
  const lead = byId('leads', leadId)
  if (!lead) throw new Error('Lead not found')
  if (lead.converted_client_id && byId('clients', lead.converted_client_id)) return byId('clients', lead.converted_client_id)!
  const client = await create('clients', {
    lead_id: lead.id, name: lead.contact_person || lead.business_name, company: lead.business_name, email: lead.email, phone: lead.phone || lead.whatsapp,
    country: lead.country, website: lead.website, industry: lead.industry, assigned_to: lead.assigned_to, client_since: today(),
    services: lead.services || [], contract_value: lead.deal_value || 0, currency: lead.currency || 'USD', payment_status: 'Pending',
    category: 'New', notes: lead.notes, onboarding: [],
  }, { summary: `converted lead ${lead.business_name} into a client` })
  await rawUpdate('leads', lead.id, { status: WON, converted_client_id: client.id, last_contact: lead.last_contact || today() }, currentUserId)
  // close open follow-ups: the deal is won; they are cancelled by completion note, never silently deleted
  await notify({ title: `New client: ${client.company}`, body: 'Converted from a lead. History is preserved on the lead record.', link: `/clients/${client.id}`, kind: 'client' })
  return client
}

// ---------- subscriptions ----------
export function subEffectiveStatus(s: Row): string {
  if (s.status === 'Cancelled' || s.status === 'Paused') return s.status
  const t = today()
  const end = s.expiration_date || (!s.recurring ? s.renewal_date : null)
  if (end && end < t) return 'Expired'
  const next = s.renewal_date || s.expiration_date
  if (next && daysBetween(t, next) <= 30) return 'Expiring Soon'
  return 'Active'
}
export function monthlyCostBase(s: Row): number {
  const base = toBase(num(s.amount), num(s.rate_to_base) || 1)
  const m = { Monthly: 1, Quarterly: 1 / 3, Yearly: 1 / 12, 'One-time': 0 }[s.billing_cycle as string] ?? 1
  return r2(base * m)
}

// ---------- finance ----------
export type Range = { from?: string; to?: string }
const inRange = (d: string | undefined, r: Range) => !!d && (!r.from || d >= r.from) && (!r.to || d <= r.to)

export function financeSummary(range: Range = {}, basisOverride?: 'accrual' | 'cash') {
  const prefs = getSetting('prefs', { base_currency: BASE_DEFAULT, revenue_basis: 'accrual' })
  const basis = basisOverride || (prefs.revenue_basis as 'accrual' | 'cash')
  const income = snapshot('income_transactions').filter((i) => inRange(i.date, range))
  const expenses = snapshot('expense_transactions').filter((e) => inRange(e.date, range))
  const invs = snapshot('invoices')
  const inv = snapshot('investments').filter((i) => inRange(i.date, range))
  const sum = (rows: Row[]) => r2(rows.reduce((s, r) => s + toBase(num(r.amount), r.rate_to_base), 0))

  const cashReceived = sum(income)
  const invoiced = r2(invs.filter((i) => !['Draft', 'Cancelled'].includes(i.status) && inRange(i.issue_date, range)).reduce((s, i) => s + toBase(num(i.total), i.rate_to_base), 0))
  const directIncome = sum(income.filter((i) => !i.invoice_id)) // income not tied to an invoice (counts as revenue on both bases)
  const revenue = basis === 'cash' ? cashReceived : r2(invoiced + directIncome)
  const totalExpenses = sum(expenses)
  const investments = sum(inv)
  const receivables = r2(invs.filter((i) => !['Draft', 'Cancelled'].includes(i.status)).reduce((s, i) => s + toBase(num(i.balance), i.rate_to_base), 0))
  return { basis, revenue, invoiced, directIncome, cashReceived, expenses: totalExpenses, netProfit: r2(revenue - totalExpenses), receivables, investments, netCash: r2(cashReceived + investments - totalExpenses) }
}

// ---------- automations (run on load + every few minutes; they never mark anything contacted/completed) ----------
export async function runAutomations() {
  const t = today()
  // overdue invoices
  for (const inv of snapshot('invoices')) {
    if (['Sent', 'Partially Paid'].includes(inv.status) && inv.due_date && inv.due_date < t && num(inv.balance) > 0) {
      await rawUpdate('invoices', inv.id, { status: 'Overdue' }, currentUserId)
      await notify({ title: `Invoice ${inv.number} is overdue`, body: `${fmtMoney(num(inv.balance), inv.currency)} outstanding — ${inv.client_name || ''}`, link: `/invoices/${inv.id}`, kind: 'invoice', dedupe_key: `inv-overdue:${inv.id}` })
    }
  }
  // follow-ups due / overdue
  for (const f of snapshot('follow_ups')) {
    if (f.status !== 'pending' || f.due_date > t) continue
    const lead = byId('leads', f.lead_id)
    await notify({
      title: f.due_date < t ? `Overdue follow-up: ${lead?.business_name}` : `Follow-up due today: ${lead?.business_name}`,
      body: f.note, link: `/leads/${f.lead_id}`, user_id: f.assigned_to, kind: 'follow-up', dedupe_key: `fu:${f.id}:${f.due_date < t ? 'overdue' : 'due'}`,
    })
  }
  // overdue tasks
  for (const k of snapshot('business_tasks')) {
    if (['Completed', 'Cancelled'].includes(k.status) || !k.due_date || k.due_date >= t) continue
    await notify({ title: `Overdue task: ${k.title}`, link: '/tasks', user_id: k.assigned_to, kind: 'task', dedupe_key: `task-overdue:${k.id}:${k.due_date}` })
  }
  // subscription reminders (custom days per subscription; default 30/7/3/0)
  for (const s of snapshot('subscriptions')) {
    if (['Cancelled', 'Paused'].includes(s.status)) continue
    const target = s.renewal_date || s.expiration_date
    if (!target) continue
    const left = daysBetween(t, target)
    const days: number[] = (s.reminder_days as number[]) || [30, 7, 3, 0]
    const hit = days.filter((d) => left <= d).sort((a, b) => a - b)[0]
    if (hit === undefined || left < 0) continue
    await notify({
      title: left === 0 ? `${s.name} ${s.recurring ? 'renews' : 'expires'} today` : `${s.name} ${s.recurring ? 'renews' : 'expires'} in ${left} day${left === 1 ? '' : 's'}`,
      body: `${fmtMoney(num(s.amount), s.currency)} • ${s.recurring ? 'auto-renews' : 'manual renewal'}`, link: '/subscriptions',
      user_id: s.responsible_to, kind: 'subscription', dedupe_key: `sub:${s.id}:${target}:${hit}`,
    })
  }
}

export const isContacted = (status: string) => CONTACTED_STATUSES.includes(status)
export { addDays, isoDate }
