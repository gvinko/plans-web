// Retires the old Plandroid Web offline service worker that some browsers still
// have installed on this address. When the browser checks for an update it gets
// this file, which removes itself without deleting storage or reloading tabs.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Retire without deleting origin storage or interrupting unsaved drawings.
    await self.registration.unregister();
  })());
});
