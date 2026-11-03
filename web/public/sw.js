// Service worker: riceve le notifiche push anche con FilmShare chiuso (finché il browser è aperto).
self.addEventListener('push', (event) => {
  let data = { title: 'FilmShare', body: '' };
  try { data = event.data ? event.data.json() : data; } catch { /* testo non JSON */ }
  event.waitUntil(
    self.registration.showNotification(data.title, { body: data.body, icon: '/favicon.svg', data: { url: data.url || '/' } }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) if ('focus' in c) { c.navigate(url); return c.focus(); }
      return self.clients.openWindow(url);
    }),
  );
});
