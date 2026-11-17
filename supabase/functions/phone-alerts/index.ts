// FRX Business OS - phone alerts (Supabase Edge Function, name it exactly: phone-alerts).
//
// Deploy: Supabase dashboard -> Edge Functions -> Deploy a new function -> paste this file -> name "phone-alerts".
//         Then open the function's settings and switch OFF "Enforce JWT verification"
//         (this function checks who is calling by itself, see below).
//
// Secrets to add (Edge Functions -> Secrets):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (e.g. mailto:you@example.com), WEBHOOK_SECRET
//   optional: TZ_NAME (default Asia/Karachi), ALLOWED_ORIGIN (your Netlify address, locks CORS down)
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided to every function automatically.
//
// Who may call it:
//   1. The database (a trigger / cron job), proving itself with the x-webhook-secret header.
//   2. A signed-in partner pressing "Send me a test alert" in Settings (their own login token). Test mode can
//      only ever message that partner's own devices.
// Anyone else gets a 400/401 and nothing is sent. The private key and service-role key never leave this function.

import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'npm:@supabase/supabase-js@2'

const env = (k: string) => Deno.env.get(k) ?? ''
const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })

let vapidReady = false
function initVapid() {
  if (vapidReady) return
  if (!env('VAPID_PUBLIC_KEY') || !env('VAPID_PRIVATE_KEY')) throw new Error('Alert keys are missing: add VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in Edge Functions -> Secrets.')
  webpush.setVapidDetails(env('VAPID_SUBJECT') || 'mailto:admin@example.com', env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'))
  vapidReady = true
}

const CORS = {
  'Access-Control-Allow-Origin': env('ALLOWED_ORIGIN') || '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

// constant-time string compare, so the secret cannot be guessed by timing
function same(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}
const clip = (s: unknown, n: number) => String(s ?? '').slice(0, n)

type Payload = { title: string; body: string; url?: string; tag?: string }

async function sendTo(userIds: string[], payload: Payload) {
  if (!userIds.length) return { sent: 0, failed: 0 }
  initVapid()
  const { data: subs, error } = await admin.from('push_subscriptions').select('id,endpoint,p256dh,auth').in('user_id', userIds)
  if (error) throw error
  let sent = 0, failed = 0
  await Promise.all((subs ?? []).map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 60 * 60 * 12, urgency: 'high' })
      sent++
    } catch (e) {
      failed++
      const code = (e as { statusCode?: number }).statusCode
      // visible in Supabase -> Edge Functions -> phone-alerts -> Logs (host and reason only, never keys or message text)
      console.error('push delivery failed:', new URL(s.endpoint).host, code ?? '', clip((e as Error)?.message, 160))
      // 404/410 = the phone removed the app or revoked permission: forget that device
      if (code === 404 || code === 410) await admin.from('push_subscriptions').delete().eq('id', s.id)
    }
  }))
  return { sent, failed }
}

// ---- instant alert: a row was added to `notifications` ----
async function onNotification(n: { id: string; user_id: string | null; created_by: string | null; title: string; body: string | null; link: string | null }) {
  const { data: profs } = await admin.from('profiles').select('id')
  const everyone = (profs ?? []).map((p) => p.id as string)
  // a notification for one person goes to them; one with no person goes to both. Never alert the person who caused it.
  const targets = (n.user_id ? [n.user_id] : everyone).filter((id) => id !== n.created_by)
  return sendTo(targets, { title: clip(n.title, 80) || 'FRX Business OS', body: clip(n.body, 160), url: n.link || '/', tag: n.id })
}

// ---- morning summary ----
const addDays = (iso: string, n: number) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }

async function dailyDigest() {
  const tz = env('TZ_NAME') || 'Asia/Karachi'
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date())
  const in7 = addDays(today, 7)
  const [profs, fus, tasks, invs, subs] = await Promise.all([
    admin.from('profiles').select('id'),
    admin.from('follow_ups').select('assigned_to,due_date').eq('status', 'pending').lte('due_date', today),
    admin.from('business_tasks').select('assigned_to,due_date').neq('status', 'Completed').neq('status', 'Cancelled').lte('due_date', today),
    admin.from('invoices').select('number').eq('status', 'Overdue'),
    admin.from('subscriptions').select('name,renewal_date,expiration_date,recurring,status').neq('status', 'Cancelled').neq('status', 'Paused'),
  ])
  const overdueInv = invs.data?.length ?? 0
  const renewing = (subs.data ?? []).filter((s) => { const d = s.renewal_date || s.expiration_date; return d && d >= today && d <= in7 })
  let digests = 0
  for (const p of profs.data ?? []) {
    const mineF = (fus.data ?? []).filter((f) => f.assigned_to === p.id)
    const lateF = mineF.filter((f) => f.due_date < today).length
    const mineT = (tasks.data ?? []).filter((t) => t.assigned_to === p.id || !t.assigned_to).length
    const parts: string[] = []
    if (mineF.length) parts.push(`${mineF.length} follow-up${mineF.length === 1 ? '' : 's'}${lateF ? ` (${lateF} late)` : ''}`)
    if (mineT) parts.push(`${mineT} task${mineT === 1 ? '' : 's'} due`)
    if (overdueInv) parts.push(`${overdueInv} overdue invoice${overdueInv === 1 ? '' : 's'}`)
    if (renewing.length) parts.push(`${clip(renewing[0].name, 24)}${renewing.length > 1 ? ` +${renewing.length - 1}` : ''} renews soon`)
    if (!parts.length) continue // nothing to say: stay quiet
    const r = await sendTo([p.id as string], { title: 'FRX OS: today', body: parts.join(' · '), url: '/', tag: `digest-${today}` })
    if (r.sent) digests++
  }
  return { digests }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return reply({ error: 'POST only' }, 405)
  let body: any
  try { body = await req.json() } catch { return reply({ error: 'Bad request' }, 400) }

  try {
    const trusted = same(req.headers.get('x-webhook-secret') ?? '', env('WEBHOOK_SECRET'))
    if (trusted && body?.type === 'INSERT' && body?.table === 'notifications' && body.record) return reply(await onNotification(body.record))
    if (trusted && body?.digest) return reply(await dailyDigest())

    if (body?.test) {
      const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
      const { data } = await admin.auth.getUser(token)
      const user = data?.user
      if (!user) return reply({ error: 'You are not signed in.' }, 401)
      const { data: p } = await admin.from('profiles').select('id').eq('id', user.id).maybeSingle()
      if (!p) return reply({ error: 'This account is not a partner.' }, 403)
      return reply(await sendTo([user.id], { title: 'FRX Business OS', body: 'Test alert: phone alerts are working ✅', url: '/', tag: 'test' }))
    }
    return reply({ error: 'Unknown request' }, 400)
  } catch (e) {
    console.error(e)
    return reply({ error: clip((e as Error)?.message || 'Failed', 200) }, 500)
  }
})
