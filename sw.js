// Retires the old Plandroid Web offline service worker that some browsers still
// have installed on this address. When the browser checks for an update it gets
// this file, which clears the old cached copy of the site, removes itself and
// reloads the open tabs onto the current Ductplanner.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
    await self.registration.unregister();
    const tabs = await self.clients.matchAll({ type: 'window' });
    tabs.forEach((tab) => tab.navigate(tab.url));
  })());
});
