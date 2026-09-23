import { useEffect, useRef, useState, type DragEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import {
  saveCanvasState,
  setPageScale,
  setBackgroundImage,
  setSketchOverlay,
  setSketchOpacity,
} from '../db/repository';
import { CanvasEngine, type CalibrationPoint, type ToolMode } from '../lib/canvas/CanvasEngine';
import type { IconStyle } from '../lib/catalog/types';
import { loadFloorPlanFile, isSupportedFloorPlanFile } from '../lib/floorplan/loadFloorPlanFile';
import { attachSnapEngine } from '../lib/canvas/snapping';
import { attachComponentPlacement } from '../lib/canvas/componentPlacement';
import { attachDuctDrawing, type DuctToolParams } from '../lib/canvas/ductDrawing';
import { attachWallTracing } from '../lib/canvas/wallTracing';
import {
  attachWallDimensionEdit,
  applyWallLength,
  applyZoneToRoom,
  getTraceVertices,
  rebuildTracedRoom,
  type WallEdgeSelection,
} from '../lib/canvas/wallDimensionEdit';
import { attachZoneSelection, type RoomSelection } from '../lib/canvas/zoneSelection';
import { useAppStore } from '../store/appStore';
import CalibrationModal from './CalibrationModal';
import ComponentPalette from './ComponentPalette';
import DuctToolOptions from './DuctToolOptions';
import BomPanel from './BomPanel';
import SketchOverlayControls from './SketchOverlayControls';
import WallDimensionPopover from './WallDimensionPopover';
import ZoneAssignPopover from './ZoneAssignPopover';
import ZonesManagerDialog from './ZonesManagerDialog';
import DuctColorsDialog from './DuctColorsDialog';
import SystemSchedulePanel from './SystemSchedulePanel';
import CompanySettingsDialog from './CompanySettingsDialog';
import ExcelImporterDialog from './ExcelImporterDialog';
import ExportDialog from './ExportDialog';

const DEFAULT_DUCT_PARAMS: DuctToolParams = { widthMm: 400, depthMm: 250, diameterMm: 200, ductFunction: 'supply' };


export default function CanvasWorkspace() {
  const { activeProjectId, activePlanPageId, activeTool, setActiveTool, setActiveProject } = useAppStore();

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasElRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<CanvasEngine | null>(null);
  const backgroundObjectUrlRef = useRef<string | null>(null);
  const sketchObjectUrlRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [zoomPct, setZoomPct] = useState(100);
  const [activeRibbon, setActiveRibbon] = useState<'PLAN'|'HVAC'|'DUCT'|'FITTINGS'|'OUTLETS'|'CONTROLS'|'NOTES'|'EXPORT'>('HVAC');
  const [isDragOver, setIsDragOver] = useState(false);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pendingCalibration, setPendingCalibration] = useState<{ p1: CalibrationPoint; p2: CalibrationPoint } | null>(
    null,
  );
  const [pendingComponentId, setPendingComponentId] = useState<string | null>(null);
  const [showPalette, setShowPalette] = useState(false);
  const [showBom, setShowBom] = useState(false);
  const [showImporter, setShowImporter] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showDuctColors, setShowDuctColors] = useState(false);
  const [showZonesManager, setShowZonesManager] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [showCompanySettings, setShowCompanySettings] = useState(false);
  const [isPlanEditing, setIsPlanEditing] = useState(false);
  const [showPlanHelp, setShowPlanHelp] = useState(true);
  const [ductParams, setDuctParams] = useState<DuctToolParams>(DEFAULT_DUCT_PARAMS);
  const [wallEdgeSelection, setWallEdgeSelection] = useState<WallEdgeSelection | null>(null);
  const [wallPopoverScreen, setWallPopoverScreen] = useState<{ x: number; y: number } | null>(null);
  const [roomSelection, setRoomSelection] = useState<RoomSelection | null>(null);
  const [saveStatus, setSaveStatus] = useState<'saved'|'saving'|'unsaved'>('saved');
  const saveNowRef = useRef<(() => Promise<void>) | null>(null);
  const isHydratingRef = useRef(false);
  const lastSavedJsonRef = useRef<string>('');
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());

  // Controllers read these via ref so they always see the latest value without re-attaching listeners.
  const pendingComponentIdRef = useRef<string | null>(null);
  const ductParamsRef = useRef<DuctToolParams>(DEFAULT_DUCT_PARAMS);
  const pxPerMmRef = useRef<number | null>(null);
  const iconStyleRef = useRef<IconStyle>('simple');
  const ductColorOverridesRef = useRef<Record<string, string>>({});

  const planPage = useLiveQuery(
    () => (activePlanPageId ? db.planPages.get(activePlanPageId) : undefined),
    [activePlanPageId],
  );
  const project = useLiveQuery(() => (activeProjectId ? db.projects.get(activeProjectId) : undefined), [activeProjectId]);

  useEffect(() => {
    pendingComponentIdRef.current = pendingComponentId;
  }, [pendingComponentId]);

  useEffect(() => {
    ductParamsRef.current = ductParams;
  }, [ductParams]);

  useEffect(() => {
    pxPerMmRef.current = planPage?.scale.pxPerMm ?? null;
  }, [planPage?.scale.pxPerMm]);

  useEffect(() => {
    iconStyleRef.current = project?.iconStyle ?? 'simple';
  }, [project?.iconStyle]);

  useEffect(() => {
    ductColorOverridesRef.current = project?.ductColorOverrides ?? {};
  }, [project?.ductColorOverrides]);

  // --- engine + controllers: created once, disposed on unmount ---
  useEffect(() => {
    if (!canvasElRef.current) return;
    const engine = new CanvasEngine(canvasElRef.current, {
      onCalibrationPoints: (p1, p2) => setPendingCalibration({ p1, p2 }),
      onZoomChange: (zoom) => setZoomPct(Math.round(zoom * 100)),
      onToolShortcut: (mode) => handleToolChange(mode),
    });
    engineRef.current = engine;

    const detachSnap = attachSnapEngine(engine.canvas);
    const detachPlacement = attachComponentPlacement(
      engine,
      () => pendingComponentIdRef.current,
      () => iconStyleRef.current,
      () => {
        setPendingComponentId(null);
        setActiveTool('select');
        engine.setToolMode('select');
      },
    );
    const detachDuctDrawing = attachDuctDrawing(
      engine,
      () => pxPerMmRef.current,
      () => ductParamsRef.current,
      () => ductColorOverridesRef.current,
      () => {
        setSaveStatus('unsaved');
        setActiveTool('select');
        engine.setToolMode('select');
      },
    );
    const detachWallTracing = attachWallTracing(engine, () => pxPerMmRef.current, () => handleToolChange('select'));
    const detachWallDimensionEdit = attachWallDimensionEdit(engine, (sel) => {
      const vpt = engine.canvas.viewportTransform;
      setWallEdgeSelection(sel);
      setWallPopoverScreen({
        x: sel.midpointCanvas.x * vpt[0] + vpt[4],
        y: sel.midpointCanvas.y * vpt[3] + vpt[5],
      });
    });
    const detachZoneSelection = attachZoneSelection(engine.canvas, setRoomSelection);

    return () => {
      detachSnap();
      detachPlacement();
      detachDuctDrawing();
      detachWallTracing();
      detachWallDimensionEdit();
      detachZoneSelection();
      engine.dispose();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- keep canvas sized to its container ---
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      engineRef.current?.resize(width, height);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // --- load this page's saved canvas / background / sketch exactly once when it becomes active ---
  useEffect(() => {
    if (!activePlanPageId) return;
    let cancelled = false;
    (async () => {
      const page = await db.planPages.get(activePlanPageId);
      const engine = engineRef.current;
      if (!page || !engine || cancelled) return;

      // Never allow load-time Fabric events to autosave a blank/partial canvas over a real job.
      isHydratingRef.current = true;
      if (page.canvasJSON) {
        await engine.loadFromJSON(page.canvasJSON);
        lastSavedJsonRef.current = page.canvasJSON;
      } else {
        engine.canvas.clear();
        lastSavedJsonRef.current = engine.serializeDrawingState();
      }
      if (page.backgroundImage) {
        const url = URL.createObjectURL(page.backgroundImage);
        backgroundObjectUrlRef.current = url;
        await engine.loadBackgroundImage(url, page.backgroundImageWidthPx, page.backgroundImageHeightPx);
      }
      if (page.sketchImage) {
        const url = URL.createObjectURL(page.sketchImage);
        sketchObjectUrlRef.current = url;
        await engine.loadSketchOverlay(url, page.sketchWidthPx, page.sketchHeightPx, page.sketchOpacity);
      }
      isHydratingRef.current = false;
      setSaveStatus('saved');
    })().catch((err) => {
      isHydratingRef.current = false;
      setLoadError(err instanceof Error ? err.message : 'Failed to restore saved project');
    });
    return () => {
      cancelled = true;
      [backgroundObjectUrlRef, sketchObjectUrlRef].forEach((ref) => {
        if (ref.current) {
          URL.revokeObjectURL(ref.current);
          ref.current = null;
        }
      });
    };
  }, [activePlanPageId]);

  // --- immediate, ordered persistence on every committed canvas change ---
  // Reliability is more important than minimizing IndexedDB writes: each change is snapshotted
  // immediately and writes are serialized so an older async save can never overwrite a newer one.
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !activePlanPageId) return;
    let disposed = false;

    const saveSnapshot = async () => {
      if (isHydratingRef.current || disposed) return;
      const json = engine.serializeDrawingState();
      const parsed = JSON.parse(json) as { objects?: unknown[] };
      const previous = lastSavedJsonRef.current ? JSON.parse(lastSavedJsonRef.current) as { objects?: unknown[] } : null;
      if ((parsed.objects?.length ?? 0) === 0 && (previous?.objects?.length ?? 0) > 0) {
        setSaveStatus('unsaved');
        setLoadError('Safety stop: PlanDroid blocked an empty canvas from overwriting your saved job.');
        throw new Error('Empty drawing overwrite blocked');
      }
      setSaveStatus('saving');
      await saveCanvasState(activePlanPageId, json);
      const verified = await db.planPages.get(activePlanPageId);
      if (!verified?.canvasJSON || verified.canvasJSON !== json) throw new Error('Saved drawing could not be verified.');
      lastSavedJsonRef.current = json;
      if (!disposed) {
        setLoadError(null);
        setSaveStatus('saved');
      }
    };

    const queueSave = () => {
      if (isHydratingRef.current || disposed) return;
      setSaveStatus('unsaved');
      saveQueueRef.current = saveQueueRef.current
        .catch(() => undefined)
        .then(saveSnapshot)
        .catch((err) => {
          if (!disposed) {
            setSaveStatus('unsaved');
            setLoadError(err instanceof Error ? `SAVE FAILED: ${err.message}` : 'SAVE FAILED');
          }
        });
    };

    saveNowRef.current = async () => {
      if (isHydratingRef.current) throw new Error('Project is still loading.');
      // Wait for any queued autosave, then capture and verify the current canvas.
      await saveQueueRef.current.catch(() => undefined);
      await saveSnapshot();
    };

    engine.canvas.on('object:added', queueSave);
    engine.canvas.on('object:modified', queueSave);
    engine.canvas.on('object:removed', queueSave);
    return () => {
      // queueSave has already snapshotted every committed Fabric event; don't dispose until
      // the queued IndexedDB writes have been allowed to complete.
      disposed = true;
      engine.canvas.off('object:added', queueSave);
      engine.canvas.off('object:modified', queueSave);
      engine.canvas.off('object:removed', queueSave);
      saveNowRef.current = null;
    };
  }, [activePlanPageId]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (saveStatus !== 'unsaved') return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [saveStatus]);

  async function handleSaveNow(): Promise<boolean> {
    if (!saveNowRef.current || !activePlanPageId) {
      setSaveStatus('unsaved');
      setLoadError('Save is not ready yet. Your drawing has not been discarded.');
      return false;
    }
    try {
      await saveNowRef.current();
      const verified = await db.planPages.get(activePlanPageId);
      if (!verified?.canvasJSON || verified.canvasJSON !== lastSavedJsonRef.current) {
        throw new Error('PlanDroid could not verify the saved drawing.');
      }
      setLoadError(null);
      setSaveStatus('saved');
      return true;
    } catch (err) {
      setSaveStatus('unsaved');
      setLoadError(err instanceof Error ? `SAVE FAILED: ${err.message}` : 'SAVE FAILED: drawing was not verified.');
      return false;
    }
  }

  async function handleLeaveProjects() {
    if (saveStatus === 'unsaved') {
      const save = window.confirm('You have unsaved changes. Press OK to SAVE & LEAVE, or Cancel to stay on this project.');
      if (!save) return;
      const saved = await handleSaveNow();
      if (!saved) return;
    } else {
      const saved = await handleSaveNow();
      if (!saved) return;
    }
    setActiveProject(null);
  }

  async function handleFileLoad(file: File) {
    if (!activePlanPageId || !engineRef.current) return;
    if (!isSupportedFloorPlanFile(file)) {
      setLoadError(`Unsupported file type: ${file.name}`);
      return;
    }
    const engine = engineRef.current;
    const hasDrawing = engine.canvas.getObjects().some((o) => !o.excludeFromExport);
    if ((planPage?.backgroundImage || hasDrawing) &&
      !window.confirm('Replace the floor plan? Your drawing is kept, but the scale is reset and must be recalibrated.')) return;
    setIsLoadingFile(true);
    setLoadError(null);
    try {
      const { blob, widthPx, heightPx } = await loadFloorPlanFile(file);
      await setBackgroundImage(activePlanPageId, blob, widthPx, heightPx);

      if (backgroundObjectUrlRef.current) URL.revokeObjectURL(backgroundObjectUrlRef.current);
      const url = URL.createObjectURL(blob);
      backgroundObjectUrlRef.current = url;

      await engine.loadBackgroundImage(url, widthPx, heightPx);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load floor plan');
    } finally {
      setIsLoadingFile(false);
    }
  }

  async function handleSketchUpload(file: File) {
    if (!activePlanPageId || !engineRef.current) return;
    try {
      const { blob, widthPx, heightPx } = await loadFloorPlanFile(file);
      await setSketchOverlay(activePlanPageId, blob, widthPx, heightPx);
      if (sketchObjectUrlRef.current) URL.revokeObjectURL(sketchObjectUrlRef.current);
      const url = URL.createObjectURL(blob);
      sketchObjectUrlRef.current = url;
      await engineRef.current.loadSketchOverlay(url, widthPx, heightPx, 0.35);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load sketch');
    }
  }

  async function handleSketchOpacityChange(opacity: number) {
    if (!activePlanPageId) return;
    engineRef.current?.setSketchOpacity(opacity);
    await setSketchOpacity(activePlanPageId, opacity);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileLoad(file);
  }

  function handleToolChange(mode: ToolMode) {
    setActiveTool(mode);
    engineRef.current?.setToolMode(mode);
    if (mode !== 'place-component') setPendingComponentId(null);
  }

  function handleSelectComponent(componentId: string) {
    setPendingComponentId(componentId);
    handleToolChange('place-component');
  }

  function handlePlanEditToggle() {
    const next = !isPlanEditing;
    if (!engineRef.current?.setBackgroundPlanEditing(next)) {
      setLoadError('Upload a floor plan first, then you can move or resize it.');
      return;
    }
    setIsPlanEditing(next);
    if (!next) setShowPlanHelp(false);
    handleToolChange('select');
  }


  async function handleCalibrationConfirm(mm: number) {
    if (!pendingCalibration || !activePlanPageId || !engineRef.current) return;
    await setPageScale(activePlanPageId, [pendingCalibration.p1, pendingCalibration.p2], mm);
    engineRef.current.applyCalibrationLabel(mm);
    setPendingCalibration(null);
    handleToolChange('select');
  }

  function handleCalibrationCancel() {
    engineRef.current?.cancelCalibrationDraft();
    setPendingCalibration(null);
  }

  async function handleWallDimensionConfirm(mm: number) {
    if (!wallEdgeSelection || !engineRef.current || !activePlanPageId) return;
    const engine = engineRef.current;
    const pxPerMm = pxPerMmRef.current;

    if (!pxPerMm) {
      // No scale established yet — this wall's current (rough) pixel length now defines it.
      await setPageScale(activePlanPageId, [wallEdgeSelection.p1, wallEdgeSelection.p2], mm);
    } else {
      const vertices = getTraceVertices(engine.canvas, wallEdgeSelection.objId);
      if (vertices) {
        const newVertices = applyWallLength(vertices, wallEdgeSelection.edgeIndex, mm * pxPerMm);
        rebuildTracedRoom(engine.canvas, wallEdgeSelection.objId, newVertices, pxPerMm);
      }
    }
    setWallEdgeSelection(null);
    setWallPopoverScreen(null);
  }

  function handleAssignZone(zoneId: string | null, color: string | null) {
    if (!roomSelection || !engineRef.current) return;
    applyZoneToRoom(engineRef.current.canvas, roomSelection.objId, zoneId && color ? { id: zoneId, color } : null, pxPerMmRef.current);
    setRoomSelection(null);
  }

  const scalePxPerMm = planPage?.scale.pxPerMm ?? null;
  const isDuctTool = activeTool === 'duct-rigid' || activeTool === 'duct-flex';

  return (
    <div className="h-full flex flex-col">
      <header className="border-b border-slate-700 bg-slate-950">
        <div className="flex items-center gap-2 px-3 py-2 overflow-x-auto">
          <button className="text-xs text-slate-400 hover:text-slate-200 shrink-0" onClick={handleLeaveProjects}>← Projects</button>
          {(['PLAN','HVAC','DUCT','FITTINGS','OUTLETS','CONTROLS','NOTES','EXPORT'] as const).map((tab) => (
            <button key={tab} onClick={() => setActiveRibbon(tab)}
              className={`text-xs font-semibold px-3 py-1.5 rounded shrink-0 ${activeRibbon===tab?'bg-sky-600':'bg-slate-800 hover:bg-slate-700'}`}>{tab}</button>
          ))}
          <div className="flex-1" />
          <span className="text-xs font-mono text-slate-400 shrink-0">{zoomPct}%</span>
        </div>
        <div className="flex items-center gap-2 px-3 py-2 border-t border-slate-800 overflow-x-auto">
          <button onClick={() => handleToolChange('select')} className="text-xs px-2.5 py-1 rounded bg-slate-800 shrink-0">Select</button>
          <button onClick={handleSaveNow} className="text-xs px-2.5 py-1 rounded bg-emerald-700 hover:bg-emerald-600 shrink-0">{saveStatus==='saving'?'Saving…':saveStatus==='unsaved'?'SAVE •':'SAVE ✓'}</button>
          <button onClick={() => engineRef.current?.undo()} className="text-xs px-2.5 py-1 rounded bg-slate-800 shrink-0">Undo</button>
          <button onClick={() => engineRef.current?.deleteSelection()} className="text-xs px-2.5 py-1 rounded bg-red-900/70 hover:bg-red-800 shrink-0">Delete</button>
          <button onClick={() => engineRef.current?.duplicateSelection()} className="text-xs px-2.5 py-1 rounded bg-slate-800 shrink-0">Copy</button>
          <button onClick={() => engineRef.current?.setSelectionLocked(true)} className="text-xs px-2.5 py-1 rounded bg-slate-800 shrink-0">🔒 Lock</button>
          <button onClick={() => engineRef.current?.setSelectionLocked(false)} className="text-xs px-2.5 py-1 rounded bg-slate-800 shrink-0">🔓 Unlock</button>
          <label className="text-xs px-2 py-1 rounded bg-slate-800 flex items-center gap-1 shrink-0">Darkness
            <input type="range" min="0" max="100" defaultValue="0" onChange={(e)=>engineRef.current?.setSelectionDarknessLevel(Number(e.target.value))} className="w-20"/>
          </label>
          {activeRibbon==='PLAN' && <>
            <button onClick={()=>fileInputRef.current?.click()} className="text-xs px-2.5 py-1 rounded bg-slate-800 shrink-0">Upload Plan</button>
            <button onClick={()=>handleToolChange('calibrate')} className="text-xs px-2.5 py-1 rounded bg-slate-800 shrink-0">Calibrate</button>
            <button onClick={handlePlanEditToggle} className="text-xs px-2.5 py-1 rounded bg-slate-800 shrink-0">{isPlanEditing?'Lock Plan':'Move / Resize Plan'}</button>
          </>}
          {activeRibbon==='HVAC' && <button onClick={()=>setShowPalette(true)} className="text-xs px-2.5 py-1 rounded bg-sky-700 shrink-0">Indoor / Outdoor Units</button>}
          {activeRibbon==='DUCT' && <>
            <button onClick={()=>handleToolChange('duct-rigid')} className="text-xs px-2.5 py-1 rounded bg-slate-800 shrink-0">Rigid Duct</button>
            <button onClick={()=>handleToolChange('duct-flex')} className="text-xs px-2.5 py-1 rounded bg-slate-800 shrink-0">Flex Connector</button>
            <button onClick={()=>setShowDuctColors(true)} className="text-xs px-2.5 py-1 rounded bg-slate-800 shrink-0">Colours</button>
          </>}
          {(activeRibbon==='FITTINGS'||activeRibbon==='OUTLETS'||activeRibbon==='CONTROLS') && <button onClick={()=>setShowPalette(true)} className="text-xs px-2.5 py-1 rounded bg-sky-700 shrink-0">Components</button>}
          {activeRibbon==='CONTROLS' && <button onClick={()=>setShowZonesManager(true)} className="text-xs px-2.5 py-1 rounded bg-slate-800 shrink-0">Zones</button>}
          {activeRibbon==='EXPORT' && <>
            <button onClick={()=>setShowSchedule(true)} className="text-xs px-2.5 py-1 rounded bg-slate-800 shrink-0">Schedule</button>
            <button onClick={()=>setShowBom(true)} className="text-xs px-2.5 py-1 rounded bg-slate-800 shrink-0">BOM & Costing</button>
            <button onClick={()=>setShowExport(true)} className="text-xs px-2.5 py-1 rounded bg-sky-700 shrink-0">Export PDF</button>
          </>}
          {isDuctTool&&!scalePxPerMm&&<span className="text-xs text-amber-400 shrink-0">Sketch mode</span>}
          <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,application/pdf" className="hidden"
            onChange={(e)=>{const file=e.target.files?.[0]; if(file) handleFileLoad(file); e.target.value='';}}/>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        <div
          ref={containerRef}
          className="relative flex-1 min-w-0"
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
        >
          <canvas ref={canvasElRef} />

          {isPlanEditing && showPlanHelp && (
            <div className="absolute top-3 left-3 max-w-xs bg-amber-500 text-slate-950 text-xs font-medium px-3 py-2 rounded shadow-lg">
              <button onClick={()=>setShowPlanHelp(false)} className="float-right ml-2 font-bold">×</button>
              Drag the plan to reposition or resize it, then press “Lock Plan”.
            </div>
          )}

          <SketchOverlayControls
            hasSketch={Boolean(planPage?.sketchImage)}
            opacity={planPage?.sketchOpacity ?? 0.35}
            onUpload={handleSketchUpload}
            onOpacityChange={handleSketchOpacityChange}
          />

          {isDuctTool && (
            <DuctToolOptions
              mode={activeTool as 'duct-rigid' | 'duct-flex'}
              widthMm={ductParams.widthMm}
              depthMm={ductParams.depthMm}
              diameterMm={ductParams.diameterMm}
              ductFunction={ductParams.ductFunction}
              onChange={setDuctParams}
            />
          )}

          {wallEdgeSelection && wallPopoverScreen && (
            <WallDimensionPopover
              screenX={wallPopoverScreen.x}
              screenY={wallPopoverScreen.y}
              currentLengthPx={wallEdgeSelection.currentLengthPx}
              pxPerMm={scalePxPerMm}
              onConfirm={handleWallDimensionConfirm}
              onCancel={() => {
                setWallEdgeSelection(null);
                setWallPopoverScreen(null);
              }}
            />
          )}

          {roomSelection && activeProjectId && (
            <ZoneAssignPopover
              projectId={activeProjectId}
              screenX={roomSelection.screenX}
              screenY={roomSelection.screenY}
              currentZoneId={roomSelection.currentZoneId}
              onAssign={handleAssignZone}
            />
          )}

          {isDragOver && (
            <div className="absolute inset-0 bg-sky-600/20 border-2 border-dashed border-sky-400 flex items-center justify-center pointer-events-none">
              <span className="text-sm font-mono">Drop floor plan (PNG / JPG / PDF)</span>
            </div>
          )}

          {isLoadingFile && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <span className="text-sm font-mono">Loading floor plan…</span>
            </div>
          )}

          {loadError && (
            <div className="absolute bottom-3 left-3 bg-red-900/90 border border-red-600 text-red-100 text-xs px-3 py-2 rounded">
              {loadError}
            </div>
          )}

          {!planPage?.backgroundImage && !planPage?.sketchImage && !isLoadingFile && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="text-sm text-slate-500">Drag &amp; drop a floor plan, or click "Upload Floor Plan"</span>
            </div>
          )}
        </div>

        {showPalette && (
          <ComponentPalette
            pendingComponentId={pendingComponentId}
            onSelect={handleSelectComponent}
            onCancel={() => handleToolChange('select')}
            section={activeRibbon === 'FITTINGS' || activeRibbon === 'OUTLETS' || activeRibbon === 'CONTROLS' ? activeRibbon : 'HVAC'}
          />
        )}
      </div>

      {pendingCalibration && (
        <CalibrationModal onConfirm={handleCalibrationConfirm} onCancel={handleCalibrationCancel} />
      )}

      {showBom && activeProjectId && (
        <BomPanel
          projectId={activeProjectId}
          activePlanPageId={activePlanPageId}
          getLiveCanvasJson={() => engineRef.current ? JSON.parse(engineRef.current.serializeDrawingState()) : null}
          onClose={() => setShowBom(false)}
        />
      )}

      {showSchedule && activeProjectId && (
        <SystemSchedulePanel
          projectId={activeProjectId}
          getCanvas={() => engineRef.current?.canvas ?? null}
          onClose={() => setShowSchedule(false)}
        />
      )}

      {showDuctColors && activeProjectId && (
        <DuctColorsDialog
          projectId={activeProjectId}
          activePlanPageId={activePlanPageId}
          getLiveCanvasJson={() => engineRef.current?.canvas.toObject(['plandroid', 'plandroidId']) ?? null}
          onClose={() => setShowDuctColors(false)}
        />
      )}

      {showZonesManager && activeProjectId && (
        <ZonesManagerDialog projectId={activeProjectId} onClose={() => setShowZonesManager(false)} />
      )}

      {showCompanySettings && <CompanySettingsDialog onClose={() => setShowCompanySettings(false)} />}

      {showImporter && <ExcelImporterDialog onClose={() => setShowImporter(false)} />}

      {showExport && activeProjectId && project && (
        <ExportDialog
          projectId={activeProjectId}
          projectName={project.name}
          designer={project.designer}
          revision={project.revision}
          unitSystem={project.unitSystem}
          pxPerMm={scalePxPerMm}
          activePlanPageId={activePlanPageId}
          getCanvas={() => engineRef.current?.canvas ?? null}
          onClose={() => setShowExport(false)}
        />
      )}
    </div>
  );
}
