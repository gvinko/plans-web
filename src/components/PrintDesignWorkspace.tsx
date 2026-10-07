import { useEffect, useRef, useState } from 'react';
import { Circle, Rect, Textbox } from 'fabric';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import {
  saveCanvasState,
  setBackgroundImage,
  setPageScale,
  touchProject,
} from '../db/repository';
import { CanvasEngine, type CalibrationPoint } from '../lib/canvas/CanvasEngine';
import { isSupportedFloorPlanFile, loadFloorPlanFile } from '../lib/floorplan/loadFloorPlanFile';
import { BUILT_IN_PRINTER_PROFILES, type PrinterProfile } from '../lib/printers/profiles';
import { createSplitPlan } from '../lib/printers/splitPlanner';
import { createBoxMesh, createCylinderMesh } from '../lib/geometry/primitives';
import { exportBinaryStl } from '../lib/stl/stl';
import { loadCustomPrinterProfiles, saveCustomPrinterProfiles } from '../lib/printers/customProfiles';
import { useAppStore } from '../store/appStore';
import CalibrationModal from './CalibrationModal';
import StlStudio from './StlStudio';
import PhotoReliefStudio from './PhotoReliefStudio';

type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'error';
type ActiveTool = 'select' | 'pan' | 'calibrate';

interface SelectionInfo {
  widthMm: number;
  heightMm: number;
  xMm: number;
  yMm: number;
  angleDeg: number;
  type: string;
}

const DEFAULT_SHAPE_SIZE_MM = 40;

function clampDimension(value: number): number {
  return Math.max(0.1, Number.isFinite(value) ? value : 0.1);
}

