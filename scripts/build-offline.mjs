import fs from 'node:fs';
import crypto from 'node:crypto';
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(`${d}/${e.name}`) : [`${d}/${e.name}`]);
const files = walk('dist').filter(p => !/\/(?:_|sw\.js|registerSW\.js|offline-sw\.js)/.test(p));
const hash = crypto.createHash('sha256');
for (const p of files.sort()) hash.update(fs.readFileSync(p));
const cache = `ductplanner-shell-${hash.digest('hex').slice(0, 16)}`;
fs.writeFileSync('dist/offline-sw.js', `
const CACHE = ${JSON.stringify(cache)};
const FILES = ${JSON.stringify(files.map(p => '/' + p.slice(5)))};
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES))));
// Updates wait for open tabs to close. Never reload a drawing or touch IndexedDB.
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).then(response => response.ok ? response : caches.open(CACHE).then(c => c.match('/index.html'))).catch(() => caches.open(CACHE).then(c => c.match('/index.html'))));
  } else if (FILES.includes(url.pathname)) {
    // Public immutable same-origin assets may have Vary: Origin from the host.
    event.respondWith(caches.open(CACHE).then(async c => (await c.match(url.pathname, { ignoreVary: true })) || fetch(req)));
  }
});
`);
console.log(`Offline shell: ${files.length} files, ${cache}`);
