import { byId, snapshot, rawUpdate, type Row } from './db'
import { create, update, convertLead, getCurrentUserId, partnerName } from './services'
import { WON } from './constants'
import { today } from './util'

const digits = (s?: string) => (s || '').replace(/\D/g, '').replace(/^0+/, '').slice(-9)
const domain = (s?: string) => (s || '').toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].trim()
const nameKey = (s?: string) => (s || '').toLowerCase().replace(/\b(pvt|ltd|llc|inc|co|company|limited|private|the)\b/g, '').replace(/[^a-z0-9]/g, '')

/** Duplicate detection across BOTH partners' leads: same business name, phone/WhatsApp, email or website domain. */
export function findDuplicates(c: Partial<Row>, excludeId?: string): { lead: Row; reason: string }[] {
  const out: { lead: Row; reason: string }[] = []
  const n = nameKey(c.business_name), ph = [digits(c.phone), digits(c.whatsapp)].filter((x) => x.length >= 7)
  const em = (c.email || '').toLowerCase().trim(), dm = domain(c.website)
  for (const l of snapshot('leads')) {
    if (l.id === excludeId) continue
    let reason = ''
    if (n && nameKey(l.business_name) === n) reason = 'same business name'
    else if (ph.length && [digits(l.phone), digits(l.whatsapp)].some((x) => x && ph.includes(x))) reason = 'same phone / WhatsApp'
    else if (em && (l.email || '').toLowerCase().trim() === em) reason = 'same email'
    else if (dm && domain(l.website) === dm) reason = 'same website'
    if (reason) out.push({ lead: l, reason })
  }
  return out
}

export async function syncNextFollowUp(leadId: string) {
  const pending = snapshot('follow_ups').filter((f) => f.lead_id === leadId && f.status === 'pending').sort((a, b) => a.due_date.localeCompare(b.due_date))
  const next = pending[0]?.due_date ?? null
  if (byId('leads', leadId)?.next_follow_up !== next) await rawUpdate('leads', leadId, { next_follow_up: next }, getCurrentUserId())
}

export async function scheduleFollowUp(leadId: string, due: string, assignedTo?: string | null, note?: string, reminderAt?: string) {
  const lead = byId('leads', leadId)
  const f = await create('follow_ups', { lead_id: leadId, due_date: due, assigned_to: assignedTo || lead?.assigned_to || getCurrentUserId(), status: 'pending', note: note || '', reminder_at: reminderAt || null }, { summary: `scheduled a follow-up with ${lead?.business_name} for ${due} (assigned to ${partnerName(assignedTo || lead?.assigned_to)})` })
  await syncNextFollowUp(leadId)
  return f
}

export async function completeFollowUp(f: Row, note?: string) {
  await update('follow_ups', f.id, { status: 'completed', completed_at: new Date().toISOString(), completed_by: getCurrentUserId(), note: note ? `${f.note ? f.note + ' — ' : ''}${note}` : f.note })
  await create('lead_activities', { lead_id: f.lead_id, type: 'Follow-up Completed', occurred_at: new Date().toISOString(), user_id: getCurrentUserId(), notes: note || f.note || '', next_action: '' }, { silent: true })
  await rawUpdate('leads', f.lead_id, { last_contact: today() }, getCurrentUserId())
  await syncNextFollowUp(f.lead_id)
}

export async function rescheduleFollowUp(f: Row, due: string) {
  await update('follow_ups', f.id, { due_date: due }, { summary: `rescheduled follow-up with ${byId('leads', f.lead_id)?.business_name} to ${due}` })
  await syncNextFollowUp(f.lead_id)
}

export async function setLeadStatus(lead: Row, status: string): Promise<boolean> {
  if (status === lead.status) return false
  if (status === WON && !lead.converted_client_id) {
    if (!window.confirm(`Mark "${lead.business_name}" as Won and convert it into a client?\nThe lead record and its full history will be kept.`)) return false
    await convertLead(lead.id)
    return true
  }
  await update('leads', lead.id, { status })
  return true
}

/** Log a manual contact activity. Only records what the partner says happened; status is never changed automatically. */
export async function logLeadActivity(leadId: string, a: { type: string; notes?: string; next_action?: string; occurred_at?: string; user_id?: string }) {
  const lead = byId('leads', leadId)
  const row = await create('lead_activities', { lead_id: leadId, type: a.type, occurred_at: a.occurred_at || new Date().toISOString(), user_id: a.user_id || getCurrentUserId(), notes: a.notes || '', next_action: a.next_action || '' },
    { summary: `logged "${a.type}" for ${lead?.business_name}` })
  await rawUpdate('leads', leadId, { last_contact: (a.occurred_at || new Date().toISOString()).slice(0, 10) }, getCurrentUserId())
  return row
}
