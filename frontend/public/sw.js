// Akademiya PWA Service Worker — 푸시 알림 처리

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: event.data.text() };
  }

  const title = data.title || "Akademiya 알림";
  const options = {
    body: data.body || "",
    icon: "/logo.png",
    badge: "/logo.png",
    data: { link: data.link || "/" },
    vibrate: [200, 100, 200],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const link = event.notification.data?.link || "/";
  const url = link.startsWith("http") ? link : self.location.origin + link;

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        for (const client of windowClients) {
          if (client.url === url && "focus" in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
  );
});
