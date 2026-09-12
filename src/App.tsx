import { useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { db } from './db';
import { createProject, createPlanPage } from './db/repository';
import { useAppStore } from './store/appStore';
import CanvasWorkspace from './components/CanvasWorkspace';

export default function App() {
  const { offlineReady, needRefresh, updateServiceWorker } = useRegisterSW();
  const projects = useLiveQuery(() => db.projects.orderBy('updatedAt').reverse().toArray(), []);
  const { activeProjectId, activePlanPageId, setActiveProject, setActivePlanPage } = useAppStore();

  const pagesForActiveProject = useLiveQuery(
    () => (activeProjectId ? db.planPages.where({ projectId: activeProjectId }).sortBy('order') : undefined),
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
        <h1 className="font-mono text-sm tracking-wide">PLANDROID WEB</h1>
        <span className="text-xs text-slate-400">
          {offlineReady ? 'Offline ready' : needRefresh ? 'Update available' : 'Loading…'}
        </span>
        {needRefresh && (
          <button className="text-xs bg-sky-600 px-2 py-1 rounded" onClick={() => updateServiceWorker(true)}>
            Reload to update
          </button>
        )}
      </header>

      <main className="flex-1 p-4">
        <button
          className="bg-sky-600 hover:bg-sky-500 px-3 py-1.5 rounded text-sm"
          onClick={() => createProject(`Untitled Project ${(projects?.length ?? 0) + 1}`)}
        >
          + New Project
        </button>

        <ul className="mt-4 space-y-1">
          {projects?.map((p) => (
            <li key={p.id}>
              <button
                className="font-mono text-sm text-slate-300 hover:text-sky-400"
                onClick={() => setActiveProject(p.id)}
              >
                {p.name} — rev {p.revision}
              </button>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
