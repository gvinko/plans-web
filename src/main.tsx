import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

// Ask the browser to retain offline plans and STLs when storage persistence is supported.
// Some browsers decline silently; the UI must never assume this is guaranteed.
if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
  void navigator.storage.persist().catch(() => false);
}

// Fabric owns an imperative canvas lifecycle. React StrictMode intentionally mounts, cleans up,
// and mounts effects again in development, which races Fabric disposal, blob URL revocation and
// IndexedDB hydration. Use one real workspace lifecycle so restore cannot be cancelled by a
// development-only synthetic teardown.
createRoot(document.getElementById('root')!).render(<App />);
