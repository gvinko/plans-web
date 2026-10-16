import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

// After a new version is deployed, an open tab can ask for files that no longer
// exist. Reload once to pick up the new version instead of failing.
window.addEventListener('vite:preloadError', (event) => {
  try {
    if (sessionStorage.getItem('dp-reloaded-for-update')) return;
    sessionStorage.setItem('dp-reloaded-for-update', '1');
  } catch { /* ignore */ }
  event.preventDefault();
  window.location.reload();
});
window.addEventListener('load', () => {
  setTimeout(() => { try { sessionStorage.removeItem('dp-reloaded-for-update'); } catch { /* ignore */ } }, 10000);
});

// Remove any offline service worker left by the old app on this address, plus its caches.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister())).catch(() => {});
  if (window.caches?.keys) caches.keys().then((keys) => keys.forEach((k) => caches.delete(k))).catch(() => {});
}

createRoot(document.getElementById('root')).render(<App />);
