import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { db } from './db';
import type { PlanPage } from './db/schema';
import { createProject, createPlanPage, deleteProjectCascade } from './db/repository';
import { useAppStore } from './store/appStore';
import CanvasWorkspace from './components/CanvasWorkspace';

const PLANDROID_VERSION = '0.6.0';
const BUILD_ID = '2026-09-25-RECOVERY-DIAG-1';

export default function App() {
  const { offlineReady, needRefresh, updateServiceWorker } = useRegisterSW();
  const projects = useLiveQuery(() => db.projects.orderBy('updatedAt').reverse().toArray(), []);
  const { activeProjectId, activePlanPageId, setActiveProject, setActivePlanPage } = useAppStore();
  const [showNewProject, setShowNewProject] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [suburb, setSuburb] = useState('');
  const [showRecovery, setShowRecovery] = useState(false);
  const [recoveryReport, setRecoveryReport] = useState<string>('Not scanned yet.');
  const creatingPageForProjectRef = useRef<string | null>(null);

  const pagesForActiveProject = useLiveQuery(
    () =>
      activeProjectId
        ? db.planPages.where({ projectId: activeProjectId }).sortBy('order')
        : Promise.resolve<PlanPage[]>([]),
    [activeProjectId],
  );

  // Every opened project needs at least one plan page to draw on.
  // Prefer a page that actually contains saved work. Older builds could race page creation and
  // leave an empty Level 1 beside the page that contains the drawing; always choosing [0] then
  // made a correctly-saved project appear completely empty on reopen.
  useEffect(() => {
    if (!activeProjectId || !pagesForActiveProject) return;
    if (pagesForActiveProject.length > 0) {
      creatingPageForProjectRef.current = null;
      if (!activePlanPageId) {
        const objectCount = (page: PlanPage) => {
          if (!page.canvasJSON) return 0;
          try {
            const parsed = JSON.parse(page.canvasJSON) as { objects?: unknown[] };
            return parsed.objects?.length ?? 0;
          } catch {
            return 0;
          }
        };
        const preferred = [...pagesForActiveProject].sort((a, b) => {
          const scoreA = objectCount(a) * 10 + (a.backgroundImage ? 1 : 0) + (a.sketchImage ? 1 : 0);
          const scoreB = objectCount(b) * 10 + (b.backgroundImage ? 1 : 0) + (b.sketchImage ? 1 : 0);
          return scoreB - scoreA || a.order - b.order;
        })[0];
        setActivePlanPage(preferred.id);
      }
      return;
    }

    // Guard against duplicate page creation while Dexie's live query is catching up.
    if (creatingPageForProjectRef.current === activeProjectId) return;
    creatingPageForProjectRef.current = activeProjectId;
    createPlanPage(activeProjectId, 'Level 1')
      .then((page) => setActivePlanPage(page.id))
      .finally(() => {
        if (creatingPageForProjectRef.current === activeProjectId) creatingPageForProjectRef.current = null;
      });
  }, [activeProjectId, pagesForActiveProject, activePlanPageId, setActivePlanPage]);

  async function runReadOnlyRecoveryScan() {
    try {
      const projectRows = await db.projects.toArray();
      const pageRows = await db.planPages.toArray();
      const lines: string[] = [];
      lines.push('READ-ONLY RECOVERY SCAN');
      lines.push(`Database: ${db.name} | version: ${db.verno}`);
      lines.push(`Projects: ${projectRows.length} | Plan pages: ${pageRows.length}`);
      lines.push('');

      if (projectRows.length === 0) lines.push('No project records visible in this IndexedDB database.');
      for (const project of projectRows) {
        const pages = pageRows.filter((page) => page.projectId === project.id);
        lines.push(`PROJECT ${project.name} | id=${project.id} | pages=${pages.length}`);
        for (const page of pages) {
          let objectCount = 0;
          let jsonState = page.canvasJSON ? 'present' : 'none';
          if (page.canvasJSON) {
            try {
              const parsed = JSON.parse(page.canvasJSON) as { objects?: unknown[] };
              objectCount = parsed.objects?.length ?? 0;
            } catch {
              jsonState = 'INVALID JSON';
            }
          }
          lines.push(
            `  PAGE ${page.name} | id=${page.id} | objects=${objectCount} | canvas=${jsonState} | bg=${page.backgroundImage ? 'Y' : 'N'} | sketch=${page.sketchImage ? 'Y' : 'N'}`,
          );
        }
      }

      const orphanPages = pageRows.filter((page) => !projectRows.some((project) => project.id === page.projectId));
      if (orphanPages.length) {
        lines.push('');
        lines.push(`ORPHAN PLAN PAGES: ${orphanPages.length}`);
        for (const page of orphanPages) {
          let objectCount = 0;
          if (page.canvasJSON) {
            try {
              const parsed = JSON.parse(page.canvasJSON) as { objects?: unknown[] };
              objectCount = parsed.objects?.length ?? 0;
            } catch { /* report only */ }
          }
          lines.push(`  id=${page.id} | projectId=${page.projectId} | objects=${objectCount} | bg=${page.backgroundImage ? 'Y' : 'N'}`);
        }
      }

      // Browser-level database names are diagnostic only. This does not open, upgrade,
      // create, delete, or mutate any database.
      const listDatabases = (indexedDB as IDBFactory & { databases?: () => Promise<Array<{ name?: string; version?: number }>> }).databases;
      if (listDatabases) {
        const databases = await listDatabases.call(indexedDB);
        lines.push('');
        lines.push('BROWSER INDEXEDDB DATABASES:');
        databases.forEach((entry) => lines.push(`  ${entry.name ?? '(unnamed)'} v${entry.version ?? '?'}`));
      } else {
        lines.push('');
        lines.push('Browser does not expose indexedDB.databases(); plandroid_web scan above is still valid.');
      }

      setRecoveryReport(lines.join('\n'));
      setShowRecovery(true);
    } catch (err) {
      setRecoveryReport(`READ-ONLY SCAN FAILED\n${err instanceof Error ? err.message : String(err)}`);
      setShowRecovery(true);
    }
  }

  if (activeProjectId && activePlanPageId) {
    return <CanvasWorkspace />;
  }

  return (
    <div className="h-full flex flex-col">
      <header className="flex items-center justify-between px-4 py-2 border-b border-slate-700">
        <h1 className="font-mono text-sm tracking-wide">PLANDROID WEB <span className="text-sky-400">v{PLANDROID_VERSION}</span> <span className="text-slate-500">Build {BUILD_ID}</span></h1>
        <div className="flex items-center gap-2">
          <a href="https://chatgpt.com/" target="_blank" rel="noreferrer" className="text-xs bg-emerald-700 hover:bg-emerald-600 px-2 py-1 rounded">Ask ChatGPT</a>
          <span className="text-xs text-slate-400">{needRefresh ? 'Update available' : offlineReady ? 'Up to date · offline ready' : 'Checking version…'}</span>
        </div>
        {needRefresh && (
          <button className="text-xs bg-sky-600 px-2 py-1 rounded" onClick={() => updateServiceWorker(true)}>
            Reload to update
          </button>
        )}
      </header>

      <main className="flex-1 p-4">
        {showNewProject && (
          <div className="mb-4 max-w-md rounded border border-slate-700 bg-slate-900 p-4">
            <h2 className="text-sm font-semibold mb-3">New Project</h2>
            <div className="grid gap-2">
              <input autoFocus value={customerName} onChange={(e)=>setCustomerName(e.target.value)} placeholder="Customer name *" className="bg-slate-800 border border-slate-600 rounded px-3 py-2 text-sm"/>
              <input value={suburb} onChange={(e)=>setSuburb(e.target.value)} placeholder="Suburb *" className="bg-slate-800 border border-slate-600 rounded px-3 py-2 text-sm"/>
              <div className="flex gap-2">
                <button disabled={!customerName.trim() || !suburb.trim()} onClick={async()=>{const p=await createProject(`${customerName.trim()} — ${suburb.trim()}`); setShowNewProject(false); setCustomerName(''); setSuburb(''); setActiveProject(p.id);}} className="bg-sky-600 disabled:opacity-40 px-3 py-1.5 rounded text-sm">Create Project</button>
                <button onClick={()=>setShowNewProject(false)} className="bg-slate-700 px-3 py-1.5 rounded text-sm">Cancel</button>
              </div>
            </div>
          </div>
        )}
        <button
          className="bg-sky-600 hover:bg-sky-500 px-3 py-1.5 rounded text-sm"
          onClick={() => setShowNewProject(true)}
        >
          + New Project
        </button>
        <button
          className="ml-2 bg-amber-700 hover:bg-amber-600 px-3 py-1.5 rounded text-sm"
          onClick={runReadOnlyRecoveryScan}
        >
          Recovery Scan (read only)
        </button>

        {showRecovery && (
          <div className="mt-4 max-w-5xl rounded border border-amber-700 bg-slate-950 p-4">
            <div className="flex items-center justify-between gap-3 mb-2">
              <strong className="text-amber-300 text-sm">IndexedDB recovery report — no changes made</strong>
              <button className="text-xs bg-slate-700 px-2 py-1 rounded" onClick={() => setShowRecovery(false)}>Close</button>
            </div>
            <pre className="whitespace-pre-wrap break-all text-xs text-slate-200 select-text">{recoveryReport}</pre>
          </div>
        )}

        <ul className="mt-4 space-y-1">
          {projects?.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 rounded bg-slate-900 px-3 py-2">
              <button className="font-mono text-sm text-slate-300 hover:text-sky-400 text-left flex-1" onClick={async () => {
                // Resolve the saved page directly from IndexedDB before opening the workspace.
                // This avoids the live-query/page-creation race that could open a new empty page
                // even though another page in the same project contains the verified drawing.
                const existingPages = await db.planPages.where({ projectId: p.id }).sortBy('order');
                const objectCount = (page: PlanPage) => {
                  if (!page.canvasJSON) return 0;
                  try {
                    const parsed = JSON.parse(page.canvasJSON) as { objects?: unknown[] };
                    return parsed.objects?.length ?? 0;
                  } catch {
                    return 0;
                  }
                };
                const preferred = [...existingPages].sort((a, b) => {
                  const scoreA = objectCount(a) * 10 + (a.backgroundImage ? 1 : 0) + (a.sketchImage ? 1 : 0);
                  const scoreB = objectCount(b) * 10 + (b.backgroundImage ? 1 : 0) + (b.sketchImage ? 1 : 0);
                  return scoreB - scoreA || a.order - b.order;
                })[0];

                setActiveProject(p.id);
                if (preferred) setActivePlanPage(preferred.id);
              }}>
                {p.name} — rev {p.revision}
              </button>
              <button className="text-xs text-red-400 hover:text-red-300 px-2 py-1" onClick={async()=>{if(window.confirm(`Delete "${p.name}"? This permanently deletes its saved plans and drawings.`)) await deleteProjectCascade(p.id);}}>Delete</button>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
