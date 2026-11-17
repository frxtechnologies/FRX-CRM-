/* FRX Business OS service worker: receives phone alerts (web push). It deliberately caches nothing,
   so the app can never get stuck on an old version. */
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let d = {}
  try { d = event.data ? event.data.json() : {} } catch (e) { d = { body: event.data ? event.data.text() : '' } }
  event.waitUntil(
    self.registration.showNotification(d.title || 'FRX Business OS', {
      body: d.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: d.tag || undefined,
      renotify: !!d.tag,
      data: { url: d.url || '/' },
    }),
  )
})

// Only ever open pages on THIS site, whatever the notification says.
const safeTarget = (u) => {
  try { const x = new URL(u || '/', self.location.origin); return x.origin === self.location.origin ? x.href : self.location.origin + '/' } catch (e) { return self.location.origin + '/' }
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = safeTarget(event.notification.data && event.notification.data.url)
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const c of wins) {
      if ('focus' in c) {
        await c.focus()
        if ('navigate' in c) { try { await c.navigate(url) } catch (e) { /* ignore */ } }
        return
      }
    }
    await self.clients.openWindow(url)
  })())
})
