import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { db } from './db';
import type { PlanPage } from './db/schema';
import { createProject, createPlanPage, deleteProjectCascade } from './db/repository';
import { useAppStore } from './store/appStore';
import CanvasWorkspace from './components/CanvasWorkspace';

const APP_VERSION = '0.8.0';
const BUILD_ID = '2026-10-08-PLANS-TO-PRINT-REBUILD-1';

function savedObjectCount(page: PlanPage): number {
  if (!page.canvasJSON) return 0;
  try {
    const parsed = JSON.parse(page.canvasJSON) as { objects?: unknown[] };
    return parsed.objects?.length ?? 0;
  } catch {
    return 0;
  }
}

function preferredSavedPage(pages: PlanPage[]): PlanPage | undefined {
  return [...pages].sort((a, b) => {
    const scoreA = savedObjectCount(a) * 10 + (a.backgroundImage ? 1 : 0) + (a.sketchImage ? 1 : 0);
    const scoreB = savedObjectCount(b) * 10 + (b.backgroundImage ? 1 : 0) + (b.sketchImage ? 1 : 0);
    return scoreB - scoreA || a.order - b.order;
  })[0];
}

export default function App() {
  const { offlineReady, needRefresh, updateServiceWorker } = useRegisterSW();
  const projects = useLiveQuery(() => db.projects.orderBy('updatedAt').reverse().toArray(), []);
  const { activeProjectId, activePlanPageId, setActiveProject, setActivePlanPage } = useAppStore();
  const [showNewProject, setShowNewProject] = useState(false);
  const [projectName, setProjectName] = useState('');
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

  useEffect(() => {
    if (!activeProjectId || !pagesForActiveProject) return;

    if (pagesForActiveProject.length > 0) {
      creatingPageForProjectRef.current = null;
      if (!activePlanPageId) {
        const preferred = preferredSavedPage(pagesForActiveProject);
        if (preferred) setActivePlanPage(preferred.id);
      }
      return;
    }

    if (creatingPageForProjectRef.current === activeProjectId) return;
    creatingPageForProjectRef.current = activeProjectId;
    createPlanPage(activeProjectId, 'Design 1')
      .then((page) => setActivePlanPage(page.id))
      .finally(() => {
        if (creatingPageForProjectRef.current === activeProjectId) creatingPageForProjectRef.current = null;
      });
  }, [activeProjectId, pagesForActiveProject, activePlanPageId, setActivePlanPage]);

  async function openProject(projectId: string) {
    const existingPages = await db.planPages.where({ projectId }).sortBy('order');
    const preferred = preferredSavedPage(existingPages);

    setActiveProject(projectId);
    if (preferred) setActivePlanPage(preferred.id);
  }

  async function createNewProject() {
    const name = projectName.trim();
    if (!name) return;
    const project = await createProject(name);
    setProjectName('');
    setShowNewProject(false);
    setActiveProject(project.id);
  }

  async function runReadOnlyRecoveryScan() {
    try {
      const projectRows = await db.projects.toArray();
      const pageRows = await db.planPages.toArray();
      const lines: string[] = [
        'READ-ONLY RECOVERY SCAN',
        `Database: ${db.name} | version: ${db.verno}`,
        `Projects: ${projectRows.length} | Design pages: ${pageRows.length}`,
        '',
      ];

      if (projectRows.length === 0) lines.push('No project records visible in this IndexedDB database.');

      for (const project of projectRows) {
        const pages = pageRows.filter((page) => page.projectId === project.id);
        lines.push(`PROJECT ${project.name} | id=${project.id} | pages=${pages.length}`);
        for (const page of pages) {
          let jsonState = page.canvasJSON ? 'present' : 'none';
          if (page.canvasJSON) {
            try {
              JSON.parse(page.canvasJSON);
            } catch {
              jsonState = 'INVALID JSON';
            }
          }
          lines.push(
            `  DESIGN ${page.name} | id=${page.id} | objects=${savedObjectCount(page)} | canvas=${jsonState} | background=${page.backgroundImage ? 'Y' : 'N'} | sketch=${page.sketchImage ? 'Y' : 'N'}`,
          );
        }
      }

      const orphanPages = pageRows.filter((page) => !projectRows.some((project) => project.id === page.projectId));
      if (orphanPages.length) {
        lines.push('', `ORPHAN DESIGN PAGES: ${orphanPages.length}`);
        for (const page of orphanPages) {
          lines.push(
            `  id=${page.id} | projectId=${page.projectId} | objects=${savedObjectCount(page)} | background=${page.backgroundImage ? 'Y' : 'N'}`,
          );
        }
      }

      const listDatabases = (
        indexedDB as IDBFactory & { databases?: () => Promise<Array<{ name?: string; version?: number }>> }
      ).databases;

      if (listDatabases) {
        const databases = await listDatabases.call(indexedDB);
        lines.push('', 'BROWSER INDEXEDDB DATABASES:');
        databases.forEach((entry) => lines.push(`  ${entry.name ?? '(unnamed)'} v${entry.version ?? '?'}`));
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
    <div className="h-full flex flex-col bg-slate-950 text-slate-100">
      <header className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-slate-800 bg-slate-950">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">
            Plans to Print <span className="text-sky-400">v{APP_VERSION}</span>
          </h1>
          <p className="text-xs text-slate-500">Design → preview → validate → print</p>
        </div>

        <div className="flex items-center gap-2">
          <span className="hidden sm:inline text-xs text-slate-500">Build {BUILD_ID}</span>
          <span className="text-xs text-slate-400">
            {needRefresh ? 'Update available' : offlineReady ? 'Offline ready' : 'Checking app…'}
          </span>
          {needRefresh && (
            <button className="text-xs bg-sky-600 hover:bg-sky-500 px-2 py-1 rounded" onClick={() => updateServiceWorker(true)}>
              Reload update
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 overflow-auto p-4 md:p-6">
        <div className="mx-auto max-w-6xl">
          <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 md:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">Projects</h2>
                <p className="mt-1 text-sm text-slate-400">
                  Create a design by what you want to make. Customer and suburb fields have been removed.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  className="bg-sky-600 hover:bg-sky-500 px-3 py-2 rounded-md text-sm font-medium"
                  onClick={() => setShowNewProject(true)}
                >
                  + New project
                </button>
                <button
                  className="bg-amber-700 hover:bg-amber-600 px-3 py-2 rounded-md text-sm"
                  onClick={runReadOnlyRecoveryScan}
                >
                  Recovery scan
                </button>
              </div>
            </div>

            {showNewProject && (
              <div className="mt-4 max-w-xl rounded-lg border border-slate-700 bg-slate-950 p-4">
                <label className="block text-xs font-medium uppercase tracking-wide text-slate-400" htmlFor="project-name">
                  What are you designing?
                </label>
                <input
                  id="project-name"
                  autoFocus
                  value={projectName}
                  onChange={(event) => setProjectName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void createNewProject();
                    if (event.key === 'Escape') setShowNewProject(false);
                  }}
                  placeholder="e.g. Wall light, bracket, enclosure, custom part"
                  className="mt-2 w-full bg-slate-900 border border-slate-600 rounded-md px-3 py-2 text-sm outline-none focus:border-sky-500"
                />
                <div className="mt-3 flex gap-2">
                  <button
                    disabled={!projectName.trim()}
                    onClick={() => void createNewProject()}
                    className="bg-sky-600 hover:bg-sky-500 disabled:opacity-40 px-3 py-2 rounded-md text-sm"
                  >
                    Create project
                  </button>
                  <button onClick={() => setShowNewProject(false)} className="bg-slate-700 hover:bg-slate-600 px-3 py-2 rounded-md text-sm">
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {showRecovery && (
              <div className="mt-4 rounded-lg border border-amber-700 bg-slate-950 p-4">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <strong className="text-amber-300 text-sm">IndexedDB recovery report — no changes made</strong>
                  <button className="text-xs bg-slate-700 px-2 py-1 rounded" onClick={() => setShowRecovery(false)}>
                    Close
                  </button>
                </div>
                <pre className="whitespace-pre-wrap break-all text-xs text-slate-200 select-text">{recoveryReport}</pre>
              </div>
            )}

            <div className="mt-4 grid gap-2">
              {projects?.length === 0 && (
                <div className="rounded-lg border border-dashed border-slate-700 p-8 text-center text-sm text-slate-500">
                  No Plans to Print projects yet. Create one to start designing.
                </div>
              )}

              {projects?.map((project) => (
                <div key={project.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950 px-3 py-3">
                  <button
                    className="min-w-0 flex-1 text-left hover:text-sky-400"
                    onClick={() => void openProject(project.id)}
                  >
                    <span className="block truncate text-sm font-medium">{project.name}</span>
                    <span className="block text-xs text-slate-500">
                      Revision {project.revision} · Updated {new Date(project.updatedAt).toLocaleString()}
                    </span>
                  </button>
                  <button
                    className="text-xs text-red-400 hover:text-red-300 px-2 py-1"
                    onClick={async () => {
                      if (window.confirm(`Delete "${project.name}"? This permanently deletes its saved designs.`)) {
                        await deleteProjectCascade(project.id);
                      }
                    }}
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
              <h3 className="text-sm font-semibold">2D CAD</h3>
              <p className="mt-1 text-xs text-slate-400">Dimensioned drawing, plan/photo import and calibration are being retained and refactored.</p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
              <h3 className="text-sm font-semibold">3D + STL</h3>
              <p className="mt-1 text-xs text-slate-400">3D preview, STL import/editing and printable-solid workflows are the next rebuild stage.</p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
              <h3 className="text-sm font-semibold">Printer aware</h3>
              <p className="mt-1 text-xs text-slate-400">Ender 3 family profiles and oversized-model splitting are being added as core product features.</p>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
