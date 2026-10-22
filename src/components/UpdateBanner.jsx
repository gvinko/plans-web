import { useEffect, useState } from 'react';

// Shows a bar when a newer Ductplanner build is live than the one in this tab.
// Checks /version.json when the tab comes back into view and every 5 minutes.
const MINE = typeof __DP_BUILD__ !== 'undefined' ? __DP_BUILD__ : '';
const EVERY_MS = 5 * 60 * 1000;

export default function UpdateBanner() {
  const [newer, setNewer] = useState(false);

  useEffect(() => {
    if (!MINE || MINE.startsWith('local-')) return undefined; // dev server
    let stop = false;
    const check = async () => {
      if (stop || document.visibilityState !== 'visible') return;
      try {
        const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) return;
        const live = await res.json();
        if (live?.build && live.build !== MINE) setNewer(true);
      } catch { /* offline — try again later */ }
    };
    check();
    const t = setInterval(check, EVERY_MS);
    document.addEventListener('visibilitychange', check);
    return () => { stop = true; clearInterval(t); document.removeEventListener('visibilitychange', check); };
  }, []);

  if (!newer) return null;
  return (
    <div role="status" className="dp-noprint fixed bottom-3 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-3 rounded-lg border border-amber-500 bg-amber-50 px-3 py-2 text-sm text-amber-900 shadow-lg dark:bg-amber-950 dark:text-amber-100">
      <span>A newer version of Ductplanner is live. Your drawing saves automatically.</span>
      <button type="button" className="rounded-md bg-amber-600 px-3 py-1 font-medium text-white hover:bg-amber-700" onClick={() => { window.dispatchEvent(new Event('dp-save-now')); setTimeout(() => window.location.reload(), 1200); }}>
        Refresh
      </button>
    </div>
  );
}
