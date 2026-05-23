/* ============================================================
   SERVICE WORKER — offline cache
   ============================================================ */

const CACHE = 'hoc-v1.0.0';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/icon.svg',
  './assets/logo-wordmark.svg',
  './css/style.css',
  './js/storage.js',
  './js/audio.js',
  './js/data.js',
  './js/payments.js',
  './js/social.js',
  './js/notifications.js',
  './js/game.js',
  './js/ui.js',
  './js/main.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(cached => {
      const fetchProm = fetch(e.request).then(resp => {
        if (resp && resp.status === 200 && resp.type === 'basic') {
          const respClone = resp.clone();
          caches.open(CACHE).then(c => c.put(e.request, respClone));
        }
        return resp;
      }).catch(() => cached);
      return cached || fetchProm;
    })
  );
});
