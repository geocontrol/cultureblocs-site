/* My beads — offline shell only. Bump V on every deploy that changes a
 * file below. Never touches requests to anyone's server: beads are read
 * and written live, so nothing stale can be shown or saved. */
const V = 'beads-2';
const SHELL = [
  '/beads/', '/beads/beads.js', '/beads/beads.css', '/beads/lib/model.js',
  '/beads/manifest.webmanifest', '/beads/icon-192.png',
  '/style.css', '/events/events.css', '/went/went.css',
  '/went/lib/oauth.js', '/went/lib/repo.js', '/went/lib/compose.js',
  '/events/lib/render.js', '/events/lib/schedule.js', '/events/lib/atproto.js', '/events/lib/verb.js',
];
self.addEventListener('install', e =>
  e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', e =>
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('beads-') && k !== V)
    .map(k => caches.delete(k)))).then(() => self.clients.claim())));
/* Network first, so a deploy shows at once; the cache is for offline. */
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  const path = url.pathname;
  const isShell = SHELL.includes(path) || path === '/beads';
  if (!isShell) return;
  // the sign-in callback (/beads/?code=…) is never answered from the cache
  if (url.search) return;
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok) { const copy = r.clone(); caches.open(V).then(c => c.put(e.request, copy)); }
    return r;
  }).catch(() => caches.match(e.request)));
});
