import { useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { db } from './db';
import type { PlanPage } from './db/schema';
import { createProject, createPlanPage } from './db/repository';
import { useAppStore } from './store/appStore';
import CanvasWorkspace from './components/CanvasWorkspace';

export default function App() {
  const { offlineReady, needRefresh, updateServiceWorker } = useRegisterSW();
  const projects = useLiveQuery(() => db.projects.orderBy('updatedAt').reverse().toArray(), []);
  const { activeProjectId, activePlanPageId, setActiveProject, setActivePlanPage } = useAppStore();

  async function startProject(mode: 'import' | 'draw' | 'blank') {
    const label = mode === 'import' ? 'Imported Plan' : mode === 'draw' ? 'Site Draw' : 'HVAC Sketch';
    const project = await createProject(`${label} ${(projects?.length ?? 0) + 1}`);
    const page = await createPlanPage(project.id, 'Level 1');
    setActiveProject(project.id);
    setActivePlanPage(page.id);
  }

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
        <section className="max-w-3xl">
          <h2 className="text-lg font-semibold">Start a job</h2>
          <p className="text-sm text-slate-400 mt-1 mb-3">Plans are optional. Start with what you have and use the same HVAC components either way.</p>
          <div className="grid gap-2 sm:grid-cols-3">
            <button className="text-left bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded p-3" onClick={() => startProject('import')}>
              <strong className="block text-sm">Import Plan</strong>
              <span className="text-xs text-slate-400">PDF or image, then calibrate and overlay HVAC.</span>
            </button>
            <button className="text-left bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded p-3" onClick={() => startProject('draw')}>
              <strong className="block text-sm">Draw Floor Plan</strong>
              <span className="text-xs text-slate-400">Measure and trace walls on site when no plan is supplied.</span>
            </button>
            <button className="text-left bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded p-3" onClick={() => startProject('blank')}>
              <strong className="block text-sm">Blank HVAC Sketch</strong>
              <span className="text-xs text-slate-400">Place equipment, duct and outlets without drawing the house.</span>
            </button>
          </div>
        </section>

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
