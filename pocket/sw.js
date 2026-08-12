const V = 'pt-2';   // bump on every deploy: old shells are cached hard
const SHELL = ['.', 'index.html', 'oauth.js', 'manifest.webmanifest',
               'icon-192.png', 'icon-512.png'];
self.addEventListener('install', e =>
  e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', e =>
  e.waitUntil(caches.keys().then(ks =>
    Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;             // never intercept mints
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
