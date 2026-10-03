/* City Life Auto service worker: makes the game installable as its own app and lets practice mode
   run offline. Scope is /city-life-auto/ only (it's served from that folder), so it never touches
   the other games on deadbaron.com (/neon-asteroids/, /gear-bugs/), and it only ever clears its own
   "city-life-auto-" caches.
   Network-first for this game's files, so online players always get the newest build (the boot
   loader's version.json check keeps working); the cached copy is just the offline fallback.
   Requests to other origins (the game server's WebSocket, fonts CDNs, analytics) are left alone. */
const CACHE = 'city-life-auto-v2';
const CORE = ['./', 'index.html', 'manifest.webmanifest', 'client/boot.js', 'assets/logo.png', 'assets/icons/icon-192.png', 'assets/icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).catch(() => {}).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('city-life-auto-') && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
// the page's "Repair install" button asks every copy of this worker to drop its caches
self.addEventListener('message', (e) => {
  if (e.data !== 'cla-reset') return;
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('city-life-auto-')).map((k) => caches.delete(k)))));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;
  e.respondWith(
    fetch(req).then((res) => {
      if (res.ok && req.cache !== 'no-store' && !url.pathname.endsWith('version.json')) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match('./')))
  );
});
