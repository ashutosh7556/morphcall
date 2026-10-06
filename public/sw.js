/* MorphCall service worker: shows incoming-call notifications and opens the app to answer. */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

const windowClients = () => self.clients.matchAll({ type: 'window', includeUncontrolled: true });

const callUrl = (d) =>
  `/?incoming=${encodeURIComponent(d.callId)}&from=${encodeURIComponent(d.fromId)}&name=${encodeURIComponent(d.fromName || '')}`;

async function closeNotifications(tag) {
  const list = await self.registration.getNotifications({ tag });
  list.forEach((n) => n.close());
}

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    return;
  }

  event.waitUntil(
    (async () => {
      const clients = await windowClients();
      const visible = clients.find((c) => c.visibilityState === 'visible');

      if (data.type === 'call') {
        // App already on screen: it shows its own incoming-call screen
        if (visible) {
          visible.postMessage({ source: 'morphcall-sw', ...data });
          return;
        }
        await self.registration.showNotification(`${data.fromName || 'Someone'} is calling`, {
          body: 'Tap to answer',
          tag: `call-${data.callId}`,
          renotify: true,
          requireInteraction: true,
          vibrate: [400, 200, 400, 200, 400, 200, 400],
          icon: '/icon-192.png',
          badge: '/icon-192.png',
          data: { url: callUrl(data), call: data },
          actions: [
            { action: 'answer', title: 'Answer' },
            { action: 'decline', title: 'Decline' },
          ],
        });
        return;
      }

      if (data.type === 'cancel') {
        await closeNotifications(`call-${data.callId}`);
        clients.forEach((c) => c.postMessage({ source: 'morphcall-sw', ...data }));
        if (!visible) {
          await self.registration.showNotification(`Missed call from ${data.fromName || 'a contact'}`, {
            tag: `missed-${data.callId}`,
            icon: '/icon-192.png',
            badge: '/icon-192.png',
            data: { url: '/' },
          });
        }
        return;
      }

      if (data.type === 'friend-added') {
        clients.forEach((c) => c.postMessage({ source: 'morphcall-sw', ...data }));
        if (!visible) {
          await self.registration.showNotification(`${data.name || 'A friend'} added you`, {
            body: 'You can now call each other.',
            tag: `friend-${data.id}`,
            icon: '/icon-192.png',
            badge: '/icon-192.png',
            data: { url: '/' },
          });
        }
      }
    })()
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'decline') return; // caller sees "No answer" when ringing times out

  const { url = '/', call } = event.notification.data || {};
  event.waitUntil(
    (async () => {
      const clients = await windowClients();
      const existing = clients[0];
      if (existing) {
        await existing.focus();
        if (call) existing.postMessage({ source: 'morphcall-sw', ...call });
        return;
      }
      await self.clients.openWindow(url);
    })()
  );
});
