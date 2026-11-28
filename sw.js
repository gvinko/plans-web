// Generated build manifest; the development copy is never registered.
const manifest = {"build":"dec0b9ff7851-2026-11-28T08:49:46.469Z","assets":["/assets/BackupMenu-DH3qg23w.js","/assets/DeleteProjectDialog-B9dVnIzv.js","/assets/DrawingWorkspace-Bxom-Nlu.js","/assets/NotFound-CXX1BJeX.js","/assets/dist-D2WV4DaG.js","/assets/echo-logo-BSx2eH0V.png","/assets/es2015-BCQ_G8zO.js","/assets/index-D2-Qj8H9.css","/assets/index-D8NsxXuX.js","/assets/jszip.min-CNywUge4.js","/assets/pdf.worker.min-yatZIOMy.mjs","/favicon.svg","/index.html"]};
const prefix = 'ductplanner-shell-v2-';
const cacheName = prefix + manifest?.build;
const urls = new Set(manifest?.assets || []);

self.addEventListener('install', event => {
  if (!manifest) return;
  // An incomplete release must not replace a working offline release.
  event.waitUntil((async () => {
    const cache = await caches.open(cacheName);
    await cache.addAll([...urls].map(url => new Request(url, { cache: 'reload' })));
  })());
});
self.addEventListener('activate', event => {
  if (!manifest) return;
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith(prefix) && key !== cacheName) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  if (!manifest || event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (event.request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(event.request);
        if (response.ok) return response;
      } catch { /* disconnected */ }
      return (await caches.open(cacheName)).match('/index.html');
    })());
  } else if (urls.has(url.pathname) && url.pathname !== '/index.html') {
    event.respondWith((async () => {
      const cache = await caches.open(cacheName);
      return (await cache.match(url.pathname)) || fetch(event.request);
    })());
  }
  // version.json, requests outside the app shell and other origins remain network-only.
});
