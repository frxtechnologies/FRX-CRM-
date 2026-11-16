import { snapshot } from './db'
import { create, getCurrentUserId, recomputeInvoice, recordInvoicePayment, remove } from './services'
import { addDays, today } from './util'

const TAG = 'SAMPLE'
const S = (n: string) => `[Sample] ${n}`

/** Clearly labelled demo records. Everything is prefixed "[Sample]" so it can be found and removed in one click. */
export async function loadSampleData() {
  const me = getCurrentUserId()!
  const other = snapshot('profiles').find((p) => p.id !== me)?.id || me
  const t = today()
  const l1 = await create('leads', { market: 'international', business_name: S('Northwind Dental Clinic'), contact_person: 'Dr. A. Example', email: 'hello@northwind.example', country: 'United Kingdom', city: 'London', industry: 'Dental Clinics', source: 'Cold Email', assigned_to: me, priority: 'high', status: 'Interested', deal_value: 2500, currency: 'USD', services: ['Website Development', 'AI Chatbots'], tags: [TAG], next_follow_up: addDays(t, 1) }, { silent: true })
  await create('leads', { market: 'international', business_name: S('Summit Property Group'), contact_person: 'J. Example', country: 'United States', industry: 'Property Management', source: 'LinkedIn', assigned_to: other, priority: 'medium', status: 'Contacted', deal_value: 4000, currency: 'USD', services: ['Web Applications'], tags: [TAG] }, { silent: true })
  await create('leads', { market: 'local', business_name: S('Sunrise Solar Lahore'), contact_person: 'Example Khan', country: 'Pakistan', city: 'Lahore', industry: 'Solar Companies', source: 'WhatsApp', assigned_to: other, priority: 'medium', status: 'New Lead', deal_value: 150000, currency: 'PKR', services: ['Website Development'], tags: [TAG] }, { silent: true })
  await create('follow_ups', { lead_id: l1.id, due_date: addDays(t, -1), assigned_to: other, status: 'pending', note: 'Sample overdue follow-up' }, { silent: true })
  await create('lead_activities', { lead_id: l1.id, type: 'Email Sent', occurred_at: new Date(Date.now() - 86400000 * 3).toISOString(), user_id: me, notes: 'Sample intro email', next_action: 'Call next week' }, { silent: true })
  await create('lead_activities', { lead_id: l1.id, type: 'Called', occurred_at: new Date(Date.now() - 86400000).toISOString(), user_id: other, notes: 'Sample call', next_action: 'Send proposal' }, { silent: true })
  const c = await create('clients', { name: S('Example Client'), company: S('Acme Builders'), email: 'acme@example.com', country: 'United States', category: 'Active', payment_status: 'Pending', currency: 'USD', contract_value: 3000, assigned_to: me, services: ['Website Development'], onboarding: [], client_since: t }, { silent: true })
  const p = await create('projects', { client_id: c.id, name: S('Acme website build'), status: 'In Progress', priority: 'high', amount: 3000, currency: 'USD', assigned_to: me, start_date: t, due_date: addDays(t, 21), services: ['Website Development'] }, { silent: true })
  await create('project_tasks', { project_id: p.id, title: 'Sample: homepage design', assigned_to: me, done: true }, { silent: true })
  await create('project_tasks', { project_id: p.id, title: 'Sample: build pages', assigned_to: other, done: false, due_date: addDays(t, 7) }, { silent: true })
  await create('business_tasks', { title: S('Research 20 dental clinics'), category: 'Lead Research', assigned_to: other, priority: 'medium', due_date: addDays(t, -2), status: 'To Do' }, { silent: true })
  await create('expense_transactions', { name: S('Domain renewal'), category: 'Hosting and Domains', amount: 15, currency: 'USD', rate_to_base: 280, date: t, method: 'Card' }, { silent: true })
  await create('investments', { investor: 'Feroze', amount: 100000, currency: 'PKR', rate_to_base: 1, date: t, purpose: S('Starting capital') }, { silent: true })
  await create('subscriptions', { name: S('Hosting plan'), provider: 'Example Host', category: 'Hosting', amount: 20, currency: 'USD', rate_to_base: 280, billing_cycle: 'Monthly', renewal_date: addDays(t, 5), recurring: false, status: 'Active', responsible_to: me, reminder_days: [30, 7, 3, 0] }, { silent: true })
  const inv = await create('invoices', { number: 'SAMPLE-0001', client_id: c.id, client_name: S('Example Client'), client_company: S('Acme Builders'), client_email: 'acme@example.com', project_id: p.id, project_name: S('Acme website build'), issue_date: t, due_date: addDays(t, 7), currency: 'USD', rate_to_base: 280, discount: 0, tax_rate: 0, status: 'Sent', payment_instructions: 'Sample payment instructions', terms: [], subtotal: 0, total: 0, amount_paid: 0, balance: 0 }, { silent: true })
  await create('invoice_items', { invoice_id: inv.id, description: 'Website design & development (sample)', quantity: 1, unit_price: 3000, position: 0 }, { silent: true })
  await recomputeInvoice(inv.id)
  await recordInvoicePayment(inv.id, { amount: 1000, date: t, method: 'Bank Transfer', reference: 'SAMPLE-ADV', notes: 'Sample advance' })
}

const SAMPLE_MARK = (r: any) => [r.business_name, r.name, r.title, r.company, r.number, r.purpose, r.investor && r.purpose].some((v) => typeof v === 'string' && (v.startsWith('[Sample]') || v.startsWith('SAMPLE-')))

export async function removeSampleData() {
  const order = ['invoice_payments', 'invoice_items', 'income_transactions', 'invoices', 'project_tasks', 'projects', 'business_tasks', 'follow_ups', 'lead_activities', 'subscriptions', 'expense_transactions', 'investments', 'clients', 'leads'] as const
  const sampleLeads = new Set(snapshot('leads').filter(SAMPLE_MARK).map((l) => l.id))
  const sampleClients = new Set(snapshot('clients').filter(SAMPLE_MARK).map((l) => l.id))
  const sampleInv = new Set(snapshot('invoices').filter(SAMPLE_MARK).map((l) => l.id))
  const sampleProj = new Set(snapshot('projects').filter(SAMPLE_MARK).map((l) => l.id))
  for (const t of order) {
    for (const r of snapshot(t)) {
      const mine = SAMPLE_MARK(r) || (t === 'follow_ups' || t === 'lead_activities' ? sampleLeads.has(r.lead_id) : false) || (t === 'invoice_items' || t === 'invoice_payments' ? sampleInv.has(r.invoice_id) : false) ||
        (t === 'project_tasks' ? sampleProj.has(r.project_id) : false) || (t === 'income_transactions' ? sampleInv.has(r.invoice_id) || sampleClients.has(r.client_id) : false)
      if (mine) await remove(t, r.id, { silent: true })
    }
  }
}
export const hasSampleData = () => snapshot('leads').some(SAMPLE_MARK) || snapshot('clients').some(SAMPLE_MARK)
