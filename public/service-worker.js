const CACHE = 'maths-app-v2';

// On install: cache the app shell
self.addEventListener('install', (e) => {
  self.skipWaiting();
});

// On activate: clean up old caches
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// On fetch: cache-first for static assets, network-first for navigation
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;

  // Navigation requests (HTML pages) — network first, fall back to cache
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(e.request, copy));
          return response;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // Static assets — cache first, update in background
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const fetchPromise = fetch(e.request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(e.request, copy));
        }
        return response;
      });
      return cached || fetchPromise;
    })
  );
});
