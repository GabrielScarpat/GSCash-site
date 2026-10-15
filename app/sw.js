/* GSCASH — service worker: só recebe o lembrete diário e abre o app ao tocar nele.
   Não guarda nada em cache (o site continua vindo sempre da internet). */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { corpo: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.titulo || 'GSCASH', {
    body: d.corpo || '',
    icon: 'icones/app-192.png',
    badge: 'icones/selo-96.png',
    tag: d.tag || 'gscash-lembrete',  // um lembrete novo substitui o anterior
    data: { url: d.url || 'index.html' },
  }));
});

// toque na notificação: usa a janela do GSCASH que já estiver aberta, ou abre uma nova
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL(e.notification.data.url, self.registration.scope).href;
  e.waitUntil((async () => {
    const janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const aberta = janelas.find(j => j.url.startsWith(self.registration.scope));
    if (aberta) {
      await aberta.navigate(url).catch(() => {});
      return aberta.focus();
    }
    return self.clients.openWindow(url);
  })());
});
