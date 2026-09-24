import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { db } from './db';
import type { PlanPage } from './db/schema';
import { createProject, createPlanPage, deleteProjectCascade } from './db/repository';
import { useAppStore } from './store/appStore';
import CanvasWorkspace from './components/CanvasWorkspace';

const PLANDROID_VERSION = '0.6.0';
const BUILD_ID = '2026-09-24-SAVE-FIX-1';

export default function App() {
  const { offlineReady, needRefresh, updateServiceWorker } = useRegisterSW();
  const projects = useLiveQuery(() => db.projects.orderBy('updatedAt').reverse().toArray(), []);
  const { activeProjectId, activePlanPageId, setActiveProject, setActivePlanPage } = useAppStore();
  const [showNewProject, setShowNewProject] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [suburb, setSuburb] = useState('');

  const pagesForActiveProject = useLiveQuery(
    () =>
      activeProjectId
        ? db.planPages.where({ projectId: activeProjectId }).sortBy('order')
        : Promise.resolve<PlanPage[]>([]),
    [activeProjectId],
  );

  // Every opened project needs at least one plan page to draw on.
  useEffect(() => {
    if (!activeProjectId || !pagesForActiveProject) return;
    if (pagesForActiveProject.length > 0) {
      if (!activePlanPageId) setActivePlanPage(pagesForActiveProject[0].id);
      return;
    }
    createPlanPage(activeProjectId, 'Level 1').then((page) => setActivePlanPage(page.id));
  }, [activeProjectId, pagesForActiveProject, activePlanPageId, setActivePlanPage]);

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

        <ul className="mt-4 space-y-1">
          {projects?.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 rounded bg-slate-900 px-3 py-2">
              <button className="font-mono text-sm text-slate-300 hover:text-sky-400 text-left flex-1" onClick={() => setActiveProject(p.id)}>
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
