// Rollback overlay: serve these bytes at /offline-sw.js with Cache-Control: no-cache.
// Wait for open drawing tabs to close naturally before retiring. Preserve all data.
self.addEventListener('activate', event => {
  event.waitUntil(self.registration.unregister());
});
