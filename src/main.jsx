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

// Only built releases install a versioned offline shell. Never clear unrelated caches
// or force a reload of an open drawing when the service worker updates.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch(err => console.warn('Offline setup unavailable:', err));
  });
}

createRoot(document.getElementById('root')).render(<App />);
