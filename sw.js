/* Service worker — app shell cache, network-first for APIs */

const CACHE = 'cbh-v0.2.0';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/icon.svg',
  './css/style.css',
  './js/storage.js',
  './js/auth.js',
  './js/apis.js',
  './js/ocr.js',
  './js/analytics.js',
  './js/portfolio.js',
  './js/marketplace.js',
  './js/watchlist.js',
  './js/customers.js',
  './js/share.js',
  './js/ui.js',
  './js/main.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  // Skip API requests — always go to network so prices stay fresh
  if (/(pokemontcg\.io|scryfall\.com|ygoprodeck\.com|ebay\.com|tesseract)/.test(url.hostname)) return;
  e.respondWith(
    caches.match(e.request).then(cached => {
      const fetchProm = fetch(e.request).then(resp => {
        if (resp && resp.status === 200 && resp.type === 'basic') {
          const c2 = resp.clone();
          caches.open(CACHE).then(c => c.put(e.request, c2));
        }
        return resp;
      }).catch(() => cached);
      return cached || fetchProm;
    })
  );
});