export default function PrintDesignWorkspace() {
  const { activeProjectId, activePlanPageId, setActiveProject, setActivePlanPage } = useAppStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasElRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const engineRef = useRef<CanvasEngine | null>(null);
  const backgroundUrlRef = useRef<string | null>(null);
  const hydratingRef = useRef(true);
  const lastSavedJsonRef = useRef('');
  const saveTimerRef = useRef<number | null>(null);

  const [activeTool, setActiveTool] = useState<ActiveTool>('select');
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [zoomPct, setZoomPct] = useState(100);
  const [selection, setSelection] = useState<SelectionInfo | null>(null);
  const [pendingCalibration, setPendingCalibration] = useState<{ p1: CalibrationPoint; p2: CalibrationPoint } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [customPrinters, setCustomPrinters] = useState<PrinterProfile[]>(() => loadCustomPrinterProfiles());
  const [selectedPrinterId, setSelectedPrinterId] = useState(BUILT_IN_PRINTER_PROFILES[0].id);
  const [modelDepthMm, setModelDepthMm] = useState(20);
  const [showAddPrinter, setShowAddPrinter] = useState(false);
  const [showStlStudio, setShowStlStudio] = useState(false);
  const [showPhotoRelief, setShowPhotoRelief] = useState(false);
  const [newPrinter, setNewPrinter] = useState({
    name: '',
    x: 220,
    y: 220,
    z: 250,
    nozzle: 0.4,
    clearance: 0.25,
  });

  const project = useLiveQuery(
    () => (activeProjectId ? db.projects.get(activeProjectId) : undefined),
    [activeProjectId],
  );
  const page = useLiveQuery(
    () => (activePlanPageId ? db.planPages.get(activePlanPageId) : undefined),
    [activePlanPageId],
  );

  const allPrinters = [...BUILT_IN_PRINTER_PROFILES, ...customPrinters];
  const selectedPrinter: PrinterProfile =
    allPrinters.find((profile) => profile.id === selectedPrinterId) ??
    BUILT_IN_PRINTER_PROFILES[0];

  const pxPerMm = page?.scale.pxPerMm ?? 1;
  const selectedBounds = selection
    ? { x: selection.widthMm, y: selection.heightMm, z: Math.max(0.1, modelDepthMm) }
    : null;
  const splitPlan = selectedBounds ? createSplitPlan(selectedBounds, selectedPrinter) : null;

  function updateSelectionInfo() {
    const engine = engineRef.current;
    if (!engine) return;
    const object = engine.canvas.getActiveObject();
    if (!object) {
      setSelection(null);
      return;
    }
    const widthPx = Math.abs((object.width ?? 0) * (object.scaleX ?? 1));
    const heightPx = Math.abs((object.height ?? 0) * (object.scaleY ?? 1));
    setSelection({
      widthMm: widthPx / pxPerMm,
      heightMm: heightPx / pxPerMm,
      xMm: (object.left ?? 0) / pxPerMm,
      yMm: (object.top ?? 0) / pxPerMm,
      angleDeg: object.angle ?? 0,
      type: object.type ?? 'object',
    });
  }

  async function persistCanvas(force = false) {
    const engine = engineRef.current;
    if (!engine || !activePlanPageId || hydratingRef.current) return;
    try {
      const json = engine.serializeDrawingState();
      if (!force && json === lastSavedJsonRef.current) {
        setSaveStatus('saved');
        return;
      }
      // Guard against a transient blank canvas replacing known saved work during restore.
      const previousHadObjects = (() => {
        try {
          return ((JSON.parse(lastSavedJsonRef.current || '{"objects":[]}') as { objects?: unknown[] }).objects?.length ?? 0) > 0;
        } catch {
          return false;
        }
      })();
      const nextObjectCount = (() => {
        try {
          return ((JSON.parse(json) as { objects?: unknown[] }).objects?.length ?? 0);
        } catch {
          return 0;
        }
      })();
      if (!force && previousHadObjects && nextObjectCount === 0) {
        setSaveStatus('unsaved');
        setMessage('Autosave blocked a blank overwrite. Use Save now if clearing the design was intentional.');
        return;
      }

      setSaveStatus('saving');
      await saveCanvasState(activePlanPageId, json);
      if (activeProjectId) await touchProject(activeProjectId);
      lastSavedJsonRef.current = json;
      setSaveStatus('saved');
    } catch (error) {
      console.error(error);
      setSaveStatus('error');
      setMessage(error instanceof Error ? error.message : 'Could not save this design.');
    }
  }

  function scheduleAutosave() {
    if (hydratingRef.current) return;
    setSaveStatus('unsaved');
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => void persistCanvas(false), 700);
  }

  function setTool(tool: ActiveTool) {
    setActiveTool(tool);
    engineRef.current?.setToolMode(tool);
  }

  function addRectangle() {
    const engine = engineRef.current;
    if (!engine) return;
    const sizePx = DEFAULT_SHAPE_SIZE_MM * pxPerMm;
    const rect = new Rect({
      left: 80,
      top: 80,
      width: sizePx,
      height: sizePx,
      fill: 'rgba(14,165,233,0.18)',
      stroke: '#38bdf8',
      strokeWidth: Math.max(1, pxPerMm),
      strokeUniform: true,
    });
    engine.canvas.add(rect);
    engine.canvas.setActiveObject(rect);
    engine.recordUndoGroup([rect]);
    engine.canvas.requestRenderAll();
    setTool('select');
    updateSelectionInfo();
    scheduleAutosave();
  }

  function addCircle() {
    const engine = engineRef.current;
    if (!engine) return;
    const radiusPx = (DEFAULT_SHAPE_SIZE_MM / 2) * pxPerMm;
    const circle = new Circle({
      left: 100,
      top: 100,
      radius: radiusPx,
      fill: 'rgba(168,85,247,0.18)',
      stroke: '#c084fc',
      strokeWidth: Math.max(1, pxPerMm),
      strokeUniform: true,
    });
    engine.canvas.add(circle);
    engine.canvas.setActiveObject(circle);
    engine.recordUndoGroup([circle]);
    engine.canvas.requestRenderAll();
    setTool('select');
    updateSelectionInfo();
    scheduleAutosave();
  }

  function addText() {
    const engine = engineRef.current;
    if (!engine) return;
    const text = new Textbox('Text', {
      left: 120,
      top: 120,
      width: 120 * pxPerMm,
      fontSize: 12 * pxPerMm,
      fill: '#e2e8f0',
    });
    engine.canvas.add(text);
    engine.canvas.setActiveObject(text);
    engine.recordUndoGroup([text]);
    engine.canvas.requestRenderAll();
    setTool('select');
    updateSelectionInfo();
    scheduleAutosave();
  }

  function exportSelectionToStl() {
    if (!selection) return;
    const type = selection.type.toLowerCase();
    const name = (project?.name || 'plans-to-print-part').replace(/[^a-z0-9._-]+/gi, '-');
    let mesh;
    if (type.includes('rect')) {
      mesh = createBoxMesh(selection.widthMm, selection.heightMm, modelDepthMm, name);
    } else if (type.includes('circle')) {
      mesh = createCylinderMesh(Math.min(selection.widthMm, selection.heightMm), modelDepthMm, 64, name);
    } else {
      setMessage('STL export currently supports rectangle and circle primitives. Text and arbitrary 2D paths are not converted yet.');
      return;
    }
    const file = exportBinaryStl(mesh, `${name}.stl`);
    const url = URL.createObjectURL(file);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = file.name;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage(`Exported printable STL: ${file.name}`);
  }

  function updateSelectedObject(patch: Partial<SelectionInfo>) {
    const engine = engineRef.current;
    const object = engine?.canvas.getActiveObject();
    if (!engine || !object) return;

    const next = { ...selection, ...patch } as SelectionInfo;
    if ('widthMm' in patch && object.width) object.set({ scaleX: clampDimension(next.widthMm) * pxPerMm / object.width });
    if ('heightMm' in patch && object.height) object.set({ scaleY: clampDimension(next.heightMm) * pxPerMm / object.height });
    if ('xMm' in patch) object.set({ left: next.xMm * pxPerMm });
    if ('yMm' in patch) object.set({ top: next.yMm * pxPerMm });
    if ('angleDeg' in patch) object.set({ angle: next.angleDeg });
    object.setCoords();
    engine.canvas.requestRenderAll();
    updateSelectionInfo();
    scheduleAutosave();
  }

  async function importReference(file: File) {
    if (!activePlanPageId) return;
    if (!isSupportedFloorPlanFile(file)) {
      setMessage('Use PNG, JPG, WEBP, or PDF for a reference plan/image.');
      return;
    }
    try {
      setMessage('Loading reference…');
      const raster = await loadFloorPlanFile(file);
      await setBackgroundImage(activePlanPageId, raster.blob, raster.widthPx, raster.heightPx);
      if (backgroundUrlRef.current) URL.revokeObjectURL(backgroundUrlRef.current);
      const url = URL.createObjectURL(raster.blob);
      backgroundUrlRef.current = url;
      await engineRef.current?.loadBackgroundImage(url, raster.widthPx, raster.heightPx);
      setMessage('Reference loaded. Use Calibrate to set a known real-world distance.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not load that reference.');
    }
  }

  useEffect(() => {
    if (!canvasElRef.current) return;
    const engine = new CanvasEngine(canvasElRef.current, {
      onCalibrationPoints: (p1, p2) => setPendingCalibration({ p1, p2 }),
      onZoomChange: (zoom) => setZoomPct(Math.round(zoom * 100)),
      onToolShortcut: (mode) => {
        if (mode === 'select' || mode === 'pan' || mode === 'calibrate') setTool(mode);
      },
    });
    engineRef.current = engine;

    const markChanged = () => {
      updateSelectionInfo();
      scheduleAutosave();
    };
    const selectionChanged = () => updateSelectionInfo();

    engine.canvas.on('object:added', markChanged);
    engine.canvas.on('object:modified', markChanged);
    engine.canvas.on('object:removed', markChanged);
    engine.canvas.on('selection:created', selectionChanged);
    engine.canvas.on('selection:updated', selectionChanged);
    engine.canvas.on('selection:cleared', selectionChanged);

    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      if (backgroundUrlRef.current) URL.revokeObjectURL(backgroundUrlRef.current);
      engine.dispose();
      engineRef.current = null;
    };
    // Workspace owns one Fabric lifecycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      engineRef.current?.resize(width, height);
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!activePlanPageId) return;
    let cancelled = false;
    hydratingRef.current = true;

    (async () => {
      const saved = await db.planPages.get(activePlanPageId);
      const engine = engineRef.current;
      if (!saved || !engine || cancelled) return;

      if (saved.canvasJSON) {
        await engine.loadFromJSON(saved.canvasJSON);
        lastSavedJsonRef.current = saved.canvasJSON;
      } else {
        engine.canvas.clear();
        lastSavedJsonRef.current = engine.serializeDrawingState();
      }

      if (saved.backgroundImage) {
        if (backgroundUrlRef.current) URL.revokeObjectURL(backgroundUrlRef.current);
        const url = URL.createObjectURL(saved.backgroundImage);
        backgroundUrlRef.current = url;
        await engine.loadBackgroundImage(url, saved.backgroundImageWidthPx, saved.backgroundImageHeightPx);
      }

      hydratingRef.current = false;
      setSaveStatus('saved');
      setMessage(null);
    })().catch((error) => {
      console.error(error);
      hydratingRef.current = false;
      setSaveStatus('error');
      setMessage(error instanceof Error ? error.message : 'Could not restore this design.');
    });

    return () => {
      cancelled = true;
    };
  }, [activePlanPageId]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (saveStatus === 'unsaved' || saveStatus === 'saving') {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [saveStatus]);

  if (!activeProjectId || !activePlanPageId) return null;

  return (
    <div className="h-full flex flex-col bg-slate-950 text-slate-100">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-3 py-2">
        <div className="flex min-w-0 items-center gap-3">
          <button
            className="rounded bg-slate-800 px-2 py-1 text-xs hover:bg-slate-700"
            onClick={() => {
              void persistCanvas(false).finally(() => {
                setActivePlanPage(null);
                setActiveProject(null);
              });
            }}
          >
            ← Projects
          </button>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{project?.name ?? 'Plans to Print'}</div>
            <div className="text-[11px] text-slate-500">
              {page?.scale.pxPerMm ? `Calibrated · ${page.scale.pxPerMm.toFixed(4)} px/mm` : 'Design units: mm · reference not calibrated'}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className={saveStatus === 'error' ? 'text-red-400' : saveStatus === 'saved' ? 'text-emerald-400' : 'text-amber-300'}>
            {saveStatus === 'saved' ? '✓ Saved' : saveStatus === 'saving' ? 'Saving…' : saveStatus === 'error' ? 'Save error' : 'Unsaved'}
          </span>
          <button className="rounded bg-sky-600 px-3 py-1.5 font-medium hover:bg-sky-500" onClick={() => void persistCanvas(true)}>
            Save now
          </button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        <aside className="w-44 shrink-0 overflow-y-auto border-r border-slate-800 bg-slate-900/80 p-2">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Draw</div>
          <div className="grid gap-1">
            <button className={`rounded px-2 py-2 text-left text-xs ${activeTool === 'select' ? 'bg-sky-700' : 'bg-slate-800 hover:bg-slate-700'}`} onClick={() => setTool('select')}>Select / move</button>
            <button className={`rounded px-2 py-2 text-left text-xs ${activeTool === 'pan' ? 'bg-sky-700' : 'bg-slate-800 hover:bg-slate-700'}`} onClick={() => setTool('pan')}>Pan</button>
            <button className="rounded bg-slate-800 px-2 py-2 text-left text-xs hover:bg-slate-700" onClick={addRectangle}>Rectangle</button>
            <button className="rounded bg-slate-800 px-2 py-2 text-left text-xs hover:bg-slate-700" onClick={addCircle}>Circle</button>
            <button className="rounded bg-slate-800 px-2 py-2 text-left text-xs hover:bg-slate-700" onClick={addText}>Text</button>
          </div>

          <div className="mb-2 mt-5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">3D / STL</div>
          <div className="grid gap-1">
            <button
              className="rounded bg-violet-800 px-2 py-2 text-left text-xs hover:bg-violet-700"
              onClick={() => setShowStlStudio(true)}
            >
              Open STL Studio
            </button>
            <button
              className="rounded bg-fuchsia-900/80 px-2 py-2 text-left text-xs hover:bg-fuchsia-800"
              onClick={() => setShowPhotoRelief(true)}
            >
              Photo relief / lithophane
            </button>
          </div>

          <div className="mb-2 mt-5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Reference</div>
          <div className="grid gap-1">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void importReference(file);
                event.currentTarget.value = '';
              }}
            />
            <button className="rounded bg-slate-800 px-2 py-2 text-left text-xs hover:bg-slate-700" onClick={() => fileInputRef.current?.click()}>Import plan / photo</button>
            <button className={`rounded px-2 py-2 text-left text-xs ${activeTool === 'calibrate' ? 'bg-amber-700' : 'bg-slate-800 hover:bg-slate-700'}`} onClick={() => setTool('calibrate')}>Calibrate</button>
          </div>

          <div className="mb-2 mt-5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Edit</div>
          <div className="grid grid-cols-2 gap-1">
            <button className="rounded bg-slate-800 px-2 py-2 text-xs hover:bg-slate-700" onClick={() => { engineRef.current?.undo(); scheduleAutosave(); }}>Undo</button>
            <button className="rounded bg-slate-800 px-2 py-2 text-xs hover:bg-slate-700" onClick={() => void engineRef.current?.duplicateSelection().then(scheduleAutosave)}>Duplicate</button>
            <button className="rounded bg-red-950/60 px-2 py-2 text-xs text-red-300 hover:bg-red-900" onClick={() => { engineRef.current?.deleteSelection(); scheduleAutosave(); }}>Delete</button>
            <button className="rounded bg-slate-800 px-2 py-2 text-xs hover:bg-slate-700" onClick={() => { engineRef.current?.setSelectionLocked(true); scheduleAutosave(); }}>Lock</button>
          </div>
        </aside>

        <main ref={containerRef} className="relative min-w-0 flex-1 overflow-hidden bg-slate-950">
          <canvas ref={canvasElRef} />
          <div className="pointer-events-none absolute bottom-3 left-3 rounded bg-slate-900/90 px-2 py-1 text-[11px] text-slate-400">
            {zoomPct}% · wheel zoom · middle mouse/Space pan
          </div>
          {message && (
            <div className="absolute left-1/2 top-3 max-w-lg -translate-x-1/2 rounded border border-slate-700 bg-slate-900/95 px-3 py-2 text-xs shadow-xl">
              <div className="flex gap-3">
                <span>{message}</span>
                <button className="text-slate-400 hover:text-white" onClick={() => setMessage(null)}>×</button>
              </div>
            </div>
          )}
        </main>

        <aside className="w-64 shrink-0 overflow-y-auto border-l border-slate-800 bg-slate-900/80 p-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Selected object</div>
          {!selection ? (
            <p className="mt-2 text-xs text-slate-500">Select an object to edit exact dimensions and position.</p>
          ) : (
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
              <label className="col-span-2 text-slate-400">{selection.type}</label>
              {([
                ['widthMm', 'Width', 'mm'],
                ['heightMm', 'Height', 'mm'],
                ['xMm', 'X', 'mm'],
                ['yMm', 'Y', 'mm'],
                ['angleDeg', 'Rotate', '°'],
              ] as const).map(([key, label, unit]) => (
                <label key={key} className={key === 'angleDeg' ? 'col-span-2' : ''}>
                  <span className="mb-1 block text-[10px] text-slate-500">{label} ({unit})</span>
                  <input
                    type="number"
                    step={key === 'angleDeg' ? 1 : 0.1}
                    value={Number(selection[key].toFixed(2))}
                    onChange={(event) => updateSelectedObject({ [key]: Number(event.target.value) })}
                    className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5"
                  />
                </label>
              ))}
            </div>
          )}

          <div className="mt-6 border-t border-slate-800 pt-4">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Printer</div>
            <select
              value={selectedPrinterId}
              onChange={(event) => setSelectedPrinterId(event.target.value)}
              className="mt-2 w-full rounded border border-slate-700 bg-slate-950 px-2 py-2 text-xs"
            >
              {allPrinters.map((profile) => (
                <option key={profile.id} value={profile.id}>{profile.name}</option>
              ))}
            </select>
            <div className="mt-2 rounded bg-slate-950 p-2 text-[11px] text-slate-400">
              Build volume: {selectedPrinter.buildVolumeMm.x} × {selectedPrinter.buildVolumeMm.y} × {selectedPrinter.buildVolumeMm.z} mm
              <br />
              Nozzle: {selectedPrinter.nozzleDiameterMm} mm
              <br />
              Fit clearance: {selectedPrinter.defaultFitClearanceMm} mm
            </div>
            <button
              className="mt-2 w-full rounded bg-slate-800 px-2 py-2 text-left text-xs hover:bg-slate-700"
              onClick={() => setShowAddPrinter((value) => !value)}
            >
              + Add printer
            </button>
            {showAddPrinter && (
              <div className="mt-2 grid grid-cols-2 gap-2 rounded border border-slate-700 bg-slate-950 p-2 text-[11px]">
                <input
                  className="col-span-2 rounded border border-slate-700 bg-slate-900 px-2 py-1.5"
                  placeholder="Printer name"
                  value={newPrinter.name}
                  onChange={(event) => setNewPrinter({ ...newPrinter, name: event.target.value })}
                />
                {([
                  ['x', 'X mm'],
                  ['y', 'Y mm'],
                  ['z', 'Z mm'],
                  ['nozzle', 'Nozzle mm'],
                  ['clearance', 'Clearance mm'],
                ] as const).map(([key, label]) => (
                  <label key={key}>
                    <span className="mb-1 block text-[10px] text-slate-500">{label}</span>
                    <input
                      type="number"
                      min="0.1"
                      step="0.1"
                      value={newPrinter[key]}
                      onChange={(event) => setNewPrinter({ ...newPrinter, [key]: Number(event.target.value) })}
                      className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5"
                    />
                  </label>
                ))}
                <button
                  className="col-span-2 rounded bg-sky-700 px-2 py-2 text-xs hover:bg-sky-600"
                  onClick={() => {
                    const name = newPrinter.name.trim();
                    if (!name) {
                      setMessage('Enter a printer name.');
                      return;
                    }
                    const profile: PrinterProfile = {
                      id: `custom-${Date.now()}`,
                      name,
                      manufacturer: 'Custom',
                      buildVolumeMm: {
                        x: Math.max(1, newPrinter.x),
                        y: Math.max(1, newPrinter.y),
                        z: Math.max(1, newPrinter.z),
                      },
                      nozzleDiameterMm: Math.max(0.1, newPrinter.nozzle),
                      defaultFitClearanceMm: Math.max(0, newPrinter.clearance),
                    };
                    const next = [...customPrinters, profile];
                    try {
                      saveCustomPrinterProfiles(next);
                      setCustomPrinters(next);
                      setSelectedPrinterId(profile.id);
                      setShowAddPrinter(false);
                      setNewPrinter({ name: '', x: 220, y: 220, z: 250, nozzle: 0.4, clearance: 0.25 });
                    } catch (error) {
                      setMessage(error instanceof Error ? error.message : 'Could not save printer profile.');
                    }
                  }}
                >
                  Save printer
                </button>
              </div>
            )}
          </div>

          <div className="mt-6 border-t border-slate-800 pt-4">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Print fit / split plan</div>
            {!selection ? (
              <p className="mt-2 text-xs text-slate-500">Select a design object to compare it with the printer build volume.</p>
            ) : (
              <div className="mt-2 text-xs">
                <label>
                  <span className="mb-1 block text-[10px] text-slate-500">Model depth / extrusion (mm)</span>
                  <input
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={modelDepthMm}
                    onChange={(event) => setModelDepthMm(Math.max(0.1, Number(event.target.value) || 0.1))}
                    className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5"
                  />
                </label>
                <div className={`mt-2 rounded p-2 text-[11px] ${splitPlan?.required ? 'bg-amber-950/60 text-amber-200' : 'bg-emerald-950/50 text-emerald-300'}`}>
                  {splitPlan?.required ? (
                    <>
                      Oversized for {selectedPrinter.name}. Suggested split: {splitPlan.estimatedPartCount} parts.
                      {splitPlan.axes.map((axis) => (
                        <div key={axis.axis} className="mt-1">
                          {axis.axis.toUpperCase()}: {axis.partCount} sections at about {axis.targetPartSizeMm.toFixed(1)} mm
                        </div>
                      ))}
                    </>
                  ) : (
                    <>Fits within the selected printer build volume.</>
                  )}
                </div>
                <button
                  className="mt-2 w-full rounded bg-emerald-700 px-2 py-2 text-xs font-medium hover:bg-emerald-600"
                  onClick={exportSelectionToStl}
                >
                  Export selected primitive as STL
                </button>
                <p className="mt-1 text-[10px] text-slate-500">
                  Rectangle → solid box. Circle → solid cylinder. Export uses the exact width, height and model depth shown above.
                </p>
              </div>
            )}
          </div>

          <div className="mt-6 border-t border-slate-800 pt-4">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">3D / STL</div>
            <p className="mt-2 text-xs text-slate-500">
              Real 3D geometry, STL import/export and physical split/join generation remain disabled until the geometry engine is connected and validated.
            </p>
          </div>
        </aside>
      </div>

      {showStlStudio && <StlStudio projectId={activeProjectId} printer={selectedPrinter} onClose={() => setShowStlStudio(false)} />}
      {showPhotoRelief && <PhotoReliefStudio printer={selectedPrinter} onClose={() => setShowPhotoRelief(false)} />}

      {pendingCalibration && (
        <CalibrationModal
          onCancel={() => {
            engineRef.current?.cancelCalibrationDraft();
            setPendingCalibration(null);
            setTool('select');
          }}
          onConfirm={(mm) => {
            if (!activePlanPageId) return;
            void setPageScale(activePlanPageId, [pendingCalibration.p1, pendingCalibration.p2], mm).then(() => {
              engineRef.current?.applyCalibrationLabel(mm);
              setPendingCalibration(null);
              setTool('select');
              setMessage(`Scale calibrated from a ${mm.toLocaleString()} mm reference.`);
            });
          }}
        />
      )}
    </div>
  );
}
