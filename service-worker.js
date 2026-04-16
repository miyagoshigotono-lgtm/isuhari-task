// =====================
// Service Worker
// オフラインキャッシュ
// =====================

const CACHE_NAME = 'isuhari-task-v1';

const CACHE_FILES = [
  './',
  './index.html',
  './css/style.css',
  './js/config.js',
  './js/master.js',
  './js/calendar.js',
  './js/order.js',
  './js/timer.js',
  './js/main.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(CACHE_FILES))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
