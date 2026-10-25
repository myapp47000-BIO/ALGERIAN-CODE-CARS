// Service worker: makes the app work fully offline after the first online visit.
// Everything the app needs is precached at install time, so no screen depends
// on having been opened before.

const VERSION = 'v0.2.1';
const CACHE = `driving-app-${VERSION}`;

const PRECACHE = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './js/logic.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './content/stages.json',
  './content/fines.json',
  './content/quizzes/stage1.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k.startsWith('driving-app-') && k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Content JSON: network first so reviewed updates reach users; cache as fallback.
  if (url.pathname.includes('/content/')) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Page navigations: fall back to the cached app shell when offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('./index.html', { ignoreSearch: true }))
    );
    return;
  }

  // Everything else (scripts, styles, icons): cache first.
  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((hit) => hit || fetch(request))
  );
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request.url, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request.url, { ignoreSearch: true });
    if (cached) return cached;
    return new Response(JSON.stringify({ error: 'offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
