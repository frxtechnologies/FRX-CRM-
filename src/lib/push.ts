import { supabase } from './db'

/** Phone alerts (web push). The public key is safe to ship; the matching PRIVATE key lives only in Supabase secrets. */
export const VAPID_PUBLIC = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) || ''

export const pushSupported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
export const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true
export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

const toKey = (b64: string) => {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

export type PushState = 'unsupported' | 'needs-install' | 'not-configured' | 'blocked' | 'off' | 'on'

export async function pushState(): Promise<PushState> {
  if (!pushSupported()) return isIOS() && !isStandalone() ? 'needs-install' : 'unsupported'
  if (isIOS() && !isStandalone()) return 'needs-install' // iPhones only allow alerts for sites added to the home screen
  if (!VAPID_PUBLIC) return 'not-configured'
  if (Notification.permission === 'denied') return 'blocked'
  const reg = await navigator.serviceWorker.getRegistration('/')
  const sub = await reg?.pushManager.getSubscription()
  return sub && Notification.permission === 'granted' ? 'on' : 'off'
}

export async function enablePush(userId: string) {
  if (!VAPID_PUBLIC) throw new Error('Phone alerts are not configured yet (missing VITE_VAPID_PUBLIC_KEY).')
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') throw new Error('Permission was not given. Allow notifications for this site in your phone or browser settings, then try again.')
  const reg = (await navigator.serviceWorker.getRegistration('/')) || (await navigator.serviceWorker.register('/sw.js'))
  await navigator.serviceWorker.ready
  let sub = await reg.pushManager.getSubscription()
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(VAPID_PUBLIC) as BufferSource })
  const j = sub.toJSON()
  const { error } = await supabase!.from('push_subscriptions').upsert(
    { user_id: userId, endpoint: sub.endpoint, p256dh: j.keys?.p256dh, auth: j.keys?.auth, user_agent: navigator.userAgent.slice(0, 200) },
    { onConflict: 'endpoint' },
  )
  if (error) throw new Error(/push_subscriptions/.test(error.message) ? 'The alerts table is missing: run supabase/8-phone-alerts.sql in Supabase first.' : error.message)
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration('/')
  const sub = await reg?.pushManager.getSubscription()
  if (sub) {
    await supabase!.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
    await sub.unsubscribe()
  }
}

export async function myDeviceCount(): Promise<number> {
  const { count } = await supabase!.from('push_subscriptions').select('id', { count: 'exact', head: true })
  return count || 0
}

/** Asks the Supabase function to push a test message to every device you have turned alerts on for. */
export async function sendTestAlert(): Promise<{ sent: number; failed: number }> {
  const { data, error } = await supabase!.functions.invoke('phone-alerts', { body: { test: true } })
  if (error) {
    const body = await (error as any).context?.json?.().catch(() => null)
    throw new Error(body?.error || 'The alert sender is not set up yet. Deploy the phone-alerts function in Supabase (see the README).')
  }
  return data as { sent: number; failed: number }
}
