/* SITS Service Worker — conservative network-first strategy.
   HTML: network first → cache fallback (offline reads).
   Static assets (fonts, images, video, css): cache first → network fallback.
   Versioned cache name; old caches purged on activate.
   Bypass: ?nosw=1 query param tells SW to skip caching for that request. */

const CACHE = 'sits-v98';

/* Файлы, которые точно нужны для офлайн-первой загрузки */
const PRECACHE = [
  '/',
  '/en',
  '/kz',
  '/manifest.webmanifest',
  '/brand/favicon.png',
  '/brand/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(PRECACHE).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

/* Эвристика: что считаем HTML-навигацией */
function isHtmlRequest(request) {
  return request.mode === 'navigate' ||
         (request.method === 'GET' &&
          request.headers.get('accept')?.includes('text/html'));
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  /* Только same-origin — внешние и API не трогаем */
  if (url.origin !== self.location.origin) return;

  /* Bypass-флаг для дебага */
  if (url.searchParams.has('nosw')) return;

  /* API, админ, _vercel (analytics/insights) — без кэша */
  if (url.pathname.startsWith('/api/') ||
      url.pathname.startsWith('/admin') ||
      url.pathname.startsWith('/crm') ||
      url.pathname.startsWith('/_vercel')) return;

  if (isHtmlRequest(req)) {
    /* HTML: network-first, чтобы всегда видеть свежую версию */
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(req, clone)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(req).then((cached) =>
          cached || caches.match('/') || new Response(
            '<h1>Нет соединения</h1><p>Попробуйте позже.</p>',
            { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
          )
        ))
    );
    return;
  }

  /* Статика: cache-first, обновляем в фоне */
  event.respondWith(
    caches.match(req).then((cached) => {
      const networkFetch = fetch(req).then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(req, clone)).catch(() => {});
        }
        return res;
      }).catch(() => cached);
      return cached || networkFetch;
    })
  );
});

/* ── Web Push: уведомления менеджерам CRM ── */
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { title: 'SITS CRM', body: (e.data && e.data.text()) || '' }; }
  const title = d.title || 'Новое сообщение';
  const opts = {
    body: d.body || '',
    icon: '/brand/apple-touch-icon.png',
    badge: '/brand/favicon.png',
    tag: d.tag || 'wa-msg',
    data: { url: d.url || '/crm' },
    vibrate: [90, 40, 90],
    renotify: true,
  };
  e.waitUntil(self.registration.showNotification(title, opts));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/crm';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) { if (c.url.includes('/crm')) { c.focus(); if ('navigate' in c) c.navigate(url); return; } }
      return clients.openWindow(url);
    })
  );
});
