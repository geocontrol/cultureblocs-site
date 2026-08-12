const V = 'pt-3';   // bump on every deploy: old shells are cached hard
// Absolute paths: this app is served at /pocket/ and a relative shell
// mis-resolves when the page is opened without the trailing slash.
const SHELL = ['/pocket/', '/pocket/index.html', '/pocket/oauth.js',
               '/pocket/manifest.webmanifest', '/pocket/icon-192.png',
               '/pocket/icon-512.png'];
self.addEventListener('install', e =>
  e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', e =>
  e.waitUntil(caches.keys().then(ks =>
    Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;             // never intercept mints
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
