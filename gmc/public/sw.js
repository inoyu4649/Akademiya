// GMCAuto Service Worker v2.8

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', event => {
  if (!event.data) return;
  const { title, body } = event.data.json();
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/logo_gmc.png',
      badge: '/logo_gmc.png',
      tag: 'gmcauto',
      renotify: true,
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(list => {
        for (const client of list) {
          if ('focus' in client) return client.focus();
        }
        if (self.clients.openWindow) return self.clients.openWindow('/');
      })
  );
});
