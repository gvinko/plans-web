import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

// Fabric owns an imperative canvas lifecycle. React StrictMode intentionally mounts, cleans up,
// and mounts effects again in development, which races Fabric disposal, blob URL revocation and
// IndexedDB hydration. Use one real workspace lifecycle so restore cannot be cancelled by a
// development-only synthetic teardown.
createRoot(document.getElementById('root')!).render(<App />);
